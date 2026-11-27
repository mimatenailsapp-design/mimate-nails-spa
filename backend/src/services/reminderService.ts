import { supabase } from '../config/supabase.js';
import { BaileysService } from './baileysService.js';
import { requiereAnticipoParaFecha, obtenerNombreRealManicurista } from './bookingService.js';

export class ReminderService {
  /**
   * Helper para formatear la hora en formato 12 horas con a.m. / p.m. (ej: 9:30 a.m., 1:00 p.m.)
   */
  private static formatearHora12(d: Date): string {
    const raw = d.toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return raw.toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Helper para obtener el nombre real de la especialista (Lili, Jhoana, Manuela)
   */
  private static obtenerNombreEspecialista(cancha: any): string {
    return obtenerNombreRealManicurista(cancha, 'Especialista');
  }
  /**
   * Ejecuta la rutina periódica de recordatorios:
   * 1. Recordatorio 1 día antes de la cita
   * 2. Recordatorio el mismo día de la cita
   */
  /**
   * Ejecuta la rutina periódica de recordatorios:
   * Garantiza que a una clienta le llegue ÚNICAMENTE UN (1) recordatorio para evitar confusiones:
   * 1. Citas programadas para días posteriores: Llega 1 día antes (víspera de la cita).
   *    Incluso si agenda hoy a las 2:00 PM para mañana a las 8:00 AM, le llega el recordatorio de 1 día antes.
   * 2. Citas programadas para el mismo día en que se agendan: Llega 3 horas antes de la cita.
   * 3. Si ya recibió cualquiera de los dos recordatorios ([REC_ENVIADO] / [REC_1_DIA] / [REC_MISMO_DIA]),
   *    NO se le vuelve a enviar ningún otro mensaje.
   */
  static async procesarRecordatoriosProximos() {
    const resDiaAntes = await this.procesarRecordatoriosDiaAntes();
    const resMismoDia = await this.procesarRecordatoriosMismoDia();

    return {
      enviadosDiaAntes: resDiaAntes.enviados,
      enviadosMismoDia: resMismoDia.enviados,
      totalEnviados: resDiaAntes.enviados + resMismoDia.enviados,
    };
  }

  /**
   * Helper para obtener la fecha 'YYYY-MM-DD' en la zona horaria de Colombia
   */
  private static obtenerFechaCol(fechaDate: Date): string {
    const partes = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(fechaDate);

    const year = partes.find((p) => p.type === 'year')?.value;
    const month = partes.find((p) => p.type === 'month')?.value;
    const day = partes.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  }

  /**
   * Envía recordatorio 1 DÍA ANTES de la cita:
   * Aplica a citas cuya fecha de atención es MAÑANA (día calendario siguiente en Colombia)
   * o citas en la franja de 10 a 36 horas previas, siempre que la fecha de la cita no sea hoy.
   */
  static async procesarRecordatoriosDiaAntes() {
    const ahora = new Date();

    // Solo enviar recordatorios del día antes en horario diurno respetuoso (entre 8:00 a.m. y 8:00 p.m. en Colombia)
    // para evitar escribir a las clientas en la madrugada (ej. a las 12:05 a.m.)
    const horaStr = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hour12: false,
    }).format(ahora);
    const horaActualCol = parseInt(horaStr, 10);
    if (horaActualCol < 8 || horaActualCol >= 20) {
      return { enviados: 0 };
    }

    const fechaHoyCol = this.obtenerFechaCol(ahora);

    // Calculamos la fecha de mañana en Colombia
    const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    const fechaMananaCol = this.obtenerFechaCol(manana);

    // Franja amplia de búsqueda en UTC (con margen de 4h atrás por si una cita traslapada tiene db_fecha_inicio desplazada)
    const desdeIso = new Date(ahora.getTime() - 4 * 60 * 60 * 1000).toISOString();
    const hastaIso = new Date(ahora.getTime() + 40 * 60 * 60 * 1000).toISOString();

    const { data: reservas, error } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('estado', 'confirmada')
      .gte('fecha_inicio', desdeIso)
      .lte('fecha_inicio', hastaIso);

    if (error || !reservas) return { enviados: 0 };

    const regexHorarioReal = /\[HORARIO_REAL:([^|\]]+)\|([^\]]+)\]/i;

    interface CitaAgrupada {
      r: any;
      dInicio: Date;
      notas: string;
      servicio: string;
      especialista: string;
      nombreCliente: string;
      telefono: string;
      complejo: any;
    }

    const mapaGrupos = new Map<string, CitaAgrupada[]>();

    for (const r of reservas) {
      const notas = r.notas || '';
      // Si ya recibió recordatorio de cualquier tipo, NUNCA enviar otro
      if (
        notas.includes('[REC_1_DIA]') ||
        notas.includes('[REC_MISMO_DIA]') ||
        notas.includes('[REC_ENVIADO]')
      ) {
        continue;
      }

      const matchReal = notas.match(regexHorarioReal);
      const fechaInicioRealIso =
        matchReal && matchReal[1] && !isNaN(new Date(matchReal[1].trim()).getTime())
          ? matchReal[1].trim()
          : r.fecha_inicio;
      const dInicio = new Date(fechaInicioRealIso);
      if (dInicio.getTime() <= ahora.getTime()) {
        continue;
      }
      const fechaCitaCol = this.obtenerFechaCol(dInicio);

      // El recordatorio de 1 día antes aplica ESTRICTAMENTE cuando la cita es MAÑANA en Colombia
      if (fechaCitaCol !== fechaMananaCol) {
        continue;
      }

      const cliente = r.clientes as any;
      const cancha = r.canchas as any;
      const complejo = cancha?.complejos as any;
      const telefono = cliente?.telefono_wa;
      if (!telefono) continue;

      let nombreCliente = cliente.nombre || 'Cliente';
      const matchNom = notas.match(/Clienta:\s*([^|[\n]+)/i);
      if (matchNom && matchNom[1]) nombreCliente = matchNom[1].trim();

      let servicio = 'tu servicio de uñas';
      const matchSvc = notas.match(/Servicio:\s*([^|[\n]+)/i);
      if (matchSvc && matchSvc[1]) servicio = matchSvc[1].trim();

      const especialista = this.obtenerNombreEspecialista(cancha);

      // Clave de agrupación: teléfono limpio (últimos 10 dígitos) para unificar citas seguidas/simultáneas de la misma clienta
      const cleanTel = telefono.replace(/\D/g, '');
      const keyGrupo = cleanTel.length >= 10 ? cleanTel.slice(-10) : (r.cliente_id || cleanTel);

      const item: CitaAgrupada = {
        r,
        dInicio,
        notas,
        servicio,
        especialista,
        nombreCliente,
        telefono,
        complejo,
      };

      if (!mapaGrupos.has(keyGrupo)) {
        mapaGrupos.set(keyGrupo, []);
      }
      mapaGrupos.get(keyGrupo)!.push(item);
    }

    let enviados = 0;

    for (const [_, grupo] of mapaGrupos.entries()) {
      // Ordenar por hora de inicio: la primera cita del día determina la hora y el saludo
      grupo.sort((a, b) => a.dInicio.getTime() - b.dInicio.getTime());
      const primera = grupo[0];

      // Regla exacta de 24 horas: Se evalúa según la hora de la primera cita
      const horasFaltantes = (primera.dInicio.getTime() - ahora.getTime()) / (1000 * 60 * 60);
      if (horasFaltantes > 24) {
        continue;
      }

      const fechaCita = primera.dInicio.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const horaInicio = this.formatearHora12(primera.dInicio);

      // Unificar servicios sin duplicados (ej: "Semi pies + Retoque")
      const serviciosList = Array.from(new Set(grupo.map((g) => g.servicio).filter(Boolean)));
      const servicioTexto = serviciosList.join(' + ');
      const etiquetaServicio = serviciosList.length > 1 ? '💅 *Servicios:*' : '💅 *Servicio:*';

      // Unificar especialistas sin duplicados (ej: "Lili y Manuela" o simplemente "Lili")
      const especialistasList = Array.from(new Set(grupo.map((g) => g.especialista).filter(Boolean)));
      const especialistaTexto = especialistasList.join(' y ');
      const etiquetaEspecialista = especialistasList.length > 1 ? '👩‍🎨 *Especialistas:*' : '👩‍🎨 *Especialista:*';

      const exigeAnticipo = grupo.some(
        (g) => requiereAnticipoParaFecha(g.complejo, g.dInicio) || Number(g.r.valor_anticipo_requerido) > 0
      );
      let notaPago = '✨ *Nota:* Recuerda que cancelas el valor en el spa (sin cobros anticipados).';
      if (exigeAnticipo) {
        const tienePagoAprobado = grupo.some(
          (g) => g.notas.includes('[COMPROBANTE_VALIDO_IA]') || g.notas.includes('[PAGO_APROBADO]')
        );
        if (tienePagoAprobado) {
          notaPago = '✨ *Nota:* Tu abono de anticipo ya fue validado con éxito. El saldo restante lo cancelas en el spa.';
        } else {
          notaPago = '✨ *Nota:* Recuerda que tu cita cuenta con abono registrado.';
        }
      }

      const encabezado = `💅✨ *RECORDATORIO DE TU CITA MAÑANA - JL MÍMATE NAILS* 🌸`;
      const saludoTiempo = 'para *mañana*:';

      const mensaje =
        `${encabezado}\n\n` +
        `¡Hola *${primera.nombreCliente}*! Te recordamos con mucho cariño tu cita programada ${saludoTiempo}\n\n` +
        `${etiquetaServicio} ${servicioTexto}\n` +
        `${etiquetaEspecialista} ${especialistaTexto}\n` +
        `📅 *Fecha:* ${fechaCita}\n` +
        `⏰ *Hora:* ${horaInicio}\n\n` +
        `📍 *Lugar:* Pereira, Cuba (Calle 66 bis #26-57)\n` +
        `${notaPago}\n\n` +
        `¡Nos vemos pronto para consentirte reina! 💕`;

      const botonesOpciones = [
        { id: `confirmar_cita_${primera.r.id}`, title: '✅ Confirmar Cita' },
        { id: `cancelar_cita_${primera.r.id}`, title: '❌ Cancelar Cita' },
        { id: `reagendar_cita_${primera.r.id}`, title: '📅 Cambiar Fecha' },
      ];

      const enviadoExitoso = await this.enviarWhatsApp(
        primera.telefono,
        mensaje,
        primera.complejo?.whatsapp_token,
        primera.complejo?.whatsapp_phone_number_id,
        botonesOpciones
      );

      if (enviadoExitoso) {
        // Marcar todas las citas del grupo para que no se envíe un segundo recordatorio
        for (const item of grupo) {
          await supabase
            .from('reservas')
            .update({ notas: `${item.notas} [REC_1_DIA] [REC_ENVIADO]`.trim() })
            .eq('id', item.r.id);
        }
        enviados += grupo.length;
      }
    }

    return { enviados };
  }

  /**
   * Envía recordatorio EL MISMO DÍA ÚNICAMENTE para citas creadas para el mismo día
   * o que no recibieron el recordatorio anterior, enviándose EXACTAMENTE 3 HORAS ANTES
   * (ventana de entre 2 horas y 3.5 horas antes de la hora de la cita).
   */
  static async procesarRecordatoriosMismoDia() {
    const ahora = new Date();
    const fechaHoyCol = this.obtenerFechaCol(ahora);

    // Ventana amplia en BD para capturar también citas con HORARIO_REAL cuyo db_fecha_inicio fue ajustado
    const desdeIso = new Date(ahora.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const hastaIso = new Date(ahora.getTime() + 8 * 60 * 60 * 1000).toISOString();

    const { data: reservas, error } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('estado', 'confirmada')
      .gte('fecha_inicio', desdeIso)
      .lte('fecha_inicio', hastaIso);

    if (error || !reservas) return { enviados: 0 };

    const regexHorarioReal = /\[HORARIO_REAL:([^|\]]+)\|([^\]]+)\]/i;
    const minVentanaMs = ahora.getTime() + 2 * 60 * 60 * 1000;
    const maxVentanaMs = ahora.getTime() + 3.5 * 60 * 60 * 1000;

    interface CitaMismoDia {
      r: any;
      dInicio: Date;
      notas: string;
      servicio: string;
      especialista: string;
      nombreCliente: string;
      telefono: string;
      complejo: any;
      esSpa: boolean;
    }

    const mapaGruposMismoDia = new Map<string, CitaMismoDia[]>();

    for (const r of reservas) {
      const notas = r.notas || '';
      // Si ya recibió recordatorio de 1 día antes o de mismo día, NUNCA volver a enviar
      if (
        notas.includes('[REC_1_DIA]') ||
        notas.includes('[REC_MISMO_DIA]') ||
        notas.includes('[REC_ENVIADO]')
      ) {
        continue;
      }

      const matchReal = notas.match(regexHorarioReal);
      const fechaInicioRealIso =
        matchReal && matchReal[1] && !isNaN(new Date(matchReal[1].trim()).getTime())
          ? matchReal[1].trim()
          : r.fecha_inicio;
      const dInicio = new Date(fechaInicioRealIso);
      if (dInicio.getTime() < minVentanaMs || dInicio.getTime() > maxVentanaMs) {
        continue;
      }
      const fechaCitaCol = this.obtenerFechaCol(dInicio);

      // Solo aplica si la cita ocurre HOY en Colombia
      if (fechaCitaCol !== fechaHoyCol) {
        continue;
      }

      const cliente = r.clientes as any;
      const cancha = r.canchas as any;
      const complejo = cancha?.complejos as any;
      const esSpa = complejo?.slug === 'mimate-nails' || complejo?.tipo_negocio === 'belleza_unas';

      const telefono = cliente?.telefono_wa;
      if (!telefono) continue;

      let nombreCliente = cliente.nombre || 'Cliente';
      const matchNom = notas.match(/Clienta:\s*([^|[\n]+)/i);
      if (matchNom && matchNom[1]) nombreCliente = matchNom[1].trim();

      let servicio = 'tu servicio de uñas';
      const matchSvc = notas.match(/Servicio:\s*([^|[\n]+)/i);
      if (matchSvc && matchSvc[1]) servicio = matchSvc[1].trim();

      const especialista = this.obtenerNombreEspecialista(cancha);
      const cleanTel = telefono.replace(/\D/g, '');
      const keyGrupo = cleanTel.length >= 10 ? cleanTel.slice(-10) : (r.cliente_id || cleanTel);

      const item: CitaMismoDia = {
        r,
        dInicio,
        notas,
        servicio,
        especialista,
        nombreCliente,
        telefono,
        complejo,
        esSpa,
      };

      if (!mapaGruposMismoDia.has(keyGrupo)) {
        mapaGruposMismoDia.set(keyGrupo, []);
      }
      mapaGruposMismoDia.get(keyGrupo)!.push(item);
    }

    let enviados = 0;

    for (const [_, grupo] of mapaGruposMismoDia.entries()) {
      grupo.sort((a, b) => a.dInicio.getTime() - b.dInicio.getTime());
      const primera = grupo[0];
      const horaInicio = this.formatearHora12(primera.dInicio);

      const serviciosList = Array.from(new Set(grupo.map((g) => g.servicio).filter(Boolean)));
      const servicioTexto = serviciosList.join(' + ');
      const etiquetaServicio = serviciosList.length > 1 ? '💅 *Servicios:*' : '💅 *Servicio:*';

      const especialistasList = Array.from(new Set(grupo.map((g) => g.especialista).filter(Boolean)));
      const especialistaTexto = especialistasList.join(' y ');
      const etiquetaEspecialista = especialistasList.length > 1 ? '👩‍🎨 *Especialistas:*' : '👩‍🎨 *Especialista:*';

      let mensaje = '';
      let botonesOpciones: Array<{ id: string; title: string }> | undefined;

      if (primera.esSpa) {
        mensaje =
          `🔔 *RECORDATORIO DE TU CITA HOY (EN 3 HORAS) - JL MÍMATE NAILS* 🌸\n\n` +
          `¡Hola *${primera.nombreCliente}*! Te recordamos con mucho amor tu cita programada para *hoy a las ${horaInicio}*:\n\n` +
          `${etiquetaServicio} ${servicioTexto}\n` +
          `${etiquetaEspecialista} ${especialistaTexto}\n` +
          `⏰ *Hora:* ${horaInicio}\n` +
          `📍 *Lugar:* Pereira, Cuba (Calle 66 bis #26-57)\n\n` +
          `¡Te esperamos con amor reina! 💕💅`;

        botonesOpciones = [
          { id: `confirmar_cita_${primera.r.id}`, title: '✅ Confirmar Cita' },
          { id: `cancelar_cita_${primera.r.id}`, title: '❌ Cancelar Cita' },
          { id: `reagendar_cita_${primera.r.id}`, title: '📅 Cambiar Fecha' },
        ];
      } else {
        mensaje =
          `🔔 *RECORDATORIO DE TU TURNO HOY (EN 3 HORAS)*\n\n` +
          `¡Hola *${primera.nombreCliente}*! Te recordamos tu cita hoy en *${primera.complejo.nombre}* a las *${horaInicio}* con ${especialistaTexto}.\n\n` +
          `Te esperamos puntualmente. ¡Que tengas un excelente día!`;

        botonesOpciones = [
          { id: `confirmar_cita_${primera.r.id}`, title: '✅ Confirmar' },
          { id: `cancelar_cita_${primera.r.id}`, title: '❌ Cancelar' },
          { id: `reagendar_cita_${primera.r.id}`, title: '📅 Cambiar Fecha' },
        ];
      }

      const enviadoExitoso = await this.enviarWhatsApp(
        primera.telefono,
        mensaje,
        primera.complejo?.whatsapp_token,
        primera.complejo?.whatsapp_phone_number_id,
        botonesOpciones
      );

      if (enviadoExitoso) {
        for (const item of grupo) {
          await supabase
            .from('reservas')
            .update({ notas: `${item.notas} [REC_MISMO_DIA] [REC_ENVIADO]`.trim() })
            .eq('id', item.r.id);
        }
        enviados += grupo.length;
      }
    }

    return { enviados };
  }

  private static async enviarWhatsApp(
    to: string,
    message: string,
    _tokenOverride?: string,
    _phoneIdOverride?: string,
    botones?: Array<{ id: string; title: string }>
  ): Promise<boolean> {
    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = `57${cleanPhone}`;
    }

    const enviado = await BaileysService.enviarMensajeDirecto(cleanPhone, message, botones);
    if (enviado) {
      console.log(`✅ [RECORDATORIO BAILEYS ENVIADO a ${cleanPhone}]`);
      return true;
    } else {
      console.warn(`⚠️ [RECORDATORIO BAILEYS NO ENVIADO a ${cleanPhone}]: No conectado o número fuera de lista blanca.`);
      return false;
    }
  }
}
