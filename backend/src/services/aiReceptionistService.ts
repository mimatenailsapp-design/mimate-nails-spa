import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Complejo, getMontoAnticipoFijo } from './bookingService.js';

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
   * Determina si el texto es una pregunta o consulta libre en lenguaje natural sobre el establecimiento
   */
  static esPreguntaFrecuente(texto: string): boolean {
    const t = texto.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t.includes('?') || t.includes('¿')) return true;

    const palabrasClave = [
      // Interrogativos y verbos de consulta natural
      'que',
      'cual',
      'cuales',
      'cuanto',
      'cuantos',
      'como',
      'donde',
      'cuando',
      'quien',
      'quienes',
      'tienen',
      'tienes',
      'hacen',
      'haces',
      'manejan',
      'ofrecen',
      'atienden',
      'abren',
      'cierran',
      'trabajan',
      'aceptan',
      'reciben',
      'cobran',
      'cuesta',
      'cuestan',
      'vale',
      'valen',
      'valor',
      'precio',
      'precios',
      'tarifa',
      'tarifas',
      'costo',
      'costos',
      'demora',
      'dura',
      'duracion',
      'tiempo',
      'horario',
      'horarios',
      'hora',
      'horas',
      'info',
      'informacion',
      'duda',
      'pregunta',
      'consulta',
      // Ubicación y parqueadero
      'parqueadero',
      'estacionamiento',
      'carro',
      'moto',
      'ubicacion',
      'direccion',
      'como llegar',
      'llegar',
      'ubicados',
      'ubicadas',
      'quedan',
      'queda',
      'barrio',
      'sector',
      'cuba',
      'pereira',
      'mapa',
      'maps',
      // Servicios y uñas
      'unas',
      'uñas',
      'manicura',
      'manicure',
      'pedicura',
      'pedicure',
      'semipermanente',
      'semi',
      'acrilico',
      'acrilicas',
      'esculpido',
      'esculpidas',
      'rubber',
      'ruber',
      'base rubber',
      'dipping',
      'press on',
      'press',
      'retoque',
      'barrido',
      'retiro',
      'tradicional',
      'manos',
      'pies',
      'hombre',
      'caballero',
      'niña',
      'nina',
      'dama',
      'servicio',
      'servicios',
      'catalogo',
      'manicurista',
      'manicuristas',
      'especialista',
      'especialistas',
      'profesional',
      // Pagos y políticas
      'tarjeta',
      'transferencia',
      'efectivo',
      'nequi',
      'daviplata',
      'bancolombia',
      'abono',
      'anticipo',
      'seña',
      'garantia',
      'reembolso',
      'devolucion',
      // Instalaciones y eventos
      'calzado',
      'zapatos',
      'vestier',
      'ducha',
      'baño',
      'banos',
      'cumpleanos',
      'evento',
      'boda',
      'novia',
      'grado',
      'domicilio',
      'domicilios',
    ];
    return palabrasClave.some((p) => t.includes(p));
  }

  /**
   * Procesa la consulta usando IA (Gemini) o motor inteligente de lenguaje natural
   */
  static async responderConsulta(
    texto: string,
    complejo: Complejo,
    forzarRespuestaNatural: boolean = false
  ): Promise<ReceptionistResponse> {
    const t = texto.toLowerCase().trim();

    // 1. DERIVACIÓN A ASESOR / ENCARGADO HUMANO
    if (this.esSolicitudHumano(t)) {
      const telAdmin = complejo.telefono_whatsapp || '+57 321 961 0896';
      const telNumeros = (complejo.telefono_whatsapp || '573219610896').replace(/\D/g, '');
      const enlaceWa = telNumeros.length >= 10 ? `https://wa.me/${telNumeros}` : null;

      const respuestaTexto =
        `👩‍💼 *Atención Personalizada - ${complejo.nombre}*\n\n` +
        `¡Claro que sí reina! He notificado a nuestra encargada de *${complejo.nombre}* para que te atienda personalmente 📱.\n\n` +
        `📞 *Contacto directo:*\n` +
        `• WhatsApp / Teléfono: *${telAdmin}*\n` +
        (enlaceWa ? `• Chat directo: ${enlaceWa}\n\n` : '\n') +
        `✍️ Puedes dejar tu inquietud detallada aquí mismo y te responderemos enseguida.\n\n` +
        `📅 _Si deseas volver a ver la agenda automática, escribe *HOLA* o *AGENDA* en cualquier momento._`;

      return {
        esPreguntaOAtencion: true,
        esSolicitudHumano: true,
        respuestaTexto,
      };
    }

    // 2. PREGUNTAS FRECUENTES O LENGUAJE NATURAL DEL COMPLEJO
    if (!forzarRespuestaNatural && !this.esPreguntaFrecuente(t)) {
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

    // Motor NLU local enriquecido para responder con precisión cualquier pregunta en español
    const respuestaReglas = this.generarRespuestaPorReglas(texto, complejo);
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
      parqueadero: 'Disponibilidad de parqueadero cercano y bahías en la zona para mayor comodidad de nuestras clientas.',
      calzado: 'Instalaciones cómodas y climatizadas para tu mayor relajación.',
      servicios:
        'Tradicional: Pies hombre ($14.000, 60 min), Manos hombre ($14.000, 60 min), Manos y pies ($35.000, 120 min), Pies ($20.000, 60 min), Manos ($16.000, 60 min). Rubber: Retoque press ($50.000, 90 min), Press on ($65.000, 120 min), Dipping ($55.000, 90 min), Base Rubber ($55.000, 90 min). Semipermanente: Retiro semi ($6.000, 15 min), Semi hombre ($25.000, 60 min), Semi Manos y Pies ($75.000, 150 min), Semi pies ($38.000, 80 min), Semipermanente ($43.000, 90 min). Acrílico esculpido: Uña ($6.000, 20 min), Retiro acrílico ($10.000, 60 min), Retiro ($15.000, 60 min), Retoque ($65.000, 120 min), Barrido ($65.000, 120 min), Acrílico ($90.000, 120 min).',
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
    const apertura = complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '09:30';
    const cierre = complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '17:30';
    const direccion = complejo.direccion || 'Calle 66 bis #26-57, Cuba, Pereira';
    const ciudad = complejo.ciudad || 'Pereira, Risaralda, Colombia';
    const info = this.getConocimientoComplejo(complejo);
    const baseUrl = process.env.FRONTEND_URL || 'https://mimate-nails-spa.vercel.app';
    const exigeAnticipo = Number(complejo.porcentaje_anticipo_minimo) > 0;
    const montoAbono = getMontoAnticipoFijo(complejo);

    const prompt = `Eres la recepcionista virtual oficial de "${complejo.nombre}", un exclusivo spa de uñas ubicado en ${direccion} (${ciudad}).
Tu objetivo es responder cualquier duda o comentario del cliente en WhatsApp con inteligencia, calidez, precisión y concisión (máximo 3 a 4 oraciones cortas, usando emojis sutiles como 🌸💅✨).

DATOS OFICIALES Y CONTEXTO DEL SPA:
- Nombre oficial: ${complejo.nombre}
- Dirección exacta: ${direccion} (${ciudad})
- Ubicación en Google Maps: https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8
- Horario de atención: Lunes a Sábado de ${apertura} a ${cierre} (Domingos cerrado o según agenda habilitada).
- Parqueadero: ${info.parqueadero}
- Instalaciones: Climatizadas, cómodas, esterilización de herramientas en autoclave y protocolos de bioseguridad.
- Catálogo oficial completo de servicios, precios y duraciones exactas (siempre en minutos):
  * TRADICIONAL:
    - Pies hombre: $14.000 COP (60 min)
    - Manos hombre: $14.000 COP (60 min)
    - Manos y pies tradicional: $35.000 COP (120 min)
    - Pies tradicional: $20.000 COP (60 min)
    - Manos tradicional: $16.000 COP (60 min)
  * RUBBER / DIPPING / PRESS ON:
    - Retoque press on: $50.000 COP (90 min)
    - Uñas Press on: $65.000 COP (120 min)
    - Dipping: $55.000 COP (90 min)
    - Base Rubber (nivelación): $55.000 COP (90 min)
  * SEMIPERMANENTE:
    - Retiro semipermanente: $6.000 COP (15 min)
    - Semipermanente hombre: $25.000 COP (60 min)
    - Semipermanente Manos y Pies: $75.000 COP (150 min)
    - Semipermanente pies: $38.000 COP (80 min)
    - Semipermanente manos: $43.000 COP (90 min)
  * ACRÍLICO ESCULPIDO:
    - Reparación / Uña acrílica unidad: $6.000 COP (20 min)
    - Retiro acrílico: $10.000 COP (60 min)
    - Retiro general: $15.000 COP (60 min)
    - Retoque acrílico: $65.000 COP (120 min)
    - Barrido en acrílico: $65.000 COP (120 min)
    - Uñas Acrílicas esculpidas completas: $90.000 COP (120 min)
- Políticas de anticipo / abono:
  * Valor general configurado de anticipo: ${montoAbono.toLocaleString('es-CO')} COP.
  * Si el servicio solicitado vale menos que el anticipo (ej: $16.000 o $6.000), el abono requerido es únicamente el valor total del servicio (nunca se cobra de más).
  * ${exigeAnticipo ? 'Actualmente el anticipo está activado para apartar cita.' : 'En temporada regular el anticipo general puede estar desactivado (se cancela en el spa).'}
  * REGLA ESTRICTA DE DICIEMBRE (TEMPORADA ALTA): Si la cita es para cualquier fecha del mes de Diciembre, el anticipo es SIEMPRE OBLIGATORIO para apartar y congelar el cupo, incluso si el check general de anticipo esté desactivado. Si una persona reagenda de otro mes a diciembre, debe abonar el anticipo para confirmar.
- Medios de pago: Nequi, Daviplata, Bancolombia (${complejo.nequi_numero || '3219610896'}, titular: ${complejo.titular_cuenta || 'JL Mímate Nails'}) y efectivo en el spa.
- Domicilios: NO realizamos servicio a domicilio. Todo es en nuestras instalaciones por bioseguridad y esterilización.
- Especialistas / Manicuristas: Contamos con profesionales capacitadas y dedicadas. La clienta puede elegir su manicurista favorita directamente en la web.
- Atención a hombres y niñas: ¡Sí atendemos caballeros y niñas!

MENSAJE DEL CLIENTE:
"${pregunta}"

INSTRUCCIONES CLAVE DE RESPUESTA:
- Responde estrictamente basado en el contexto del spa. NUNCA inventes servicios ajenos (no hacemos cortes de pelo, tintes, pestañas, cejas ni masajes corporales).
- Si preguntan precio o duración, indícalo exactamente expresando siempre la duración en minutos (ej: 60 min, 90 min, 120 min).
- Tono: Muy cálido, profesional y consentidor ("¡Hola reina!", "¡Claro que sí hermosa!", "Te esperamos con todo el amor"), sin rodeos innecesarios.
- Si piden hablar con una encargada o persona humana, recuérdales que pueden escribir *ASESOR* o escribir directamente al WhatsApp ${complejo.telefono_whatsapp || '321 961 0896'}.
- Siempre invita amablemente a revisar horarios y agendar directamente en: ${baseUrl}`;

    const modelosDisponibles = [
      process.env.GEMINI_MODEL,
      'gemini-3-flash-preview',
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ].filter(Boolean) as string[];

    for (const modelo of modelosDisponibles) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const res = await axios.post(
          endpoint,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1000,
              ...(modelo.includes('gemini-3') || modelo.includes('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
            },
          },
          { timeout: 8000 }
        );

        const respuesta = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (respuesta) return respuesta.trim();
      } catch (e: any) {
        // Fallback al siguiente modelo
      }
    }

    return null;
  }

  /**
   * Motor local de respuestas naturales (Fallback cuando no hay conexión a Gemini o respuesta inmediata)
   */
  private static generarRespuestaPorReglas(preguntaOriginal: string, complejo: Complejo): string {
    const t = preguntaOriginal.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const baseUrl = process.env.FRONTEND_URL || 'https://mimate-nails-spa.vercel.app';
    const pie = `\n\n📅 *Puedes elegir tu horario y agendar directamente aquí:*\n👉 ${baseUrl}`;
    const info = this.getConocimientoComplejo(complejo);
    const apertura = complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '09:30';
    const cierre = complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '17:30';
    const direccion = complejo.direccion || 'Calle 66 bis #26-57, Cuba, Pereira';
    const exigeAnticipo = Number(complejo.porcentaje_anticipo_minimo) > 0;
    const montoAbono = getMontoAnticipoFijo(complejo);

    // 1. Consultas por UBICACIÓN / DIRECCIÓN / CÓMO LLEGAR
    if (
      t.includes('donde') ||
      t.includes('ubicacion') ||
      t.includes('ubicados') ||
      t.includes('ubicadas') ||
      t.includes('direccion') ||
      t.includes('llegar') ||
      t.includes('queda') ||
      t.includes('quedan') ||
      t.includes('barrio') ||
      t.includes('sector') ||
      t.includes('mapa') ||
      t.includes('maps')
    ) {
      return (
        `📍 *Ubicación de ${complejo.nombre}:*\n\n` +
        `Estamos ubicados en *${direccion}* (Sector Cuba, Pereira, Risaralda) 🌸.\n\n` +
        `🗺️ *Ver ubicación en Google Maps:*\nhttps://maps.app.goo.gl/KdSvqi1b2iAe5xgg8\n\n` +
        `⏰ Atendemos de Lunes a Sábado de *${apertura}* a *${cierre}*.` +
        pie
      );
    }

    // 2. Consultas por DOMICILIOS
    if (t.includes('domicilio') || t.includes('casa') || t.includes('van a')) {
      return (
        `🌸 ¡Hola hermosa! Te contamos que todos nuestros servicios se realizan únicamente en nuestras instalaciones en *${direccion}* (Cuba, Pereira), ya que contamos con equipos de esterilización, lámparas profesionales y mobiliario spa para garantizarte un resultado perfecto y 100% bioseguro 💅✨.` +
        pie
      );
    }

    // 3. Consultas por PARQUEADERO
    if (t.includes('parqueadero') || t.includes('estacionamiento') || t.includes('parquear') || t.includes('carro') || t.includes('moto')) {
      return `🚗 *Parqueadero en ${complejo.nombre}:*\n${info.parqueadero}` + pie;
    }

    // 4. Consultas por HORARIOS DE ATENCIÓN
    if (
      (t.includes('horario') || t.includes('hora') || t.includes('abren') || t.includes('cierran') || t.includes('atienden') || t.includes('trabajan') || t.includes('domingo') || t.includes('festivo')) &&
      !t.includes('cuanto dura') &&
      !t.includes('cuanto demora')
    ) {
      return (
        `⏰ *Horario de Atención - ${complejo.nombre}:*\n\n` +
        `Atendemos de *Lunes a Sábado de ${apertura} a ${cierre}* en *${direccion}* 🌸.\n\n` +
        `En nuestro enlace de agenda puedes ver en tiempo real qué turnos están libres hoy o en los próximos días con cada manicurista.` +
        pie
      );
    }

    // 5. Consultas por ABONO / ANTICIPO / MEDIOS DE PAGO
    if (
      t.includes('abono') ||
      t.includes('anticipo') ||
      t.includes('nequi') ||
      t.includes('bancolombia') ||
      t.includes('daviplata') ||
      t.includes('efectivo') ||
      t.includes('tarjeta') ||
      t.includes('medio de pago') ||
      t.includes('medios de pago') ||
      t.includes('como pago') ||
      t.includes('como se paga') ||
      t.includes('pagar')
    ) {
      const nequiNum = complejo.nequi_numero || '3219610896';
      const titular = complejo.titular_cuenta || 'JL Mímate Nails';
      return (
        `💳 *Medios de Pago y Política de Abono:*\n\n` +
        (exigeAnticipo
          ? `• Para asegurar tu cita se solicita un *abono fijo de $${montoAbono.toLocaleString('es-CO')} COP* (si el servicio elegido cuesta menos que el abono, solo transfieres el valor del servicio).\n` +
            `• El saldo restante lo pagas directamente en el spa al finalizar tu atención.\n` +
            `• *Cuentas oficiales:* Nequi / Bancolombia / Daviplata *${nequiNum}* a nombre de *${titular}*.\n` +
            `• También recibimos efectivo y transferencia en el local 💕.`
          : `• Puedes pagar en efectivo, Nequi, Bancolombia o Daviplata directamente en el spa 💕.\n` +
            `• *Nota de temporada:* Para todas las citas del mes de *diciembre* sí se solicita un abono fijo de *$${montoAbono.toLocaleString('es-CO')} COP* para asegurar el cupo.`) +
        pie
      );
    }

    // 6. Consultas por SERVICIOS ESPECÍFICOS (Acrílico, Semipermanente, Rubber, Dipping, Press On, Tradicional, Hombre, Retiro)
    const preguntaAcrilico = t.includes('acrilic') || t.includes('esculpid') || t.includes('barrido');
    const preguntaSemi = t.includes('semi');
    const preguntaRubber = t.includes('rubber') || t.includes('ruber') || t.includes('dipping') || t.includes('press');
    const preguntaTradicional = t.includes('tradicional') || t.includes('normal') || t.includes('sencill');
    const preguntaHombre = t.includes('hombre') || t.includes('caballero') || t.includes('masculino');
    const preguntaRetiro = t.includes('retiro') || t.includes('retirar') || t.includes('quitar');

    if (preguntaAcrilico && !preguntaSemi && !preguntaRubber) {
      return (
        `💅 *Uñas Acrílicas Esculpidas en ${complejo.nombre}:*\n\n` +
        `• *Acrílico esculpido completo:* $90.000 (120 min)\n` +
        `• *Barrido en acrílico:* $65.000 (120 min)\n` +
        `• *Retoque de acrílico:* $65.000 (120 min)\n` +
        `• *Retiro de acrílico:* $10.000 (60 min) | *Retiro general:* $15.000 (60 min)\n` +
        `• *Reparación de 1 uña acrílica:* $6.000 (20 min)` +
        pie
      );
    }

    if (preguntaSemi && !preguntaAcrilico && !preguntaRubber) {
      return (
        `✨ *Esmaltado Semipermanente en ${complejo.nombre}:*\n\n` +
        `• *Semipermanente manos:* $43.000 (90 min)\n` +
        `• *Semipermanente pies:* $38.000 (80 min)\n` +
        `• *Combo Semipermanente Manos y Pies:* $75.000 (150 min)\n` +
        `• *Semipermanente hombre:* $25.000 (60 min)\n` +
        `• *Retiro de semipermanente:* $6.000 (15 min)` +
        pie
      );
    }

    if (preguntaRubber && !preguntaAcrilico && !preguntaSemi) {
      return (
        `🌸 *Base Rubber, Dipping y Press On en ${complejo.nombre}:*\n\n` +
        `• *Base Rubber (nivelación):* $55.000 (90 min)\n` +
        `• *Dipping System:* $55.000 (90 min)\n` +
        `• *Uñas Press On:* $65.000 (120 min)\n` +
        `• *Retoque Press On:* $50.000 (90 min)` +
        pie
      );
    }

    if (preguntaHombre) {
      return (
        `🤵 *Servicios para Caballero en ${complejo.nombre}:*\n\n` +
        `• *Manos hombre tradicional:* $14.000 (60 min)\n` +
        `• *Pies hombre tradicional:* $14.000 (60 min)\n` +
        `• *Semipermanente hombre:* $25.000 (60 min)` +
        pie
      );
    }

    if (preguntaRetiro) {
      return (
        `💅 *Servicios de Retiro Seguro en ${complejo.nombre}:*\n\n` +
        `• *Retiro de semipermanente:* $6.000 (15 min)\n` +
        `• *Retiro de acrílico:* $10.000 (60 min)\n` +
        `• *Retiro general:* $15.000 (60 min)` +
        pie
      );
    }

    if (preguntaTradicional) {
      return (
        `🌸 *Manicure y Pedicure Tradicional en ${complejo.nombre}:*\n\n` +
        `• *Manos tradicional:* $16.000 (60 min)\n` +
        `• *Pies tradicional:* $20.000 (60 min)\n` +
        `• *Combo Manos y Pies tradicional:* $35.000 (120 min)\n` +
        `• *Manos hombre:* $14.000 (60 min) | *Pies hombre:* $14.000 (60 min)` +
        pie
      );
    }

    // 7. Consultas generales de PRECIOS / CATÁLOGO / SERVICIOS / DURACIÓN
    if (
      t.includes('precio') ||
      t.includes('cuanto') ||
      t.includes('valor') ||
      t.includes('vale') ||
      t.includes('cuesta') ||
      t.includes('servicio') ||
      t.includes('catalogo') ||
      t.includes('unas') ||
      t.includes('uñas') ||
      t.includes('manicur') ||
      t.includes('pedicur') ||
      t.includes('manos') ||
      t.includes('pies') ||
      t.includes('dura') ||
      t.includes('demora')
    ) {
      return (
        `💅 *Lista Oficial de Servicios y Precios - ${complejo.nombre}:*\n\n` +
        `🌸 *Tradicional:*\n` +
        `• Manos: *$16.000* (60 min) | Pies: *$20.000* (60 min)\n` +
        `• Manos y Pies: *$35.000* (120 min)\n` +
        `• Manos Hombre: *$14.000* (60 min) | Pies Hombre: *$14.000* (60 min)\n\n` +
        `✨ *Rubber / Dipping / Press On:*\n` +
        `• Base Rubber: *$55.000* (90 min) | Dipping: *$55.000* (90 min)\n` +
        `• Press On: *$65.000* (120 min) | Retoque Press: *$50.000* (90 min)\n\n` +
        `💖 *Semipermanente:*\n` +
        `• Semipermanente manos: *$43.000* (90 min)\n` +
        `• Semi pies: *$38.000* (80 min) | Semi Manos y Pies: *$75.000* (150 min)\n` +
        `• Semi hombre: *$25.000* (60 min) | Retiro semi: *$6.000* (15 min)\n\n` +
        `💎 *Acrílico Esculpido:*\n` +
        `• Acrílico esculpido: *$90.000* (120 min)\n` +
        `• Barrido: *$65.000* (120 min) | Retoque: *$65.000* (120 min)\n` +
        `• Retiro acrílico: *$10.000* (60 min) | Retiro: *$15.000* (60 min)\n` +
        `• Reparación uña: *$6.000* (20 min)` +
        pie
      );
    }

    // 8. Respuesta natural general para cualquier otra duda (ej. agradecimientos, dudas de cómo usar el link, etc.)
    if (t.includes('gracias') || t.includes('listo') || t.includes('ok') || t.includes('vale') || t.includes('perfecto') || t.includes('bueno')) {
      return (
        `🌸 ¡Con muchísimo gusto reina! Estamos para consentirte en *${complejo.nombre}* 💕.\n\n` +
        `Si tienes cualquier otra pregunta sobre nuestros servicios, precios o ubicación, escríbeme con confianza. ¡Te esperamos! 💅✨` +
        pie
      );
    }

    return (
      `🌸 *¡Hola reina! Estamos para ayudarte en ${complejo.nombre}* 💕\n\n` +
      `• 📍 *Dirección:* ${direccion} (Lunes a Sábado de ${apertura} a ${cierre})\n` +
      `• 💅 *Servicios:* Uñas acrílicas esculpidas ($90.000), Base Rubber ($55.000), Dipping ($55.000), Semipermanente ($43.000), Tradicional manos y pies ($35.000) y más.\n` +
      `• 💬 Si necesitas hablar con una encargada, escribe *ASESOR*.` +
      pie
    );
  }
}

