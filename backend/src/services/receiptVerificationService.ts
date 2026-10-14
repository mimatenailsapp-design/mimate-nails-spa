import axios from 'axios';
import { supabase } from '../config/supabase.js';

export interface ResultadoVerificacionIA {
  es_comprobante_bancario?: boolean;
  cuenta_coincide?: boolean;
  fecha_coincide?: boolean;
  monto_coincide?: boolean;
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
   * Deprecado: Las imágenes ahora se reciben y descargan directamente desde Baileys
   */
  static async descargarImagenMeta(_mediaId: string, _customToken?: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    return null;
  }

  /**
   * Obtiene la fecha actual en zona horaria de Colombia en formato 'YYYY-MM-DD'
   */
  private static obtenerFechaActualCol(): { yyyyMmDd: string; dia: string; mes: string; anio: string; fechaTexto: string } {
    const ahora = new Date();
    const formatter = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const partes = formatter.formatToParts(ahora);
    const anio = partes.find((p) => p.type === 'year')?.value || '';
    const mes = partes.find((p) => p.type === 'month')?.value || '';
    const dia = partes.find((p) => p.type === 'day')?.value || '';
    const yyyyMmDd = `${anio}-${mes}-${dia}`;
    const fechaTexto = `${dia}/${mes}/${anio}`;
    return { yyyyMmDd, dia, mes, anio, fechaTexto };
  }

  /**
   * Analiza el comprobante con Google Gemini Flash Multimodal (Visión + Detección de Fraude)
   */
  static async analizarComprobante(
    imageBuffer: Buffer,
    mimeType: string,
    montoEsperado: number,
    cuentasEsperadas?: string[] | string,
    titularEsperado?: string
  ): Promise<ResultadoVerificacionIA> {
    const apiKey = process.env.GEMINI_API_KEY;

    // Si no hay API key configurada, se delega limpiamente a Opción A (Aprobación Manual en Visor)
    if (!apiKey) {
      return {
        es_valido: false,
        cuenta_coincide: false,
        fecha_coincide: false,
        monto_coincide: false,
        es_sospechoso_fraude: false,
        indicios_fraude: [],
        explicacion: 'No hay GEMINI_API_KEY configurada. Se deriva a verificación manual en visor.',
        confianza: 'BAJA',
      };
    }

    try {
      const base64Data = imageBuffer.toString('base64');
      const listaCuentas = Array.isArray(cuentasEsperadas)
        ? cuentasEsperadas.filter(Boolean)
        : cuentasEsperadas
        ? [cuentasEsperadas]
        : [];

      const cuentasTexto = listaCuentas.length > 0
        ? listaCuentas.map((c) => `"${c}"`).join(' o ')
        : 'Nequi / Bancolombia oficial del spa';

      const fechaActualInfo = this.obtenerFechaActualCol();

      const prompt = `Eres un auditor bancario experto en detección de fraudes de comprobantes de pago en Colombia (especialmente Nequi, Daviplata, Bancolombia, dale!, Bre-B).
Analiza detalladamente esta imagen de comprobante de transferencia y valida rigurosamente los 3 FILTROS OBLIGATORIOS para confirmar la reserva:

FILTRO 1: CUENTA DE DESTINO (¿A qué cuenta llegó el dinero?)
- El comprobante DEBE ser enviado a una de las cuentas oficiales del negocio: ${cuentasTexto}
- O al titular oficial del negocio: "${titularEsperado || 'JL Mímate Nails'}"
- Si el dinero fue enviado a otra cuenta o a otra persona ajena, "cuenta_coincide" DEBE ser false.

FILTRO 2: FECHA ACTUAL (¿Cuándo se realizó la transferencia?)
- Fecha actual en Colombia hoy: ${fechaActualInfo.dia}/${fechaActualInfo.mes}/${fechaActualInfo.anio} (${fechaActualInfo.yyyyMmDd}).
- La transferencia DEBE ser de HOY (${fechaActualInfo.dia}/${fechaActualInfo.mes}/${fechaActualInfo.anio} o indicación de "Hoy", "${fechaActualInfo.dia} de ...", etc.).
- Comprobantes de fechas anteriores (días, meses o años pasados) son inválidos y "fecha_coincide" DEBE ser false.

FILTRO 3: MONTO SOLICITADO (¿Cuánto dinero transfirió?)
- Monto mínimo de anticipo requerido: $${montoEsperado} COP.
- El valor transferido debe ser igual o superior al anticipo solicitado ($${montoEsperado} COP).
- Si el monto transferido es menor al requerido, "monto_coincide" DEBE ser false.

DATOS A EXTRAER:
1. Monto transferido (número limpio, ej: 50000).
2. Número de referencia / ID de transacción (ej: M1234567, 10982736, etc.).
3. Nombre y número del destinatario / cuenta a la que llegó el dinero (extrae exactamente el número de celular o número de cuenta de destino visible y el nombre del titular destino).
4. Fecha y hora de la transacción (extrae exactamente el texto de la fecha como aparece en la imagen).
5. Estado de la transacción (¿Dice "Exitoso", "Envío exitoso", "Listo", etc.?).

AUDITORÍA DE FRAUDE Y FORMA DUDOSA:
- ¿Es una imagen auténtica de comprobante bancario o una foto ajena (selfie, meme, manos, uñas, objetos)? Si no es soporte bancario, "es_comprobante_bancario": false.
- Si ES comprobante bancario, ¿se ve dudoso por su forma?: ¿Fuentes desalineadas, tipografía genérica superpuesta, fecha/monto pegados encima, recortes sospechosos, artefactos de edición? Si se ve dudoso por su forma o montaje, "es_sospechoso_fraude": true.

RESPONDE EXCLUSIVAMENTE EN FORMATO JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA:
{
  "es_comprobante_bancario": boolean,
  "cuenta_coincide": boolean,
  "fecha_coincide": boolean,
  "monto_coincide": boolean,
  "es_valido": boolean,
  "es_sospechoso_fraude": boolean,
  "monto_detectado": number | null,
  "referencia_detectada": string | null,
  "destinatario_detectado": string | null,
  "fecha_detectada": string | null,
  "indicios_fraude": string[],
  "explicacion": string,
  "confianza": "ALTA" | "MEDIA" | "BAJA"
};`;

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

      // FILTRO 1: CUENTA DE DESTINO (Verificación con lista de cuentas oficiales)
      let cuentaOk = parsed.cuenta_coincide !== false;
      if (listaCuentas.length > 0 && parsed.destinatario_detectado) {
        const destLimpio = String(parsed.destinatario_detectado).replace(/\D/g, '');
        const titularLimpio = (titularEsperado || '').toLowerCase().replace(/[\s\.\-_]/g, '');
        const destTexto = String(parsed.destinatario_detectado).toLowerCase();

        const coincideConCuentas = listaCuentas.some((cta) => {
          const ctaLimpia = String(cta).replace(/\D/g, '');
          return (
            (ctaLimpia.length >= 7 && destLimpio.includes(ctaLimpia)) ||
            (destLimpio.length >= 7 && ctaLimpia.includes(destLimpio)) ||
            destTexto.includes(cta.toLowerCase().trim())
          );
        });

        const coincideConTitular = titularLimpio.length >= 4 && (
          destTexto.includes(titularLimpio) ||
          destTexto.includes('mimate') ||
          destTexto.includes('jl mimate')
        );

        if (parsed.cuenta_coincide === false || (!coincideConCuentas && !coincideConTitular && destLimpio.length >= 7)) {
          cuentaOk = false;
        }
      }

      // FILTRO 2: FECHA ACTUAL (Transferencia realizada el día de hoy)
      let fechaOk = parsed.fecha_coincide !== false;
      if (parsed.fecha_detectada) {
        const fDet = String(parsed.fecha_detectada).toLowerCase();
        const diaNum = fechaActualInfo.dia;
        const anioNum = fechaActualInfo.anio;

        const esHoyTexto = fDet.includes('hoy');
        const tieneDia = fDet.includes(diaNum) || fDet.includes(String(parseInt(diaNum, 10)));
        const tieneAnio = fDet.includes(anioNum) || fDet.includes(anioNum.slice(-2));

        if (parsed.fecha_coincide === false) {
          fechaOk = false;
        } else if (!esHoyTexto && (!tieneDia || !tieneAnio)) {
          fechaOk = false;
        }
      }

      // FILTRO 3: MONTO SOLICITADO (Igual o superior al anticipo requerido)
      const montoDetectado = Number(parsed.monto_detectado || 0);
      let montoOk = Boolean(parsed.monto_coincide !== false && montoDetectado >= montoEsperado * 0.95);
      if (montoDetectado > 0 && montoDetectado < montoEsperado * 0.95) {
        montoOk = false;
      }

      // Es válido cuando es comprobante bancario, pasa los 3 filtros, no es sospechoso/dudoso y la confianza no es baja
      const esValidoFinal = Boolean(
        parsed.es_comprobante_bancario !== false &&
        cuentaOk &&
        fechaOk &&
        montoOk &&
        !parsed.es_sospechoso_fraude &&
        parsed.confianza !== 'BAJA'
      );

      return {
        es_comprobante_bancario: parsed.es_comprobante_bancario !== false,
        cuenta_coincide: cuentaOk,
        fecha_coincide: fechaOk,
        monto_coincide: montoOk,
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
        cuenta_coincide: false,
        fecha_coincide: false,
        monto_coincide: false,
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
