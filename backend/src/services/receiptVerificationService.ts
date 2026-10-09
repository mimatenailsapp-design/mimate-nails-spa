import axios from 'axios';
import { supabase } from '../config/supabase.js';

export interface ResultadoVerificacionIA {
  es_comprobante_bancario?: boolean;
  es_valido: boolean;
  es_sospechoso_fraude: boolean;
  monto_detectado?: number;
  referencia_detectada?: string;
  destinatario_detectado?: string;
  fecha_detectada?: string;
  indicios_fraude: string[];
  explicacion: string;
  confianza: 'ALTA' | 'MEDIA' | 'BAJA';
}

export class ReceiptVerificationService {
  /**
   * Descarga la imagen enviada por el cliente desde los servidores de Meta
   */
  static async descargarImagenMeta(mediaId: string, customToken?: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const token = customToken || process.env.WHATSAPP_TOKEN;
    if (!token || !mediaId) return null;

    try {
      // 1. Obtener la URL temporal de descarga del medio en Meta Graph API
      const metaRes = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const mediaUrl = metaRes.data?.url;
      const mimeType = metaRes.data?.mime_type || 'image/jpeg';
      if (!mediaUrl) return null;

      // 2. Descargar los bytes binarios de la imagen
      const imgRes = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
      });

      return {
        buffer: Buffer.from(imgRes.data),
        mimeType,
      };
    } catch (error: any) {
      console.error('Error descargando imagen de comprobante desde Meta:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Analiza el comprobante con Google Gemini Flash Multimodal (Visión + Detección de Fraude)
   */
  static async analizarComprobante(
    imageBuffer: Buffer,
    mimeType: string,
    montoEsperado: number,
    cuentaEsperada?: string,
    titularEsperado?: string
  ): Promise<ResultadoVerificacionIA> {
    const apiKey = process.env.GEMINI_API_KEY;

    // Si no hay API key configurada, se delega limpiamente a Opción A (Aprobación Manual en Visor)
    if (!apiKey) {
      return {
        es_valido: false,
        es_sospechoso_fraude: false,
        indicios_fraude: [],
        explicacion: 'No hay GEMINI_API_KEY configurada. Se deriva a verificación manual en visor.',
        confianza: 'BAJA',
      };
    }

    try {
      const base64Data = imageBuffer.toString('base64');

      const prompt = `Eres un auditor bancario experto en detección de fraudes de comprobantes de pago en Colombia (especialmente Nequi, Daviplata, Bancolombia, dale!, Bre-B).
Analiza detalladamente esta imagen de comprobante de transferencia y determina:

DATOS A EXTRAER:
1. Monto transferido (número limpio, ej: 50000).
2. Número de referencia / ID de transacción (ej: M1234567, 10982736, etc.).
3. Nombre y número del destinatario / cuenta a la que llegó el dinero.
4. Fecha y hora de la transacción.
5. Estado de la transacción (¿Dice "Exitoso", "Envío exitoso", "Listo", etc.?).

AUDITORÍA DE FRAUDE Y MANIPULACIÓN:
- ¿Es un comprobante auténtico generado por la app oficial o es una plantilla falsa generada por webs/apps de comprobantes falsos?
- Tipografía y Fuentes: ¿Hay fuentes desalineadas, fuentes genéricas como Arial/Helvetica superpuestas, grosores inconsistentes en el monto o la fecha?
- Píxeles y Compresión: ¿Hay "ruido" o artefactos de compresión diferentes alrededor del valor o de la fecha respecto al resto del fondo?
- Datos esperados:
  * Monto mínimo de anticipo esperado: $${montoEsperado} COP
  ${cuentaEsperada ? `* Cuenta destino oficial esperada: "${cuentaEsperada}"` : ''}
  ${titularEsperado ? `* Nombre titular esperado: "${titularEsperado}"` : ''}

RESPONDE EXCLUSIVAMENTE EN FORMATO JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA:
{
  "es_comprobante_bancario": boolean,
  "es_valido": boolean,
  "es_sospechoso_fraude": boolean,
  "monto_detectado": number | null,
  "referencia_detectada": string | null,
  "destinatario_detectado": string | null,
  "fecha_detectada": string | null,
  "indicios_fraude": string[],
  "explicacion": string,
  "confianza": "ALTA" | "MEDIA" | "BAJA"
}`;

      // Lista de modelos ordenados por modernidad y precisión en visión (todos con capa gratuita en Google AI Studio)
      const modelosDisponibles = [
        process.env.GEMINI_MODEL,
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-1.5-flash',
      ].filter(Boolean) as string[];

      let response: any = null;
      let ultimoError: any = null;

      for (const modelo of modelosDisponibles) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
          response = await axios.post(
            endpoint,
            {
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: base64Data,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.1,
                response_mime_type: 'application/json',
              },
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
          );

          if (response?.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.log(`✅ Comprobante auditado con éxito usando modelo: ${modelo}`);
            break;
          }
        } catch (e: any) {
          ultimoError = e;
          console.warn(`Aviso: Intento con ${modelo} no disponible (${e.response?.status || e.message}), probando siguiente modelo...`);
        }
      }

      if (!response) {
        throw ultimoError || new Error('No se pudo procesar el comprobante con los modelos de Gemini disponibles');
      }

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Respuesta vacía de Gemini Flash');
      }

      const parsed = JSON.parse(rawText);

      // Verificación de monto suficiente
      const montoOk = parsed.monto_detectado && parsed.monto_detectado >= montoEsperado * 0.95; // margen de tolerancia del 5%
      const esValidoFinal = Boolean(parsed.es_valido && montoOk && !parsed.es_sospechoso_fraude);

      return {
        es_comprobante_bancario: parsed.es_comprobante_bancario !== false,
        es_valido: esValidoFinal,
        es_sospechoso_fraude: Boolean(parsed.es_sospechoso_fraude),
        monto_detectado: parsed.monto_detectado || undefined,
        referencia_detectada: parsed.referencia_detectada || undefined,
        destinatario_detectado: parsed.destinatario_detectado || undefined,
        fecha_detectada: parsed.fecha_detectada || undefined,
        indicios_fraude: parsed.indicios_fraude || [],
        explicacion: parsed.explicacion || 'Análisis completado',
        confianza: parsed.confianza || 'MEDIA',
      };
    } catch (err: any) {
      console.error('Error llamando a Gemini Flash Vision:', err.response?.data || err.message);
      return {
        es_valido: false,
        es_sospechoso_fraude: false,
        indicios_fraude: ['Fallo en servicio de visión IA'],
        explicacion: 'No se pudo procesar la imagen automáticamente. Se deriva al visor web.',
        confianza: 'BAJA',
      };
    }
  }

  /**
   * Valida si un número de referencia ya fue utilizado para evitar ataques de repetición (Replay Attacks)
   */
  static async esReferenciaDuplicada(referencia: string): Promise<boolean> {
    if (!referencia || referencia.length < 4) return false;
    try {
      const { data } = await supabase
        .from('pagos_anticipos')
        .select('id')
        .eq('referencia_transaccion', referencia.trim())
        .limit(1);

      return Boolean(data && data.length > 0);
    } catch {
      return false;
    }
  }
}
