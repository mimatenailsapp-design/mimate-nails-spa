import { BookingService, Complejo, Cancha, HorarioDisponible } from '../services/bookingService.js';
import { ReceiptVerificationService } from '../services/receiptVerificationService.js';
import { AIReceptionistService } from '../services/aiReceptionistService.js';
import { NLUIntentService } from '../services/nluIntentService.js';
import { supabase } from '../config/supabase.js';

export interface InteractiveRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveSection {
  title?: string;
  rows: InteractiveRow[];
}

export interface BotInteractiveMessage {
  type: 'list';
  header?: string;
  body: string;
  footer?: string;
  action: {
    button: string; // Max 20 chars
    sections: InteractiveSection[];
  };
}

export interface BotResponse {
  texto: string;
  interactive?: BotInteractiveMessage;
}

interface UserSession {
  paso: 'INICIO' | 'SELECCION_CANCHA' | 'SELECCION_FECHA' | 'SELECCION_HORA' | 'CONFIRMACION' | 'ESPERA_PAGO' | 'PEDIDO_ESPERA_DIRECCION';
  complejoId?: string;
  canchasDisponibles?: Cancha[];
  canchaSeleccionada?: Cancha;
  fechaSeleccionada?: string; // YYYY-MM-DD
  horariosDisponibles?: HorarioDisponible[];
  horarioSeleccionado?: HorarioDisponible;
  reservaId?: string;
  nombreCliente?: string;
  ultimoMensaje: number;
  pedidoInfo?: {
    detalle: string;
    total: number;
    direccion?: string;
    items?: string[];
  };
}

const sesiones: Map<string, UserSession> = new Map();

export class WhatsAppFlow {
  /**
   * Procesa el mensaje identificando a qué complejo deportivo pertenece
   * y genera respuestas interactivas de menú desplegable para WhatsApp
   */
  static async procesarMensaje(
    telefono: string,
    texto: string,
    nombrePush?: string,
    complejoDirecto?: Complejo,
    mediaId?: string,
    mediaType?: string
  ): Promise<BotResponse> {
    try {
      const ahora = Date.now();
      let session = sesiones.get(telefono);

      // Obtener complejo asignado
      const complejo = complejoDirecto || (await BookingService.getComplejos())[0];

      if (!session || ahora - session.ultimoMensaje > 30 * 60 * 1000 || session.complejoId !== complejo.id) {
        session = { paso: 'INICIO', complejoId: complejo.id, ultimoMensaje: ahora };
        sesiones.set(telefono, session);
      }
      session.ultimoMensaje = ahora;

      const input = texto.trim().toLowerCase();

      // Detección de respuesta al menú de recordatorio (Confirmar, Cancelar o Reagendar)
      const resRecordatorio = await this.manejarRespuestaRecordatorio(telefono, texto, input, complejo, session);
      if (resRecordatorio) {
        return resRecordatorio;
      }

      if (input === 'reiniciar' || input === 'menu' || input === 'cancelar' || (input === 'hola' && session.paso !== 'INICIO' && session.paso !== 'ESPERA_PAGO')) {
        session.paso = 'INICIO';
      }

      // Detección inteligente de consultas libres (FAQ) y derivación a asesor humano
      if (!mediaId && (AIReceptionistService.esSolicitudHumano(input) || AIReceptionistService.esPreguntaFrecuente(input))) {
        const consulta = await AIReceptionistService.responderConsulta(texto, complejo);
        if (consulta.esPreguntaOAtencion && consulta.respuestaTexto) {
          return { texto: consulta.respuestaTexto };
        }
      }

      // 1. FLUJO ESPECIAL PARA NEGOCIOS DE PEDIDOS Y DOMICILIOS (GRANIZA2KL)
      if (complejo.tipo_negocio === 'pedidos' || complejo.slug === 'graniza2kl') {
        return await this.manejarFlujoPedidos(telefono, texto, input, session, complejo, nombrePush, mediaId, mediaType);
      }

      // 2. COMPRENSIÓN NATURAL DE CONTEXTO GLOBAL (Primer mensaje, segundo mensaje o en cualquier paso)
      const esComandoSistema = input.startsWith('cancha_') ||
        input.startsWith('fecha_') ||
        input.startsWith('hora_') ||
        input.startsWith('hora2_') ||
        input === 'contacto_asesor' ||
        input === 'menu' ||
        input === 'reiniciar' ||
        input === 'cancelar';

      const esSoloSaludo = ['hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes'].includes(input);

      if (!mediaId && !esComandoSistema && !esSoloSaludo) {
        if (!session.canchasDisponibles || session.canchasDisponibles.length === 0) {
          session.canchasDisponibles = await BookingService.getCanchas(complejo.id);
        }

        const respuestaContexto = await this.manejarContextoNatural(
          telefono,
          texto,
          input,
          session,
          complejo,
          nombrePush
        );

        if (respuestaContexto) {
          return respuestaContexto;
        }
      }

      // 3. FLUJO GUIADO DE RESERVAS Y CITAS (DEPORTES, BARBERÍA, SPA)
      switch (session.paso) {
        case 'INICIO':
          return await this.manejarInicio(telefono, session, complejo, nombrePush, texto);

        case 'SELECCION_CANCHA':
          return await this.manejarSeleccionCancha(input, session);

        case 'SELECCION_FECHA':
          return await this.manejarSeleccionFecha(input, session);

        case 'SELECCION_HORA':
          return await this.manejarSeleccionHora(input, session, telefono, complejo);

        case 'ESPERA_PAGO':
          return await this.manejarEsperaPago(input, session, complejo, mediaId, mediaType);

        default:
          session.paso = 'INICIO';
          return {
            texto: `¡Hola! Escribe *HOLA* para comenzar tu reserva en *${complejo.nombre}* ⚽🎾.`,
          };
      }
    } catch (globalErr: any) {
      console.error('Error general procesando flujo de WhatsApp:', globalErr);
      return {
        texto: '👋 ¡Hola! Ocurrió una pequeña interrupción en nuestro sistema. Por favor escribe *HOLA* o *MENU* para continuar.',
      };
    }
  }

  /**
   * Procesa comprensión de lenguaje natural para reservas y citas en cualquier momento
   */
  private static async manejarContextoNatural(
    telefono: string,
    texto: string,
    input: string,
    session: UserSession,
    complejo: Complejo,
    nombrePush?: string
  ): Promise<BotResponse | null> {
    const canchas = session.canchasDisponibles || (await BookingService.getCanchas(complejo.id));
    session.canchasDisponibles = canchas;

    const ctx = await NLUIntentService.extraerContexto(texto, complejo, canchas);
    if (!ctx.esContextual) {
      return null;
    }

    if (ctx.intencion === 'RESERVA') {
      await BookingService.getOrCreateCliente(telefono, nombrePush);

      // Determinar cancha
      let cancha = ctx.cancha || session.canchaSeleccionada;
      if (!cancha && canchas.length === 1) {
        cancha = canchas[0];
      }

      // Determinar fecha
      let fecha = ctx.fecha || session.fechaSeleccionada;
      if (!fecha && ctx.hora) {
        fecha = NLUIntentService.formatearIso(NLUIntentService.getFechaHoraColombia());
      }

      const hora = ctx.hora;
      const duracionHoras = ctx.duracionHoras || 1;

      // CASO 1: Cancha + Fecha + Hora
      if (cancha && fecha && hora) {
        session.canchaSeleccionada = cancha;
        session.fechaSeleccionada = fecha;

        const horarios = await BookingService.getHorariosDisponibles(cancha.id, fecha);
        session.horariosDisponibles = horarios;

        const horaPrefix = hora.slice(0, 5);
        const slotMatch = horarios.find((h) => h.hora_inicio.startsWith(horaPrefix));

        if (slotMatch && slotMatch.disponible) {
          const idHora = duracionHoras === 2 ? `hora2_${horaPrefix}` : `hora_${horaPrefix}`;
          return await this.manejarSeleccionHora(idHora, session, telefono, complejo);
        } else {
          // El horario solicitado no está disponible
          const disponibles = horarios.filter((h) => h.disponible);
          if (disponibles.length === 0) {
            session.paso = 'SELECCION_FECHA';
            return {
              texto: `⚠️ *Horario no disponible*\n\n` +
                `El turno de las *${horaPrefix}* para *${cancha.nombre}* el *${fecha}* ya se encuentra reservado.\n\n` +
                `❌ Lamentablemente no quedan más turnos libres para esta fecha en este espacio.\n` +
                `👉 Por favor escribe otra fecha (ej. *"mañana"*, *"el sábado"*) o escribe *MENU*.`,
            };
          }

          session.paso = 'SELECCION_HORA';
          const filasAlt: InteractiveRow[] = disponibles.slice(0, 6).map((h) => {
            const precioFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(h.precio);
            return {
              id: `hora_${h.hora_inicio.slice(0, 5)}`,
              title: `${h.hora_inicio.slice(0, 5)} a ${h.hora_fin.slice(0, 5)}`.slice(0, 24),
              description: `${precioFmt} • Disponible hoy`.slice(0, 72),
            };
          });

          const textoRespuesta = `⚠️ *Horario ocupado*\n\n` +
            `El turno de las *${horaPrefix}* para *${cancha.nombre}* el *${fecha}* ya fue reservado por otro usuario.\n\n` +
            `✨ *¡Pero tenemos estos turnos disponibles para ti hoy en ${cancha.nombre}!*:\n` +
            `Por favor selecciona tu horario alternativo del menú desplegable a continuación:`;

          return {
            texto: textoRespuesta,
            interactive: {
              type: 'list',
              header: 'Horarios Disponibles',
              body: textoRespuesta,
              footer: 'Elige del menú o escribe ASESOR',
              action: {
                button: 'Ver Horarios',
                sections: [{ title: 'Turnos Disponibles', rows: filasAlt }],
              },
            },
          };
        }
      }

      // CASO 2: Cancha + Fecha (sin hora)
      if (cancha && fecha && !hora) {
        session.canchaSeleccionada = cancha;
        return await this.manejarSeleccionFecha(fecha, session);
      }

      // CASO 3: Fecha + Hora (sin Cancha identificada y hay múltiples canchas)
      if (!cancha && fecha && hora && canchas.length > 1) {
        session.fechaSeleccionada = fecha;
        const canchasLibres: Cancha[] = [];
        for (const c of canchas) {
          try {
            const hDisponibles = await BookingService.getHorariosDisponibles(c.id, fecha);
            const tieneTurno = hDisponibles.some((h) => h.hora_inicio.startsWith(hora.slice(0, 5)) && h.disponible);
            if (tieneTurno) canchasLibres.push(c);
          } catch (e) {}
        }

        if (canchasLibres.length === 1) {
          session.canchaSeleccionada = canchasLibres[0];
          session.horariosDisponibles = await BookingService.getHorariosDisponibles(canchasLibres[0].id, fecha);
          const idHora = duracionHoras === 2 ? `hora2_${hora.slice(0, 5)}` : `hora_${hora.slice(0, 5)}`;
          return await this.manejarSeleccionHora(idHora, session, telefono, complejo);
        }

        if (canchasLibres.length > 1) {
          session.paso = 'SELECCION_CANCHA';
          const rows: InteractiveRow[] = canchasLibres.map((c) => ({
            id: `cancha_${c.id}`,
            title: c.nombre.slice(0, 24),
            description: `Libre a las ${hora.slice(0, 5)} • $${c.precio_estandar.toLocaleString('es-CO')}`.slice(0, 72),
          }));

          const textoResp = `📅 Para el *${fecha}* a las *${hora.slice(0, 5)}* tenemos disponibles los siguientes espacios en *${complejo.nombre}*:\n\n` +
            `👉 Selecciona en cuál de ellos deseas tu reserva o cita:`;

          return {
            texto: textoResp,
            interactive: {
              type: 'list',
              header: 'Canchas Disponibles',
              body: textoResp,
              footer: 'Elige del menú o escribe ASESOR',
              action: {
                button: 'Elegir Cancha',
                sections: [{ title: `Libres a las ${hora.slice(0, 5)}`, rows }],
              },
            },
          };
        }
      }

      // CASO 4: Solo Cancha
      if (cancha && !fecha && !hora) {
        return await this.manejarSeleccionCancha(`cancha_${cancha.id}`, session);
      }
    }

    return null;
  }

  private static async manejarInicio(
    telefono: string,
    session: UserSession,
    complejo: Complejo,
    nombrePush?: string,
    textoMensaje?: string
  ): Promise<BotResponse> {
    await BookingService.getOrCreateCliente(telefono, nombrePush);

    // Consultar ÚNICAMENTE las canchas de esta empresa
    const canchas = await BookingService.getCanchas(complejo.id);
    session.canchasDisponibles = canchas;
    session.paso = 'SELECCION_CANCHA';

    if (canchas.length === 0) {
      return {
        texto: `👋 ¡Hola ${nombrePush || ''}! Bienvenido a las reservas 24/7 de *${complejo.nombre}*.\n\n⚠️ Este complejo aún no tiene canchas activas registradas.`,
      };
    }

    // COMPRENSIÓN DE CONTEXTO INICIAL: Si el cliente escribió directamente lo que busca
    // Ejemplos: "Hola quiero padel hoy a las 7pm", "Cita con Camilo mañana a las 3"
    if (textoMensaje && textoMensaje.trim().length > 3) {
      const inputLimpio = textoMensaje.trim().toLowerCase();
      const esSoloSaludo = ['hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'menu', 'reiniciar'].includes(inputLimpio);

      if (!esSoloSaludo) {
        const contexto = this.extraerContextoReserva(textoMensaje, canchas);
        if (contexto.cancha) {
          session.canchaSeleccionada = contexto.cancha;
          if (contexto.fecha) {
            session.fechaSeleccionada = contexto.fecha;
            session.paso = 'SELECCION_HORA';
            if (contexto.hora) {
              const horarios = await BookingService.getHorariosDisponibles(contexto.cancha.id, contexto.fecha);
              session.horariosDisponibles = horarios;
              const turnoMatch = horarios.find((h) => h.hora_inicio.startsWith(contexto.hora!) && h.disponible);
              if (turnoMatch) {
                return await this.manejarSeleccionHora(`hora_${turnoMatch.hora_inicio.slice(0, 5)}`, session, telefono, complejo);
              }
            }
            return await this.manejarSeleccionFecha(contexto.fecha, session);
          }
          return await this.manejarSeleccionCancha(`cancha_${contexto.cancha.id}`, session);
        }
      }
    }

    const rows: InteractiveRow[] = canchas.slice(0, 9).map((c) => ({
      id: `cancha_${c.id}`,
      title: c.nombre.slice(0, 24),
      description: `${c.deporte.toUpperCase().replace('_', ' ')} • $${c.precio_estandar.toLocaleString('es-CO')}`.slice(0, 72),
    }));

    // Opción para hablar directamente con un encargado o asesor
    rows.push({
      id: 'contacto_asesor',
      title: '💬 Hablar con Asesor',
      description: 'Atención personalizada con encargado',
    });

    const textoRespuesta = `👋 ¡Hola ${nombrePush || ''}! Bienvenido a las reservas 24/7 de *${complejo.nombre}*.\n\n` +
      `• Abre el menú desplegable a continuación para seleccionar tu cancha o servicio ⚽🎾.\n` +
      `• O puedes escribir *ASESOR* en cualquier momento para hablar con un encargado.`;

    return {
      texto: textoRespuesta,
      interactive: {
        type: 'list',
        header: complejo.nombre.slice(0, 60),
        body: textoRespuesta,
        footer: 'Elige del menú o escribe ASESOR',
        action: {
          button: 'Elegir Opción',
          sections: [
            {
              title: 'Canchas y Opciones',
              rows,
            },
          ],
        },
      },
    };
  }

  private static async manejarSeleccionCancha(input: string, session: UserSession): Promise<BotResponse> {
    if (!session.canchasDisponibles || session.canchasDisponibles.length === 0) {
      session.paso = 'INICIO';
      return { texto: '⚠️ Sesión expirada. Por favor escribe *HOLA* para iniciar tu reserva.' };
    }

    let canchaEncontrada: Cancha | undefined;

    if (input.startsWith('cancha_')) {
      const id = input.replace('cancha_', '');
      canchaEncontrada = session.canchasDisponibles.find((c) => c.id === id);
    } else {
      const idx = parseInt(input, 10) - 1;
      if (!isNaN(idx) && session.canchasDisponibles[idx]) {
        canchaEncontrada = session.canchasDisponibles[idx];
      } else {
        canchaEncontrada = session.canchasDisponibles.find(
          (c) => c.nombre.toLowerCase().includes(input) || input.includes(c.nombre.toLowerCase())
        );
      }
    }

    if (!canchaEncontrada) {
      return {
        texto: '⚠️ Por favor selecciona una opción válida del menú desplegable de canchas.',
      };
    }

    session.canchaSeleccionada = canchaEncontrada;
    session.paso = 'SELECCION_FECHA';

    const hoy = this.getFechaHoraColombia();
    const nombresDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const nombresMeses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const filasProximosDias: InteractiveRow[] = [];

    // Generar opciones para los próximos 6 días
    for (let i = 0; i < 6; i++) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() + i);
      const fechaIso = this.formatearIso(d);

      const nombreDia = nombresDias[d.getDay()];
      const nombreMes = nombresMeses[d.getMonth()];
      const diaStr = String(d.getDate()).padStart(2, '0');

      let etiqueta = `${nombreDia} ${diaStr} ${nombreMes}`;
      if (i === 0) etiqueta = `Hoy (${nombreDia})`;
      else if (i === 1) etiqueta = `Mañana (${nombreDia})`;

      filasProximosDias.push({
        id: `fecha_${fechaIso}`,
        title: etiqueta.slice(0, 24),
        description: `Reservar para el ${fechaIso}`,
      });
    }

    const filasPersonalizadas: InteractiveRow[] = [
      {
        id: 'fecha_personalizada',
        title: '✏️ Otra fecha',
        description: 'Escribe cualquier fecha del año',
      },
      {
        id: 'contacto_asesor',
        title: '💬 Hablar con Asesor',
        description: 'Atención con un encargado del local',
      },
    ];

    const sections: InteractiveSection[] = [
      { title: 'Fechas Próximas'.slice(0, 24), rows: filasProximosDias },
      { title: 'Otras Opciones'.slice(0, 24), rows: filasPersonalizadas },
    ];

    const texto = `🏟️ Cancha elegida: *${session.canchaSeleccionada.nombre}*\n\n` +
      `¿Para qué fecha deseas tu partido o cita?\n` +
      `• Despliega el menú tocando *[Elegir Fecha]*.\n` +
      `• O puedes **escribir directamente la fecha que quieras** (ej: *"18 de octubre"*, *"el viernes"*).\n` +
      `• O escribe *ASESOR* en cualquier momento para hablar con un encargado.`;

    return {
      texto,
      interactive: {
        type: 'list',
        header: 'Selección de Fecha',
        body: texto,
        footer: 'Elige del menú o escribe ASESOR',
        action: {
          button: 'Elegir Fecha',
          sections,
        },
      },
    };
  }

  /**
   * Obtiene la fecha y hora actual en la zona horaria de Colombia (America/Bogota, UTC-5)
   */
  public static getFechaHoraColombia(): Date {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(new Date());

    const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  }

  /**
   * Obtiene la fecha de hoy en Colombia en formato YYYY-MM-DD
   */
  public static getHoyColombiaStr(): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return `${y}-${m}-${d}`;
  }

  /**
   * Formatea un Date a YYYY-MM-DD
   */
  public static formatearIso(d: Date): string {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  private static interpretarFecha(input: string): string | null {
    if (!input) return null;
    const limpio = input.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hoy = this.getFechaHoraColombia();

    // 1. Detección directa de fecha ISO YYYY-MM-DD en cualquier parte de la cadena (ej. fecha_2026-10-06, 2026-10-06)
    const isoMatch = limpio.match(/(20\d{2}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];

    // 2. Comandos y palabras clave para hoy / mañana / pasado mañana
    if (limpio.includes('pasado manana') || limpio === '3') {
      const p = new Date(hoy);
      p.setDate(hoy.getDate() + 2);
      return this.formatearIso(p);
    }
    if (limpio.includes('hoy') || limpio === '1') {
      return this.formatearIso(hoy);
    }
    if (limpio.includes('manana') || limpio === '2') {
      const m = new Date(hoy);
      m.setDate(hoy.getDate() + 1);
      return this.formatearIso(m);
    }

    // 3. Formato texto natural: "mar 06 oct", "18 de octubre", "el 25 de noviembre de 2026", "6 oct"
    const meses: Record<string, number> = {
      enero: 0, ene: 0,
      febrero: 1, feb: 1,
      marzo: 2, mar: 2,
      abril: 3, abr: 3,
      mayo: 4, may: 4,
      junio: 5, jun: 5,
      julio: 6, jul: 6,
      agosto: 7, ago: 7,
      septiembre: 8, sep: 8, sept: 8,
      octubre: 9, oct: 9,
      noviembre: 10, nov: 10,
      diciembre: 11, dic: 11,
    };

    const regexTextoMes = /(?:(?:dom|lun|mar|mie|jue|vie|sab|domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+)?(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?/;
    const matchTextoMes = limpio.match(regexTextoMes);
    if (matchTextoMes) {
      const dia = parseInt(matchTextoMes[1], 10);
      const nombreMes = matchTextoMes[2];
      if (meses[nombreMes] !== undefined) {
        const mes = meses[nombreMes];
        const anio = matchTextoMes[3] ? parseInt(matchTextoMes[3], 10) : hoy.getFullYear();
        const d = new Date(anio, mes, dia);
        if (!matchTextoMes[3] && d < hoy && (hoy.getTime() - d.getTime()) > 86400000) {
          d.setFullYear(anio + 1);
        }
        return this.formatearIso(d);
      }
    }

    // 4. Formato DD/MM o DD-MM o DD/MM/AAAA (ej. 15/10 o 15-10-2026)
    const regexBarra = /(?:^|\s|[^\d\-])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?(?:\s|[^\d\-]|$)/;
    const matchBarra = limpio.match(regexBarra);
    if (matchBarra) {
      const dia = parseInt(matchBarra[1], 10);
      const mes = parseInt(matchBarra[2], 10) - 1;
      const anio = matchBarra[3] ? parseInt(matchBarra[3], 10) : hoy.getFullYear();
      const d = new Date(anio, mes, dia);
      if (!matchBarra[3] && d < hoy && (hoy.getTime() - d.getTime()) > 86400000) {
        d.setFullYear(anio + 1);
      }
      return this.formatearIso(d);
    }

    // 5. Días de la semana relativos: "lunes", "el próximo viernes", "el otro sábado"
    const diasSemana: Record<string, number> = {
      domingo: 0, dom: 0,
      lunes: 1, lun: 1,
      martes: 2, mar: 2,
      miercoles: 3, mie: 3,
      jueves: 4, jue: 4,
      viernes: 5, vie: 5,
      sabado: 6, sab: 6,
    };

    for (const [nombreDia, targetDay] of Object.entries(diasSemana)) {
      const regWord = new RegExp(`\\b${nombreDia}\\b`, 'i');
      if (regWord.test(limpio)) {
        const esProximaSemana = limpio.includes('proxim') || limpio.includes('otra') || limpio.includes('siguiente');
        const diaActual = hoy.getDay();
        let diff = targetDay - diaActual;

        if (diff <= 0) {
          diff += 7; // Próximo día
        }
        if (esProximaSemana && diff < 7) {
          diff += 7; // Próxima semana
        }

        const fechaCalculada = new Date(hoy);
        fechaCalculada.setDate(hoy.getDate() + diff);
        return this.formatearIso(fechaCalculada);
      }
    }

    return null;
  }

  private static async manejarSeleccionFecha(input: string, session: UserSession): Promise<BotResponse> {
    const inputLimpio = input.toLowerCase().trim();

    // Si el usuario tocó "✏️ Escribir otra fecha" en el menú desplegable
    if (inputLimpio === 'fecha_personalizada' || inputLimpio.includes('otra fecha') || inputLimpio === 'otra') {
      return {
        texto: `📅 *Escribe la fecha que deseas para tu partido:*\n\nPuedes escribirla con total libertad como prefieras:\n` +
          `• Por nombre del mes: *"18 de octubre"*, *"5 de noviembre"*\n` +
          `• Por números: *"18/10"*, *"25/11/2026"*\n` +
          `• Por día relativo: *"el próximo viernes"*, *"el otro sábado"*\n\n` +
          `✍️ Escribe tu fecha aquí abajo:`,
      };
    }

    const fecha = this.interpretarFecha(input);

    if (!fecha) {
      return {
        texto: '⚠️ No entendí la fecha. Puedes seleccionar una fecha sugerida en el menú tocando *Elegir Fecha*, o escribir libremente la fecha que quieras (ej. *"18 de octubre"*, *"el próximo viernes"* o *"15/10"*).',
      };
    }

    // Validar que no sea una fecha en el pasado usando la fecha de Colombia (UTC-5)
    const hoyStr = this.getHoyColombiaStr();
    if (fecha < hoyStr) {
      return {
        texto: `⚠️ La fecha que ingresaste (*${fecha}*) ya pasó. Por favor escribe una fecha futura (ejemplo: *"18 de octubre"* o *"el próximo sábado"*).`,
      };
    }

    session.fechaSeleccionada = fecha;
    session.paso = 'SELECCION_HORA';

    const horarios: HorarioDisponible[] = await BookingService.getHorariosDisponibles(session.canchaSeleccionada!.id, fecha);
    const disponibles = horarios.filter((h: HorarioDisponible) => h.disponible);
    session.horariosDisponibles = disponibles;

    if (disponibles.length === 0) {
      session.paso = 'SELECCION_FECHA';
      return {
        texto: `❌ No hay horarios disponibles para el *${fecha}* en *${session.canchaSeleccionada!.nombre}*.\nPor favor selecciona otra fecha desde el menú desplegable.`,
      };
    }

    // WhatsApp permite un máximo de 10 filas por mensaje interactivo de tipo lista
    const filas1Hora: InteractiveRow[] = [];
    const filas2Horas: InteractiveRow[] = [];

    // Opciones de 1 hora (hasta 5 opciones)
    for (const h of disponibles.slice(0, 5)) {
      const precioFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(h.precio);
      filas1Hora.push({
        id: `hora_${h.hora_inicio.slice(0, 5)}`,
        title: `${h.hora_inicio.slice(0, 5)} a ${h.hora_fin.slice(0, 5)} (1h)`.slice(0, 24),
        description: `${precioFmt} • 60 min`.slice(0, 72),
      });
    }

    // Opciones de 2 horas seguidas (hasta 4 opciones si hay horas consecutivas libres)
    for (let i = 0; i < disponibles.length - 1; i++) {
      const h1 = disponibles[i];
      const h2 = disponibles[i + 1];
      if (h1 && h2 && h1.hora_fin === h2.hora_inicio && filas2Horas.length < 4) {
        const precioTotal2h = h1.precio + h2.precio;
        const precioTotalFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(precioTotal2h);
        filas2Horas.push({
          id: `hora2_${h1.hora_inicio.slice(0, 5)}`,
          title: `${h1.hora_inicio.slice(0, 5)} a ${h2.hora_fin.slice(0, 5)} (2h)`.slice(0, 24),
          description: `${precioTotalFmt} • 120 min seguidos`.slice(0, 72),
        });
      }
    }

    const sections: InteractiveSection[] = [];
    if (filas1Hora.length > 0) {
      sections.push({ title: 'Turnos de 1 Hora', rows: filas1Hora });
    }
    if (filas2Horas.length > 0) {
      sections.push({ title: 'Turnos de 2 Horas', rows: filas2Horas });
    }

    const texto = `📅 *${session.canchaSeleccionada!.nombre}* el *${fecha}*\n\n` +
      `¡Hay turnos disponibles de 1 y 2 horas! Despliega el menú a continuación para seleccionar el horario:\n` +
      `• _(Si necesitas un horario especial o ayuda, escribe *ASESOR* para hablar con un encargado)_`;

    return {
      texto,
      interactive: {
        type: 'list',
        header: 'Horarios Disponibles',
        body: texto,
        footer: 'Elige del menú o escribe ASESOR',
        action: {
          button: 'Elegir Horario',
          sections,
        },
      },
    };
  }

  private static async manejarSeleccionHora(
    input: string,
    session: UserSession,
    telefono: string,
    complejo: Complejo
  ): Promise<BotResponse> {
    if (!session.horariosDisponibles || session.horariosDisponibles.length === 0) {
      session.paso = 'SELECCION_FECHA';
      return { texto: '⚠️ Horarios no cargados. Por favor selecciona nuevamente la fecha.' };
    }

    const esBloque2h = input.startsWith('hora2_') || input.includes('2 horas') || input.includes('2h');
    let duracionHoras = esBloque2h ? 2 : 1;
    let horario: HorarioDisponible | undefined;
    let horaIniNorm = '';
    let horaFinNorm = '';
    let precioTotal = 0;

    if (esBloque2h) {
      const horaLimpia = input.replace('hora2_', '').replace('hora_', '').slice(0, 5);
      const h1Idx = session.horariosDisponibles.findIndex((h) => h.hora_inicio.startsWith(horaLimpia));
      const h1 = session.horariosDisponibles[h1Idx];
      const h2 = session.horariosDisponibles[h1Idx + 1];

      if (h1 && h2 && h1.hora_fin === h2.hora_inicio) {
        horario = h1;
        horaIniNorm = h1.hora_inicio.slice(0, 5);
        horaFinNorm = h2.hora_fin.slice(0, 5);
        precioTotal = h1.precio + h2.precio;
      } else if (h1) {
        duracionHoras = 1;
        horario = h1;
        horaIniNorm = h1.hora_inicio.slice(0, 5);
        horaFinNorm = h1.hora_fin.slice(0, 5);
        precioTotal = h1.precio;
      }
    } else {
      if (input.startsWith('hora_')) {
        const horaLimpia = input.replace('hora_', '').slice(0, 5);
        horario = session.horariosDisponibles.find((h) => h.hora_inicio.startsWith(horaLimpia));
      } else {
        const idx = parseInt(input, 10) - 1;
        if (!isNaN(idx) && session.horariosDisponibles[idx]) {
          horario = session.horariosDisponibles[idx];
        } else {
          horario = session.horariosDisponibles.find((h) => input.includes(h.hora_inicio.slice(0, 5)));
        }
      }
      if (horario) {
        horaIniNorm = horario.hora_inicio.slice(0, 5);
        horaFinNorm = horario.hora_fin.slice(0, 5);
        precioTotal = horario.precio;
      }
    }

    if (!horario || !horaIniNorm || !horaFinNorm) {
      return {
        texto: '⚠️ Opción de horario inválida. Despliega el menú y selecciona uno de los turnos disponibles.',
      };
    }

    session.horarioSeleccionado = horario;

    const cliente = await BookingService.getOrCreateCliente(telefono);

    const formatearTimestampIso = (fecha: string, hora: string): string => {
      const match = hora.match(/^(\d{1,2}):(\d{2})/);
      const hh = match ? match[1].padStart(2, '0') : '00';
      const mm = match ? match[2].padStart(2, '0') : '00';
      return `${fecha}T${hh}:${mm}:00Z`;
    };

    const fechaInicioIso = formatearTimestampIso(session.fechaSeleccionada!, horaIniNorm);
    const fechaFinIso = formatearTimestampIso(session.fechaSeleccionada!, horaFinNorm);

    try {
      // Re-verificar en tiempo real que el horario siga verdaderamente libre y no haya sido tomado
      const horariosActuales = await BookingService.getHorariosDisponibles(session.canchaSeleccionada!.id, session.fechaSeleccionada!);
      const turnoLibre = horariosActuales.find((h) => h.hora_inicio.startsWith(horaIniNorm) && h.disponible);
      if (!turnoLibre) {
        return {
          texto: '⚠️ *Horario no disponible*\n\nEste turno acaba de ser apartado por otro usuario o se encuentra bloqueado. Por favor despliega el menú para seleccionar un horario libre.',
        };
      }

      const porcentaje = complejo.porcentaje_anticipo_minimo ?? 50;
      const exigeAnticipo = porcentaje > 0;

      const reserva = await BookingService.crearPreReserva({
        canchaId: session.canchaSeleccionada!.id,
        clienteId: cliente.id,
        fechaInicio: fechaInicioIso,
        fechaFin: fechaFinIso,
        valorTotal: precioTotal,
        porcentajeAnticipo: porcentaje,
      });

      const totalFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(precioTotal);

      // CASO A: EL ESCENARIO NO EXIGE ABONO / ANTICIPO (CONFIRMACIÓN INMEDIATA)
      if (!exigeAnticipo) {
        session.reservaId = reserva.id;
        session.paso = 'INICIO';

        return {
          texto: `🎉 *¡RESERVA 100% CONFIRMADA!*\n\n` +
            `🏢 Establecimiento: *${complejo.nombre}*\n` +
            `🏟️ Cancha: *${session.canchaSeleccionada!.nombre}*\n` +
            `📅 Fecha: *${session.fechaSeleccionada}*\n` +
            `⏰ Horario: *${horaIniNorm} - ${horaFinNorm}* (${duracionHoras === 2 ? '2 Horas seguidas' : '1 Hora'})\n` +
            `💰 Total a pagar: *${totalFmt}*\n\n` +
            `✅ *En este escenario no requieres abono previo.*\n` +
            `El valor total de tu turno lo pagas en efectivo o transferencia al llegar a la recepción del complejo.\n\n` +
            `🔔 Te recordaremos tu partido antes de la hora fijada. ¡Nos vemos en la cancha! ⚽🎾`,
        };
      }

      // CASO B: EL ESCENARIO EXIGE ABONO (BLOQUEO TEMPORAL DE 15 MIN Y ESPERA DE COMPROBANTE)
      session.reservaId = reserva.id;
      session.paso = 'ESPERA_PAGO';

      const anticipoFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(reserva.valor_anticipo_requerido);
      const titular = complejo.titular_cuenta || complejo.nombre;
      const nequi = complejo.nequi_numero || 'Consultar con administración';
      const daviplata = complejo.daviplata_numero || nequi;

      return {
        texto: `🔒 *¡Turno apartado temporalmente por 15 minutos!*\n\n` +
          `🏢 Establecimiento: *${complejo.nombre}*\n` +
          `🏟️ Cancha: *${session.canchaSeleccionada!.nombre}*\n` +
          `📅 Fecha: *${session.fechaSeleccionada}*\n` +
          `⏰ Horario: *${horaIniNorm} - ${horaFinNorm}* (${duracionHoras === 2 ? '2 Horas seguidas' : '1 Hora'})\n` +
          `💰 Total: *${totalFmt}*\n` +
          `💵 Anticipo requerido: *${anticipoFmt}* (${porcentaje}%)\n\n` +
          `📲 *Cuentas Oficiales de Recaudo:*\n` +
          `• Nequi / Daviplata: *${nequi}*\n` +
          `• Titular: *${titular}*\n\n` +
          `📸 *¿Cómo confirmar?*\n` +
          `Realiza la transferencia y *envía aquí la foto o captura del comprobante*.\n` +
          `🤖 Nuestro sistema con Inteligencia Artificial lo auditará al instante para confirmar tu reserva, o será validado por la administración.\n\n` +
          `💬 _¿Tienes alguna duda con el pago o tu reserva? Escribe *ASESOR* en cualquier momento para hablar con un encargado._`,
      };
    } catch (err: any) {
      console.error('Error al apartar turno en reserva:', err);
      return {
        texto: this.formatearErrorAmigable(err),
      };
    }
  }

  private static formatearErrorAmigable(err: any): string {
    const raw = (err?.message || '').toLowerCase();

    // 1. Conflicto de turno ya reservado por otro usuario
    if (
      raw.includes('apartado por otra') ||
      raw.includes('conflict') ||
      raw.includes('23p01') ||
      raw.includes('solapad') ||
      raw.includes('no_doble_reserva')
    ) {
      return (
        '⚠️ *¡Horario no disponible!*\n\n' +
        'Este turno acaba de ser apartado por otra persona hace un momento.\n' +
        'Por favor selecciona otro horario disponible o escribe *MENU* para volver a empezar.'
      );
    }

    // 2. Mantenimiento o cancha bloqueada
    if (raw.includes('bloquead') || raw.includes('mantenimiento') || raw.includes('inactiva')) {
      return (
        '⚠️ *Horario no disponible*\n\n' +
        'Esta cancha se encuentra temporalmente fuera de servicio en ese rango horario.\n' +
        'Por favor selecciona otro horario o escribe *MENU*.'
      );
    }

    // 3. Fallo genérico / base de datos / sintaxis
    return (
      '⚠️ *No pudimos apartar el turno en este momento*\n\n' +
      'Por favor intenta seleccionar otro horario o escribe *MENU* para volver al inicio.'
    );
  }

  private static async manejarEsperaPago(
    input: string,
    session: UserSession,
    complejo: Complejo,
    mediaId?: string,
    mediaType?: string
  ): Promise<BotResponse> {
    if (!session.reservaId) {
      session.paso = 'INICIO';
      return { texto: 'No hay ninguna reserva en proceso. Escribe *HOLA* para iniciar una nueva.' };
    }

    const porcentaje = complejo.porcentaje_anticipo_minimo ?? 50;
    const anticipoRequerido = (session.horarioSeleccionado?.precio || 0) * (porcentaje / 100);

    // ==============================================================================
    // CASO 1: EL CLIENTE ENVIÓ UNA IMAGEN (COMPROBANTE MULTIMEDIA -> OPCIÓN B CON IA)
    // ==============================================================================
    if (mediaId) {
      const mediaDescargado = await ReceiptVerificationService.descargarImagenMeta(mediaId, complejo.whatsapp_token);

      if (mediaDescargado) {
        const analisis = await ReceiptVerificationService.analizarComprobante(
          mediaDescargado.buffer,
          mediaDescargado.mimeType,
          anticipoRequerido,
          complejo.nequi_numero,
          complejo.titular_cuenta
        );

        // 1.1 DETECCIÓN DE FRAUDE / ALTERACIÓN
        if (analisis.es_sospechoso_fraude) {
          const motivos = analisis.indicios_fraude.join(', ') || 'Inconsistencia tipográfica o visual';
          await supabase
            .from('reservas')
            .update({ notas: `⚠️ ALERTA FRAUDE IA: ${motivos} - ${analisis.explicacion}` })
            .eq('id', session.reservaId);

          return {
            texto: `⚠️ *ALERTA EN VALIDACIÓN AUTOMÁTICA*\n\n` +
              `El sistema detectó posibles inconsistencias en el comprobante (${motivos}).\n\n` +
              `🔒 Tu turno sigue apartado temporalmente, pero *un administrador de ${complejo.nombre} revisará manualmente el pago en la cuenta bancaria antes de confirmar.* Te notificaremos en cuanto sea verificado.`,
          };
        }

        // 1.2 COMPROBANTE AUTÉNTICO Y VÁLIDO (CONFIRMACIÓN 100% AUTOMÁTICA - OPCIÓN B)
        if (analisis.es_valido && analisis.referencia_detectada) {
          const yaUsada = await ReceiptVerificationService.esReferenciaDuplicada(analisis.referencia_detectada);

          if (yaUsada) {
            return {
              texto: `⚠️ *Comprobante ya utilizado:*\nEl número de referencia *${analisis.referencia_detectada}* ya fue registrado en otra reserva previa. Por favor envía un comprobante nuevo o contacta a la administración de ${complejo.nombre}.`,
            };
          }

          // Confirmar automáticamente la reserva
          await BookingService.registrarPagoAnticipo({
            reservaId: session.reservaId,
            metodo: 'nequi',
            monto: analisis.monto_detectado || anticipoRequerido,
            referencia: analisis.referencia_detectada,
          });

          await supabase
            .from('pagos_anticipos')
            .update({ revisado_por: 'IA_GEMINI', notas_admin: `Auditado por Gemini Flash: ${analisis.explicacion}` })
            .eq('reserva_id', session.reservaId);

          session.paso = 'INICIO';

          const montoFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(analisis.monto_detectado || anticipoRequerido);

          return {
            texto: `🤖⚡ *¡PAGO AUDITADO Y APROBADO POR IA!*\n\n` +
              `✅ Comprobante verificado con éxito:\n` +
              `• Referencia: *#${analisis.referencia_detectada}*\n` +
              `• Monto: *${montoFmt}*\n` +
              `• Destino: *${analisis.destinatario_detectado || complejo.nombre}*\n\n` +
              `🎉 *¡RESERVA 100% CONFIRMADA!*\n` +
              `🏢 *${complejo.nombre}*\n` +
              `🏟️ Cancha: *${session.canchaSeleccionada?.nombre}*\n` +
              `📅 Fecha: *${session.fechaSeleccionada}*\n` +
              `⏰ Horario: *${session.horarioSeleccionado?.hora_inicio.slice(0, 5)} - ${session.horarioSeleccionado?.hora_fin.slice(0, 5)}*\n\n` +
              `🔔 Te enviaremos un recordatorio 2 horas antes de tu juego. ¡Nos vemos en la cancha!`,
          };
        }

        // 1.3 IA CON BAJA CONFIANZA O SIN API KEY -> FALLBACK ELEGANTE A OPCIÓN A (VISOR ADMIN)
        await supabase
          .from('reservas')
          .update({ notas: `Comprobante recibido vía WhatsApp (Media ID: ${mediaId}). Pendiente de aprobación manual en visor.` })
          .eq('id', session.reservaId);

        return {
          texto: `📸 *¡Comprobante recibido con éxito!*\n\n` +
            `Nuestro equipo de administración en *${complejo.nombre}* está verificando tu pago en el visor de control.\n\n` +
            `⏳ Tu turno sigue bloqueado para ti. Te llegará la confirmación oficial por este mismo chat en cuanto el administrador presione "Aprobar Anticipo".`,
        };
      }
    }

    // ==============================================================================
    // CASO 2: EL CLIENTE ESCRIBIÓ TEXTO O CÓDIGO MANUAL (DERIVACIÓN A OPCIÓN A)
    // ==============================================================================
    await supabase
      .from('reservas')
      .update({ notas: `Cliente reportó pago manual vía texto: "${input}". Pendiente de verificación por administrador.` })
      .eq('id', session.reservaId);

    return {
      texto: `📄 *Datos de pago registrados: "${input}"*\n\n` +
        `Tu comprobante/referencia ha sido enviado al visor de control de *${complejo.nombre}*.\n\n` +
        `⏳ Un administrador lo validará en la cuenta bancaria y recibirás un mensaje de confirmación por este chat en cuanto sea aprobado.`,
    };
  }

  /**
   * Flujo exclusivo para pedidos de comida/bebidas 100% a domicilio (Graniza2KL)
   */
  private static async manejarFlujoPedidos(
    telefono: string,
    texto: string,
    input: string,
    session: UserSession,
    complejo: Complejo,
    nombrePush?: string,
    mediaId?: string,
    mediaType?: string
  ): Promise<BotResponse> {
    const cliente = await BookingService.getOrCreateCliente(telefono, nombrePush);

    // 1. Si está esperando comprobante de pago y envió una imagen
    if (session.paso === 'ESPERA_PAGO' && mediaId) {
      const resPago = await this.manejarEsperaPago(input, session, complejo, mediaId, mediaType);
      if (resPago.texto.includes('¡PAGO AUDITADO') || resPago.texto.includes('APROBADO POR IA')) {
        const direccion = session.pedidoInfo?.direccion || 'tu dirección';
        return {
          texto: `🍧 *¡PAGO VERIFICADO EXITOSAMENTE POR IA!* ✅\n\n` +
            `¡Muchísimas gracias ${nombrePush || ''}! Tu pago ha sido confirmado con éxito.\n\n` +
            `Tu pedido ha entrado inmediatamente a preparación en la cocina de *${complejo.nombre}* y te avisaremos en cuanto el repartidor salga hacia tu dirección: *${direccion}* 🛵💨\n\n` +
            `¡Que disfrutes tus granizados artesanales! 🍧✨`,
        };
      }
      return resPago;
    }

    // 2. Si el cliente estaba pendiente de ingresar la dirección
    if (session.paso === 'PEDIDO_ESPERA_DIRECCION' && session.pedidoInfo) {
      const direccion = texto.trim();
      session.pedidoInfo.direccion = direccion;

      const canchas = await BookingService.getCanchas(complejo.id);
      const estacionId = canchas[0]?.id;

      if (!estacionId) {
        return { texto: '⚠️ Error temporal en la estación de despacho. Por favor intenta en unos minutos.' };
      }

      const ahoraIso = new Date().toISOString();
      const finIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const detalleCompleto = `🍧 ${session.pedidoInfo.detalle} 📍 Domicilio: ${direccion} [ESPERANDO_PAGO]`;

      const preOrden = await BookingService.crearPreReserva({
        canchaId: estacionId,
        clienteId: cliente.id,
        fechaInicio: ahoraIso,
        fechaFin: finIso,
        valorTotal: session.pedidoInfo.total,
        porcentajeAnticipo: 100,
      });

      await supabase.from('reservas').update({ notas: detalleCompleto }).eq('id', preOrden.id);
      session.reservaId = preOrden.id;
      session.paso = 'ESPERA_PAGO';

      const totalFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(session.pedidoInfo.total);

      return {
        texto: `🍧 *¡PEDIDO REGISTRADO EN GRANIZA2KL!* 🛵\n\n` +
          `📋 *Detalle de tu orden:*\n${session.pedidoInfo.detalle}\n\n` +
          `📍 *Dirección de Entrega:* ${direccion}\n` +
          `💰 *Total a Transferir:* ${totalFmt} COP (100% anticipado)\n\n` +
          `📲 *Datos para Transferencia Inmediata:*\n` +
          `• Nequi / Daviplata: *${complejo.nequi_numero || '3105551234'}*\n` +
          `• Titular: *${complejo.titular_cuenta || 'Graniza2KL Artesanales'}*\n\n` +
          `📸 *Por favor envíanos la foto o captura del comprobante por aquí* para verificar con IA, comenzar a licuar tus granizados y despachar de inmediato 🛵✨`,
      };
    }

    // 3. Extracción contextual de pedidos desde el mensaje entrante
    const pedidoDetectado = this.extraerPedidoGranizados(texto);

    if (pedidoDetectado.esPedido && pedidoDetectado.items.length > 0) {
      session.pedidoInfo = {
        detalle: pedidoDetectado.resumen,
        total: pedidoDetectado.total,
        direccion: pedidoDetectado.direccion,
        items: pedidoDetectado.items,
      };

      // Si el cliente dio los productos Y la dirección en el mismo mensaje inicial
      if (pedidoDetectado.direccion) {
        const canchas = await BookingService.getCanchas(complejo.id);
        const estacionId = canchas[0]?.id;

        if (estacionId) {
          const ahoraIso = new Date().toISOString();
          const finIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          const detalleCompleto = `🍧 ${pedidoDetectado.resumen} 📍 Domicilio: ${pedidoDetectado.direccion} [ESPERANDO_PAGO]`;

          const preOrden = await BookingService.crearPreReserva({
            canchaId: estacionId,
            clienteId: cliente.id,
            fechaInicio: ahoraIso,
            fechaFin: finIso,
            valorTotal: pedidoDetectado.total,
            porcentajeAnticipo: 100,
          });

          await supabase.from('reservas').update({ notas: detalleCompleto }).eq('id', preOrden.id);
          session.reservaId = preOrden.id;
          session.paso = 'ESPERA_PAGO';

          const totalFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(pedidoDetectado.total);

          return {
            texto: `🍧 *¡ORDEN DETECTADA Y REGISTRADA EN GRANIZA2KL!* 🛵\n\n` +
              `¡Entendido ${nombrePush || ''}! He tomado todos los datos de tu pedido:\n` +
              `📋 *Productos:* ${pedidoDetectado.resumen}\n` +
              `📍 *Dirección de Entrega:* ${pedidoDetectado.direccion}\n` +
              `💰 *Total a Transferir:* ${totalFmt} COP\n\n` +
              `📲 *Datos para Transferir (Nequi / Daviplata):*\n` +
              `• Número: *${complejo.nequi_numero || '3105551234'}*\n` +
              `• Titular: *${complejo.titular_cuenta || 'Graniza2KL'}*\n\n` +
              `📸 Envíanos la captura de tu comprobante por este chat para verificar con IA, licuar tus granizados y despachar al repartidor de inmediato 🛵✨`,
          };
        }
      }

      // Si especificó sabores pero aún no tenemos dirección
      session.paso = 'PEDIDO_ESPERA_DIRECCION';
      const totalFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(pedidoDetectado.total);

      return {
        texto: `¡Con mucho gusto ${nombrePush || ''}! 🍧✨\n\n` +
          `📋 *He preparado tu orden:*\n` +
          `• ${pedidoDetectado.resumen}\n` +
          `💰 *Total:* ${totalFmt} COP\n\n` +
          `🛵 *Recuerda que en Graniza2KL el servicio es 100% a domicilio.*\n\n` +
          `👉 *¿A qué dirección y barrio te lo llevamos?*\n` +
          `_(Ejemplo: Calle 15 # 4-20, Álamos / Pereira)_`,
      };
    }

    // 4. Si es solo saludo o consulta general, mostrar la carta exclusiva con licor a domicilio
    return {
      texto: `👋 ¡Hola ${nombrePush || ''}! Bienvenido a *Graniza2KL - Granizados con Licor* 🍸🍧\n` +
        `Especialistas en cócteles frappé y granizados artesanales con licor (+18).\n` +
        `🛵 *Servicio 100% Exclusivo a Domicilio en Pereira y Dosquebradas.*\n\n` +
        `*🍸 NUESTRA CARTA DE CÓCTELES GRANIZADOS (+18):*\n` +
        `1️⃣ *Clásico con Licor (16oz):* $12.000 COP\n` +
        `2️⃣ *Mega Cóctel Frappé (24oz):* $17.000 COP  *(Para rumbear o compartir)*\n\n` +
        `*🍹 Sabores & Combinaciones con Licor:*\n` +
        `• *Maracuyá con Vodka Smirnoff* (con lecherita)\n` +
        `• *Mango Biche Tequilero* (con Tequila, sal, limón y tajín)\n` +
        `• *Frutos Rojos con Ron* (silvestres con toque de ron)\n` +
        `• *Café Baileys Frappé* (con crema de whisky)\n` +
        `• *Tamarindo Tequilero* (con Chamoy y Tajín)\n` +
        `• *Coco Loco Frappé* (con Ron Blanco)\n\n` +
        `✨ *Toppings gratis a elección:* Lecherita, Chamoy, Tajín o Sal y Limón.\n\n` +
        `🛵 *¿Cómo pedir?*\n` +
        `Escríbenos directamente lo que deseas y tu dirección.\n` +
        `👉 *Ejemplo:* _"Quiero 2 clásicos de maracuyá con vodka para la Calle 15 # 4-20 Álamos"_\n` +
        `• _(O escribe *ASESOR* en cualquier momento para hablar con un encargado de cocina o despacho)_ 🍸💨`,
    };
  }

  /**
   * Extrae sabores, licores, cantidades, tamaños y dirección de un texto libre para Graniza2KL
   */
  private static extraerPedidoGranizados(texto: string): {
    esPedido: boolean;
    items: string[];
    resumen: string;
    total: number;
    direccion?: string;
  } {
    const t = texto.toLowerCase();
    const saboresDisponibles = [
      { clave: 'maracuya', nombre: 'Maracuyá con Vodka (+18)' },
      { clave: 'maracuyá', nombre: 'Maracuyá con Vodka (+18)' },
      { clave: 'vodka', nombre: 'Maracuyá con Vodka (+18)' },
      { clave: 'mango', nombre: 'Mango Biche Tequilero (+18)' },
      { clave: 'biche', nombre: 'Mango Biche Tequilero (+18)' },
      { clave: 'tequila', nombre: 'Mango Biche Tequilero (+18)' },
      { clave: 'frutos rojos', nombre: 'Frutos Rojos con Ron (+18)' },
      { clave: 'ron', nombre: 'Frutos Rojos con Ron (+18)' },
      { clave: 'mora', nombre: 'Frutos Rojos con Ron (+18)' },
      { clave: 'baileys', nombre: 'Café Baileys Frappé (+18)' },
      { clave: 'cafe', nombre: 'Café Baileys Frappé (+18)' },
      { clave: 'café', nombre: 'Café Baileys Frappé (+18)' },
      { clave: 'tamarindo', nombre: 'Tamarindo Tequilero con Chamoy (+18)' },
      { clave: 'chamoy', nombre: 'Tamarindo Tequilero con Chamoy (+18)' },
      { clave: 'coco', nombre: 'Coco Loco con Ron (+18)' },
      { clave: 'guaro', nombre: 'Granizado Antioqueño con Maracuyá (+18)' },
      { clave: 'aguardiente', nombre: 'Granizado Antioqueño con Maracuyá (+18)' },
    ];

    let precioUnitario = 12000;
    let tamanoStr = 'Clásico con Licor (16oz)';
    if (t.includes('mega') || t.includes('24oz') || t.includes('grande')) {
      precioUnitario = 17000;
      tamanoStr = 'Mega Cóctel (24oz)';
    } else if (t.includes('personal') || t.includes('12oz') || t.includes('pequeñ') || t.includes('pequen')) {
      precioUnitario = 9000;
      tamanoStr = 'Personal con Licor (12oz)';
    }

    let cantidadGlobal = 1;
    const numMatch = t.match(/(\d+)\s*(?:granizado|vaso|coctel|cóctel|mega|clasico|personal|de)/i);
    if (numMatch && parseInt(numMatch[1], 10) > 0) {
      cantidadGlobal = parseInt(numMatch[1], 10);
    } else if (t.includes('dos ') || t.includes('2 ')) {
      cantidadGlobal = 2;
    } else if (t.includes('tres ') || t.includes('3 ')) {
      cantidadGlobal = 3;
    } else if (t.includes('cuatro ') || t.includes('4 ')) {
      cantidadGlobal = 4;
    }

    const itemsEncontrados: string[] = [];
    const saboresProcesados = new Set<string>();

    for (const s of saboresDisponibles) {
      if (t.includes(s.clave) && !saboresProcesados.has(s.nombre)) {
        saboresProcesados.add(s.nombre);
        itemsEncontrados.push(`${cantidadGlobal}x Granizado ${tamanoStr} de ${s.nombre}`);
      }
    }

    if (itemsEncontrados.length === 0 && (t.includes('granizado') || t.includes('granizados') || t.includes('coctel') || t.includes('licor'))) {
      itemsEncontrados.push(`${cantidadGlobal}x Granizado ${tamanoStr} Especial (+18)`);
    }

    let direccion: string | undefined;
    const dirRegex = /(?:calle|cra|carrera|cll|kr|av|avenida|diagonal|transversal|manzana|mz|barrio|conjunto|urbanizacion|pinares|álamos|alamos|centro)[^,\n.]+/i;
    const dirMatch = texto.match(dirRegex);
    if (dirMatch) {
      direccion = dirMatch[0].trim();
    } else {
      const paraLa = texto.match(/(?:para|hacia|en)\s+(?:la\s+|el\s+)?([a-zA-Z0-9\s#\-_]{7,})/i);
      if (paraLa && paraLa[1]) {
        direccion = paraLa[1].trim();
      }
    }

    const total = (itemsEncontrados.length || 1) * cantidadGlobal * precioUnitario;

    return {
      esPedido: itemsEncontrados.length > 0,
      items: itemsEncontrados,
      resumen: itemsEncontrados.join(' + '),
      total,
      direccion,
    };
  }

  /**
   * Extrae cancha, fecha y hora cuando el cliente escribe con contexto natural
   */
  private static extraerContextoReserva(texto: string, canchas: Cancha[]): {
    cancha?: Cancha;
    fecha?: string;
    hora?: string;
  } {
    const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Cancha o Recurso
    let canchaMatch: Cancha | undefined;
    for (const c of canchas) {
      const nom = c.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const deporte = c.deporte.toLowerCase();
      const palabras = nom.split(/[\s\-()]+/);
      const coincide = palabras.some((p) => p.length >= 4 && t.includes(p)) || t.includes(deporte);
      if (coincide) {
        canchaMatch = c;
        break;
      }
    }

    // 2. Fecha
    let fechaMatch: string | undefined;
    const palabrasTexto = texto.split(/\s+/);
    for (let i = 0; i < palabrasTexto.length; i++) {
      const fragmento = palabrasTexto.slice(i, i + 3).join(' ');
      const f = this.interpretarFecha(fragmento);
      if (f) {
        fechaMatch = f;
        break;
      }
    }
    if (!fechaMatch && (t.includes('hoy') || t.includes('manana') || t.includes('viernes') || t.includes('sabado') || t.includes('domingo'))) {
      fechaMatch = this.interpretarFecha(t) || undefined;
    }

    // 3. Hora (ej: "7pm", "19:00", "8:00", "3 de la tarde")
    let horaMatch: string | undefined;
    const horaRegex = /(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche)?/i;
    const hMatch = texto.match(horaRegex);
    if (hMatch) {
      let num = parseInt(hMatch[1], 10);
      const sufijo = (hMatch[3] || '').toLowerCase();
      if ((sufijo.includes('pm') || sufijo.includes('tarde') || sufijo.includes('noche')) && num < 12) {
        num += 12;
      }
      if (num >= 6 && num <= 23) {
        horaMatch = `${String(num).padStart(2, '0')}:00`;
      }
    }

    return {
      cancha: canchaMatch,
      fecha: fechaMatch,
      hora: horaMatch,
    };
  }

  /**
   * Procesa respuestas al recordatorio de 1 día antes:
   * 1. Confirmar cita
   * 2. Cancelar cita
   * 3. Cambiar fecha (Reagendar con enlace web y preservación de cita anterior)
   */
  private static async manejarRespuestaRecordatorio(
    telefono: string,
    texto: string,
    input: string,
    complejo: Complejo,
    session: UserSession
  ): Promise<BotResponse | null> {
    const matchId = texto.match(/(?:confirmar|cancelar|reagendar|cambiar_fecha)_cita_([a-zA-Z0-9-]+)/i);
    const idDirecto = matchId ? matchId[1] : null;

    const esConfirmar =
      (idDirecto !== null && texto.includes('confirmar_cita_')) ||
      input === '1' ||
      input === 'confirmar' ||
      input === 'confirmar cita' ||
      input === 'confirmo' ||
      input.includes('confirmar cita');

    const esCancelar =
      (idDirecto !== null && texto.includes('cancelar_cita_')) ||
      input === '2' ||
      input === 'cancelar cita' ||
      input === 'cancelo' ||
      input.includes('cancelar cita');

    const esReagendar =
      (idDirecto !== null && (texto.includes('reagendar_cita_') || texto.includes('cambiar_fecha_'))) ||
      input === '3' ||
      input === 'cambiar fecha' ||
      input === 'reagendar' ||
      input === 'reprogramar' ||
      input === 'cambio de fecha' ||
      input.includes('cambiar fecha') ||
      input.includes('reagendar');

    if (!esConfirmar && !esCancelar && !esReagendar) {
      return null;
    }

    if (!idDirecto && session.paso !== 'INICIO') {
      return null;
    }

    let reserva: any = null;

    if (idDirecto) {
      const { data } = await supabase
        .from('reservas')
        .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
        .eq('id', idDirecto)
        .maybeSingle();
      reserva = data;
    }

    if (!reserva) {
      const cleanTel = telefono.replace(/\D/g, '');
      const telVariaciones = [
        telefono,
        cleanTel,
        cleanTel.startsWith('57') ? cleanTel.slice(2) : `57${cleanTel}`,
      ];

      const { data: clientes } = await supabase
        .from('clientes')
        .select('id')
        .in('telefono_wa', telVariaciones);

      const clienteIds = (clientes || []).map((c) => c.id);

      if (clienteIds.length > 0) {
        const { data: proxReservas } = await supabase
          .from('reservas')
          .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
          .in('cliente_id', clienteIds)
          .eq('estado', 'confirmada')
          .gte('fecha_inicio', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
          .order('fecha_inicio', { ascending: true })
          .limit(1);

        if (proxReservas && proxReservas.length > 0) {
          reserva = proxReservas[0];
        }
      }
    }

    if (!reserva) {
      if (idDirecto || input.includes('cita')) {
        return {
          texto: `Hola, no encontramos una cita activa para confirmar o modificar en este momento. Si deseas programar una nueva cita, escribe *MENU*. 🌸`,
        };
      }
      return null;
    }

    const cancha = reserva.canchas as any;
    const complejoRes = cancha?.complejos as any || complejo;
    const esSpa = complejoRes?.slug === 'mimate-nails' || complejoRes?.tipo_negocio === 'belleza_unas';

    const fechaCita = new Date(reserva.fecha_inicio).toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    });
    const horaInicio = new Date(reserva.fecha_inicio).toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // CASO 1: CONFIRMAR CITA
    if (esConfirmar) {
      const notasActuales = reserva.notas || '';
      if (!notasActuales.includes('[CONFIRMADA_POR_CLIENTA]')) {
        await supabase
          .from('reservas')
          .update({ notas: `${notasActuales} [CONFIRMADA_POR_CLIENTA]`.trim() })
          .eq('id', reserva.id);
      }

      if (esSpa) {
        return {
          texto:
            `🌸✨ *¡CITA CONFIRMADA EXITOSAMENTE!* ✨🌸\n\n` +
            `¡Muchísimas gracias reina! Tu asistencia para el *${fechaCita}* a las *${horaInicio}* con *${cancha.nombre}* está 100% confirmada.\n\n` +
            `📍 Te esperamos con todo el amor en nuestro spa (Pereira, Cuba - Calle 66 bis #26-57).\n` +
            `¡Nos vemos mañana para consentirte y dejarte hermosa! 💕💅`,
        };
      } else {
        return {
          texto:
            `✅ *¡RESERVA CONFIRMADA EXITOSAMENTE!*\n\n` +
            `Muchas gracias. Tu reserva para el *${fechaCita}* a las *${horaInicio}* en *${cancha.nombre}* está confirmada.\n\n` +
            `¡Te esperamos puntualmente! 🏟️`,
        };
      }
    }

    // CASO 2: CANCELAR CITA
    if (esCancelar) {
      const notasActuales = reserva.notas || '';
      await supabase
        .from('reservas')
        .update({
          estado: 'cancelada',
          notas: `${notasActuales} [CANCELADA_POR_CLIENTA]`.trim(),
        })
        .eq('id', reserva.id);

      if (esSpa) {
        return {
          texto:
            `🌸 *CITA CANCELADA*\n\n` +
            `Hemos cancelado tu cita del *${fechaCita}* a las *${horaInicio}* con *${cancha.nombre}* y liberado el cupo en la agenda.\n\n` +
            `Lamentamos que no puedas acompañarnos esta vez. Cuando desees volver a consentirte, puedes agendar en cualquier momento escribiendo *MENU* o desde nuestra web. ¡Que tengas un lindo día! 💕`,
        };
      } else {
        return {
          texto:
            `❌ *RESERVA CANCELADA*\n\n` +
            `Tu reserva del *${fechaCita}* a las *${horaInicio}* ha sido cancelada y el espacio ha sido liberado.\n\n` +
            `Esperamos verte pronto en una próxima ocasión. 🏟️`,
        };
      }
    }

    // CASO 3: REAGENDAR (CAMBIAR FECHA)
    if (esReagendar) {
      const baseUrl = process.env.FRONTEND_URL || 'https://mimate-nails-spa.vercel.app';
      const linkReagendar = `${baseUrl}/?reagendar=${reserva.id}`;

      if (esSpa) {
        return {
          texto:
            `📅✨ *REAGENDAR CITA - JL MÍMATE NAILS* ✨🌸\n\n` +
            `¡Claro que sí reina! Para elegir una nueva fecha y horario disponible, ingresa a este enlace:\n\n` +
            `👉 *${linkReagendar}*\n\n` +
            `💡 *Ten presente:*\n` +
            `• Tu cita actual (*${fechaCita}* a las *${horaInicio}*) *permanece guardada* hasta que confirmes la nueva fecha en el enlace.\n` +
            `• Si completas la nueva reserva en la página, tu cita anterior se cancelará automáticamente y quedará vigente la nueva.\n` +
            `• Si no reagendas, tu cita original seguirá tal cual como la tienes programada.\n\n` +
            `¡Haz clic en el enlace para elegir tu nuevo horario! 💕💅`,
        };
      } else {
        return {
          texto:
            `📅 *CAMBIAR FECHA DE RESERVA*\n\n` +
            `Puedes elegir una nueva fecha y horario ingresando al siguiente enlace:\n\n` +
            `👉 *${linkReagendar}*\n\n` +
            `Nota: Tu reserva actual se mantendrá activa hasta que confirmes la nueva en el enlace.`,
        };
      }
    }

    return null;
  }
}
