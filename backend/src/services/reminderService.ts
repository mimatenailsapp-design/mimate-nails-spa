import { supabase } from '../config/supabase.js';
import { BaileysService } from './baileysService.js';

export class ReminderService {
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
    const fechaHoyCol = this.obtenerFechaCol(ahora);

    // Calculamos la fecha de mañana en Colombia
    const manana = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
    const fechaMananaCol = this.obtenerFechaCol(manana);

    // Franja amplia de búsqueda en UTC: desde ahora hasta 36 horas adelante
    const desdeIso = ahora.toISOString();
    const hastaIso = new Date(ahora.getTime() + 36 * 60 * 60 * 1000).toISOString();

    const { data: reservas, error } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('estado', 'confirmada')
      .gte('fecha_inicio', desdeIso)
      .lte('fecha_inicio', hastaIso);

    if (error || !reservas) return { enviados: 0 };

    let enviados = 0;
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

      const dInicio = new Date(r.fecha_inicio);
      const fechaCitaCol = this.obtenerFechaCol(dInicio);

      // Si la cita es para HOY en Colombia, este método NO la procesa (le corresponde al de 3 horas antes)
      if (fechaCitaCol === fechaHoyCol) {
        continue;
      }

      // Si la cita es para MAÑANA (o días posteriores dentro de la ventana de aviso):
      const cliente = r.clientes as any;
      const cancha = r.canchas as any;
      const complejo = cancha?.complejos as any;
      const telefono = cliente?.telefono_wa;
      if (!telefono) continue;

      let nombreCliente = cliente.nombre || 'Cliente';
      const matchNom = notas.match(/Clienta:\s*([^|[\n]+)/i);
      if (matchNom && matchNom[1]) nombreCliente = matchNom[1].trim();

      const fechaCita = dInicio.toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const horaInicio = dInicio.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      let servicio = 'tu servicio de uñas';
      const matchSvc = notas.match(/Servicio:\s*([^|[\n]+)/i);
      if (matchSvc && matchSvc[1]) servicio = matchSvc[1].trim();

      const exigeAnticipo = Number(complejo?.porcentaje_anticipo_minimo) > 0;
      let notaPago = '✨ *Nota:* Recuerda que cancelas el valor en el spa (sin cobros anticipados).';
      if (exigeAnticipo) {
        if (notas.includes('[COMPROBANTE_VALIDO_IA]') || notas.includes('[PAGO_APROBADO]')) {
          notaPago = '✨ *Nota:* Tu abono de anticipo ya fue validado con éxito. El saldo restante lo cancelas en el spa.';
        } else {
          notaPago = '✨ *Nota:* Recuerda que tu cita cuenta con abono registrado.';
        }
      }

      const esManana = fechaCitaCol === fechaMananaCol;
      const encabezado = esManana
        ? `💅✨ *RECORDATORIO DE TU CITA MAÑANA - JL MÍMATE NAILS* 🌸`
        : `💅✨ *RECORDATORIO DE TU CITA - JL MÍMATE NAILS* 🌸`;
      const saludoTiempo = esManana ? 'para *mañana*:' : `para el *${fechaCita}*:`;

      const mensaje =
        `${encabezado}\n\n` +
        `¡Hola *${nombreCliente}*! Te recordamos con mucho cariño tu cita programada ${saludoTiempo}\n\n` +
        `💅 *Servicio:* ${servicio}\n` +
        `👩‍🎨 *Especialista:* ${cancha.nombre}\n` +
        `📅 *Fecha:* ${fechaCita}\n` +
        `⏰ *Hora:* ${horaInicio}\n\n` +
        `📍 *Lugar:* Pereira, Cuba (Calle 66 bis #26-57)\n` +
        `${notaPago}\n\n` +
        `Por favor, confirma tu asistencia seleccionando una opción o respondiendo:\n` +
        `1️⃣ *Confirmar cita*\n` +
        `2️⃣ *Cancelar cita*\n` +
        `3️⃣ *Cambiar fecha (Reagendar)*\n\n` +
        `¡Nos vemos pronto para consentirte reina! 💕`;

      const botonesOpciones = [
        { id: `confirmar_cita_${r.id}`, title: '✅ Confirmar Cita' },
        { id: `cancelar_cita_${r.id}`, title: '❌ Cancelar Cita' },
        { id: `reagendar_cita_${r.id}`, title: '📅 Cambiar Fecha' },
      ];

      await this.enviarWhatsApp(
        telefono,
        mensaje,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id,
        botonesOpciones
      );

      await supabase
        .from('reservas')
        .update({ notas: `${notas} [REC_1_DIA] [REC_ENVIADO]`.trim() })
        .eq('id', r.id);

      enviados++;
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

    // Ventana de 3 horas antes: citas que comienzan entre 2 horas y 3.5 horas a partir de ahora
    const desdeIso = new Date(ahora.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const hastaIso = new Date(ahora.getTime() + 3.5 * 60 * 60 * 1000).toISOString();

    const { data: reservas, error } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('estado', 'confirmada')
      .gte('fecha_inicio', desdeIso)
      .lte('fecha_inicio', hastaIso);

    if (error || !reservas) return { enviados: 0 };

    let enviados = 0;
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

      const dInicio = new Date(r.fecha_inicio);
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

      const horaInicio = dInicio.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      let servicio = 'tu servicio de uñas';
      const matchSvc = notas.match(/Servicio:\s*([^|[\n]+)/i);
      if (matchSvc && matchSvc[1]) servicio = matchSvc[1].trim();

      let mensaje = '';
      let botonesOpciones: Array<{ id: string; title: string }> | undefined;

      if (esSpa) {
        mensaje =
          `🔔 *RECORDATORIO DE TU CITA HOY (EN 3 HORAS) - JL MÍMATE NAILS* 🌸\n\n` +
          `¡Hola *${nombreCliente}*! Te recordamos con mucho amor tu cita programada para *hoy a las ${horaInicio}*:\n\n` +
          `💅 *Servicio:* ${servicio}\n` +
          `👩‍🎨 *Especialista:* ${cancha.nombre}\n` +
          `⏰ *Hora:* ${horaInicio}\n` +
          `📍 *Lugar:* Pereira, Cuba (Calle 66 bis #26-57)\n\n` +
          `Por favor, confirma tu asistencia o indícanos si necesitas cancelar o cambiar fecha:\n` +
          `1️⃣ *Confirmar cita*\n` +
          `2️⃣ *Cancelar cita*\n` +
          `3️⃣ *Cambiar fecha (Reagendar)*\n\n` +
          `¡Te esperamos con amor reina! 💕💅`;

        botonesOpciones = [
          { id: `confirmar_cita_${r.id}`, title: '✅ Confirmar Cita' },
          { id: `cancelar_cita_${r.id}`, title: '❌ Cancelar Cita' },
          { id: `reagendar_cita_${r.id}`, title: '📅 Cambiar Fecha' },
        ];
      } else {
        mensaje =
          `🔔 *RECORDATORIO DE TU TURNO HOY (EN 3 HORAS)*\n\n` +
          `¡Hola *${nombreCliente}*! Te recordamos tu cita hoy en *${complejo.nombre}* a las *${horaInicio}* con ${cancha.nombre}.\n\n` +
          `Te esperamos puntualmente. ¡Que tengas un excelente día!`;

        botonesOpciones = [
          { id: `confirmar_cita_${r.id}`, title: '✅ Confirmar' },
          { id: `cancelar_cita_${r.id}`, title: '❌ Cancelar' },
          { id: `reagendar_cita_${r.id}`, title: '📅 Cambiar Fecha' },
        ];
      }

      await this.enviarWhatsApp(
        telefono,
        mensaje,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id,
        botonesOpciones
      );

      await supabase
        .from('reservas')
        .update({ notas: `${notas} [REC_MISMO_DIA] [REC_ENVIADO]`.trim() })
        .eq('id', r.id);

      enviados++;
    }

    return { enviados };
  }

  private static async enviarWhatsApp(
    to: string,
    message: string,
    _tokenOverride?: string,
    _phoneIdOverride?: string,
    botones?: Array<{ id: string; title: string }>
  ) {
    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = `57${cleanPhone}`;
    }

    let textoCompleto = message;
    if (botones && botones.length > 0) {
      const opciones = botones.map((b, i) => `${i + 1}️⃣ ${b.title}`).join('\n');
      textoCompleto += `\n\n${opciones}\n\n👉 Responde con el número de tu opción.`;
    }

    const enviado = await BaileysService.enviarMensajeDirecto(cleanPhone, textoCompleto);
    if (enviado) {
      console.log(`✅ [RECORDATORIO BAILEYS ENVIADO a ${cleanPhone}]`);
    } else {
      console.warn(`⚠️ [RECORDATORIO BAILEYS NO ENVIADO a ${cleanPhone}]: No conectado o número fuera de lista blanca.`);
    }
  }
}
