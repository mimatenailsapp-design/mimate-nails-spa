import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Complejo } from './bookingService.js';

export interface ComplejoKnowledge {
  nombre?: string;
  parqueadero?: string;
  calzado?: string;
  servicios?: string;
  eventos?: string;
  telefono_admin?: string;
  informacion_libre?: string;
}

export interface ReceptionistResponse {
  esPreguntaOAtencion: boolean;
  esSolicitudHumano?: boolean;
  respuestaTexto?: string;
}

export class AIReceptionistService {
  /**
   * Determina si el texto del usuario es una solicitud de hablar con un humano
   */
  static esSolicitudHumano(texto: string): boolean {
    const t = texto.toLowerCase().trim();
    const patrones = [
      'humano',
      'persona',
      'asesor',
      'asesora',
      'encargado',
      'encargada',
      'administrador',
      'administradora',
      'admin',
      'dueno',
      'dueño',
      'recepcionista',
      'alguien real',
      'hablar con alguien',
      'hablar con un asesor',
      'hablar con un encargado',
      'hablar con el encargado',
      'hablar con la encargada',
      'hablar con encargado',
      'hablar con asesor',
      'contacto_asesor',
      'atencion al cliente',
      'atencion personalizada',
      'queja',
      'reclamo',
      'contacto humano',
      'soporte',
      'ayuda',
      'contacto',
      'comunicarme con un asesor',
      'comunicarme con un encargado',
      'comunicarme con alguien',
      'comunicar con asesor',
      'comunicar con encargado',
      'numero de contacto',
      'linea de atencion',
      'llamar',
      'telefono',
      'whatsapp del encargado',
    ];
    return patrones.some((p) => t.includes(p));
  }

  /**
   * Determina si el texto es una pregunta libre frecuente sobre el establecimiento
   */
  static esPreguntaFrecuente(texto: string): boolean {
    const t = texto.toLowerCase().trim();
    const palabrasClave = [
      'parqueadero',
      'estacionamiento',
      'carro',
      'moto',
      'guayo',
      'guayos',
      'tache',
      'taches',
      'calzado',
      'zapatos',
      'vestier',
      'vestieres',
      'ducha',
      'duchas',
      'baño',
      'banos',
      'donde',
      'ubicacion',
      'direccion',
      'como llegar',
      'queda',
      'unas',
      'uñas',
      'manicura',
      'pedicura',
      'semipermanente',
      'acrilico',
      'tarjeta',
      'transferencia',
      'efectivo',
      'abono',
      'anticipo',
      'torneo',
      'cumpleaños',
      'evento',
      'alquilan',
      'precios',
      'cuanto vale',
    ];
    return palabrasClave.some((p) => t.includes(p));
  }

  /**
   * Procesa la consulta usando IA (Gemini Flash) o reglas directas
   */
  static async responderConsulta(texto: string, complejo: Complejo): Promise<ReceptionistResponse> {
    const t = texto.toLowerCase().trim();

    // 1. DERIVACIÓN A ASESOR / ENCARGADO HUMANO
    if (this.esSolicitudHumano(t)) {
      const telAdmin = complejo.telefono_whatsapp || 'la administración';
      const telNumeros = (complejo.telefono_whatsapp || '').replace(/\D/g, '');
      const enlaceWa = telNumeros.length >= 10 ? `https://wa.me/${telNumeros}` : null;

      const respuestaTexto =
        `👨‍💼 *Atención con un Asesor / Encargado - ${complejo.nombre}*\n\n` +
        `¡Entendido! He registrado tu solicitud para que un encargado de *${complejo.nombre}* se comunique contigo 📱.\n\n` +
        `📞 *Línea de contacto directo de la administración:*\n` +
        `• Teléfono: *${telAdmin}*\n` +
        (enlaceWa ? `• WhatsApp directo: ${enlaceWa}\n\n` : '\n') +
        `✍️ Puedes dejar tu consulta o mensaje detallado por este chat y nuestro equipo te responderá a la brevedad.\n\n` +
        `🤖 *¿Deseas volver a reservar automáticamente?*\n` +
        `Escribe *HOLA* o *MENU* en cualquier momento.`;

      return {
        esPreguntaOAtencion: true,
        esSolicitudHumano: true,
        respuestaTexto,
      };
    }

    // 2. PREGUNTAS FRECUENTES DEL COMPLEJO
    if (!this.esPreguntaFrecuente(t) && !t.includes('?')) {
      return { esPreguntaOAtencion: false };
    }

    // Si hay Gemini API Key configurada, usar IA conversacional
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const respuestaIA = await this.consultarGemini(texto, complejo, apiKey);
        if (respuestaIA) {
          return {
            esPreguntaOAtencion: true,
            respuestaTexto: respuestaIA,
          };
        }
      } catch (err: any) {
        console.error('Error consultando Gemini FAQ:', err.message);
      }
    }

    // Fallback inteligente sin IA (Reglas precisas del negocio en Colombia)
    const respuestaReglas = this.generarRespuestaPorReglas(t, complejo);
    return {
      esPreguntaOAtencion: true,
      respuestaTexto: respuestaReglas,
    };
  }

  /**
   * Obtiene la base de conocimiento específica y personalizada de este complejo
   */
  static getConocimientoComplejo(complejo: Complejo): ComplejoKnowledge {
    try {
      const filePath = path.resolve(process.cwd(), 'data', 'complejos_faq.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (data[complejo.id]) return data[complejo.id];
        if (complejo.slug && data[complejo.slug]) return data[complejo.slug];
      }
    } catch (e) {
      // Ignorar fallback
    }

    return {
      nombre: complejo.nombre,
      parqueadero: 'Disponibilidad de parqueadero cercano para clientes en la zona.',
      calzado: 'Instalaciones cómodas y climatizadas para tu mayor relajación.',
      servicios: 'Manicura tradicional, pedicure tradicional, semipermanente, base ruber, dipping, press on, acrílico esculpido, polygel y recubrimiento.',
      eventos: 'Atención personalizada para citas individuales o grupos previa reserva.',
      telefono_admin: complejo.telefono_whatsapp,
    };
  }

  /**
   * Guarda o actualiza la base de conocimiento de un complejo específico
   */
  static guardarConocimientoComplejo(complejoId: string, knowledge: ComplejoKnowledge): void {
    try {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const filePath = path.join(dataDir, 'complejos_faq.json');
      let data: Record<string, ComplejoKnowledge> = {};
      if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      data[complejoId] = { ...data[complejoId], ...knowledge };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error guardando conocimiento del complejo:', e);
    }
  }

  /**
   * Consulta a Google Gemini Flash con el contexto específico de JL Mímate Nails Spa
   */
  private static async consultarGemini(pregunta: string, complejo: Complejo, apiKey: string): Promise<string | null> {
    const apertura = complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '08:00';
    const cierre = complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '19:00';
    const direccion = complejo.direccion || 'Pereira, Cuba (Calle 66 bis #26-57)';
    const ciudad = complejo.ciudad || 'Pereira, Colombia';
    const info = this.getConocimientoComplejo(complejo);
    const entidad = 'del spa y salón de uñas';
    const baseUrl = process.env.FRONTEND_URL || 'https://mimate-nails-spa.vercel.app';
    const invitacionFinal = `Para agendar tu cita, abre nuestra agenda directamente en: ${baseUrl} 🌸💅.`;

    const prompt = `Eres el asistente virtual amable, cordial y profesional ${entidad} "${complejo.nombre}" en ${ciudad}, Colombia.
Responde de forma clara, concisa (máximo 2 a 3 oraciones) a la siguiente pregunta del cliente por WhatsApp:

DATOS Y REGLAS EXCLUSIVAS DE ESTE NEGOCIO:
- Nombre: ${complejo.nombre}
- Ubicación: ${direccion}, ${ciudad}
- Horarios de atención: de ${apertura} a ${cierre}
- Parqueadero/Entrega: ${info.parqueadero}
- Vestimenta/Calzado: ${info.calzado}
- Servicios ofrecidos: ${info.servicios}
- Eventos o planes especiales: ${info.eventos || 'Disponibilidad sujeta a previa reserva.'}
- Reservas: 100% automáticas las 24 horas a través de este mismo WhatsApp o la web.

PREGUNTA DEL CLIENTE:
"${pregunta}"

INSTRUCCIONES:
- Responde con tono colombiano amable, cálido, femenino, respetuoso y profesional para un spa de uñas.
- Basado estrictamente en las reglas exclusivas de este spa.
- Termina siempre invitando cordialmente a agendar con: "${invitacionFinal}"`;

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

    for (const modelo of modelosDisponibles) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const res = await axios.post(
          endpoint,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 250 },
          },
          { timeout: 8000 }
        );

        const respuesta = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (respuesta) return respuesta;
      } catch (e: any) {
        // Fallback al siguiente modelo de la lista
      }
    }

    return null;
  }

  /**
   * Respuestas estructuradas directas usando la ficha exclusiva de cada complejo
   */
  private static generarRespuestaPorReglas(t: string, complejo: Complejo): string {
    let pie = `\n\n¿Deseas agendar tu cita en el spa? Escribe *HOLA* o *MENU* para ver manicuristas y horarios 💅✨.`;
    let labelEventos = `💅 *Planes y Eventos en ${complejo.nombre}:*\n`;

    const info = this.getConocimientoComplejo(complejo);

    if (t.includes('parqueadero') || t.includes('estacionamiento') || t.includes('carro') || t.includes('moto')) {
      return `🚗 *Parqueadero en ${complejo.nombre}:*\n${info.parqueadero}` + pie;
    }

    if (t.includes('guayo') || t.includes('tache') || t.includes('calzado') || t.includes('zapato')) {
      return `👟 *Calzado y vestimenta en ${complejo.nombre}:*\n${info.calzado}` + pie;
    }

    if (t.includes('ducha') || t.includes('vestier') || t.includes('baño') || t.includes('banos')) {
      return `🚿 *Servicios e Instalaciones en ${complejo.nombre}:*\n${info.servicios}` + pie;
    }

    if (t.includes('donde') || t.includes('ubicacion') || t.includes('direccion') || t.includes('llegar') || t.includes('queda')) {
      return `📍 *Ubicación de ${complejo.nombre}:*\nNos encontramos en *${complejo.direccion}*, ${complejo.ciudad}. ¡Te esperamos!` + pie;
    }

    if (t.includes('unas') || t.includes('uñas') || t.includes('manicura') || t.includes('pedicura') || t.includes('acrilico') || t.includes('semipermanente') || t.includes('servicio')) {
      return `✨ *Servicios en ${complejo.nombre}:*\n${info.servicios}` + pie;
    }

    if (t.includes('cumpleaños') || t.includes('evento') || t.includes('boda') || t.includes('novia') || t.includes('grado')) {
      return `${labelEventos}${info.eventos || 'Disponibilidad de atención especial previa cita y coordinación.'}` + pie;
    }

    const apertura = complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '08:00';
    const cierre = complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '19:00';
    const direccion = complejo.direccion || 'Pereira, Cuba (Calle 66 bis #26-57)';

    return `🌸 *Información de ${complejo.nombre}*\nAtendemos de lunes a sábado de ${apertura} a ${cierre} en ${direccion}.\n\nPara consultar disponibilidad o agendar tu cita con tu especialista favorita, escribe *HOLA* 💕💅.`;
  }
}
