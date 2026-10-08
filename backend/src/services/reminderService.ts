import { supabase } from '../config/supabase.js';
import axios from 'axios';

export class ReminderService {
  /**
   * Ejecuta la rutina periódica de recordatorios:
   * 1. Recordatorio 1 día antes de la cita
   * 2. Recordatorio el mismo día de la cita
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
   * Envía recordatorio 1 DÍA ANTES de la cita/reserva (franja de 18 a 36 horas previas)
   */
  static async procesarRecordatoriosDiaAntes() {
    const ahora = new Date();
    const desdeIso = new Date(ahora.getTime() + 18 * 60 * 60 * 1000).toISOString();
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
      if (notas.includes('[REC_1_DIA]')) continue;

      const cliente = r.clientes as any;
      const cancha = r.canchas as any;
      const complejo = cancha?.complejos as any;
      const telefono = cliente?.telefono_wa;
      if (!telefono) continue;

      let nombreCliente = cliente.nombre || 'Cliente';
      const matchNom = notas.match(/Clienta:\s*([^|[\n]+)/i);
      if (matchNom && matchNom[1]) nombreCliente = matchNom[1].trim();

      const fechaCita = new Date(r.fecha_inicio).toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const horaInicio = new Date(r.fecha_inicio).toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      let mensaje = '';

      let botonesOpciones: Array<{ id: string; title: string }> | undefined;

      let servicio = 'tu servicio de uñas';
      const matchSvc = notas.match(/Servicio:\s*([^|[\n]+)/i);
      if (matchSvc && matchSvc[1]) servicio = matchSvc[1].trim();

      mensaje =
        `💅✨ *RECORDATORIO DE TU CITA MAÑANA - JL MÍMATE NAILS* 🌸\n\n` +
        `¡Hola *${nombreCliente}*! Te recordamos con mucho cariño tu cita programada para *mañana*:\n\n` +
        `💅 *Servicio:* ${servicio}\n` +
        `👩‍🎨 *Especialista:* ${cancha.nombre}\n` +
        `📅 *Fecha:* ${fechaCita}\n` +
        `⏰ *Hora:* ${horaInicio}\n\n` +
        `📍 *Lugar:* Pereira, Cuba (Calle 66 bis #26-57)\n` +
        `🗺️ *Cómo llegar (Maps):* https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8\n` +
        `✨ *Nota:* Recuerda que cancelas el valor en el spa (sin cobros anticipados).\n\n` +
        `Por favor, confirma tu asistencia seleccionando una opción o respondiendo:\n` +
        `1️⃣ *Confirmar cita*\n` +
        `2️⃣ *Cancelar cita*\n` +
        `3️⃣ *Cambiar fecha (Reagendar)*\n\n` +
        `¡Nos vemos mañana para consentirte reina! 💕`;

      botonesOpciones = [
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
        .update({ notas: `${notas} [REC_1_DIA]`.trim() })
        .eq('id', r.id);

      enviados++;
    }

    return { enviados };
  }

  /**
   * Envía recordatorio EL MISMO DÍA de la cita/reserva (franja de próximas 1 a 6 horas del día)
   */
  static async procesarRecordatoriosMismoDia() {
    const ahora = new Date();
    const ahoraIso = ahora.toISOString();
    const limiteSeisHoras = new Date(ahora.getTime() + 6 * 60 * 60 * 1000).toISOString();

    const { data: reservas, error } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('estado', 'confirmada')
      .gte('fecha_inicio', ahoraIso)
      .lte('fecha_inicio', limiteSeisHoras);

    if (error || !reservas) return { enviados: 0 };

    let enviados = 0;
    for (const r of reservas) {
      const notas = r.notas || '';
      if (notas.includes('[REC_MISMO_DIA]')) continue;

      const cliente = r.clientes as any;
      const cancha = r.canchas as any;
      const complejo = cancha?.complejos as any;
      // Para JL Mímate Nails (Spa de Uñas), el recordatorio se realiza ÚNICAMENTE 1 día antes
      if (complejo?.slug === 'mimate-nails' || complejo?.tipo_negocio === 'belleza_unas') {
        continue;
      }

      const telefono = cliente?.telefono_wa;
      if (!telefono) continue;

      const nombreCliente = cliente.nombre || 'Cliente';
      const horaInicio = new Date(r.fecha_inicio).toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const mensaje =
        `🔔 *RECORDATORIO DE TU TURNO HOY*\n\n` +
        `¡Hola *${nombreCliente}*! Te recordamos tu cita hoy en *${complejo.nombre}* a las *${horaInicio}* con ${cancha.nombre}.\n\n` +
        `Te esperamos puntualmente. ¡Que tengas un excelente día!`;

      await this.enviarWhatsApp(telefono, mensaje, complejo?.whatsapp_token, complejo?.whatsapp_phone_number_id);

      await supabase
        .from('reservas')
        .update({ notas: `${notas} [REC_MISMO_DIA]`.trim() })
        .eq('id', r.id);

      enviados++;
    }

    return { enviados };
  }

  private static async enviarWhatsApp(
    to: string,
    message: string,
    tokenOverride?: string,
    phoneIdOverride?: string,
    botones?: Array<{ id: string; title: string }>
  ) {
    let cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = `57${cleanPhone}`;
    }

    const token = tokenOverride || process.env.WHATSAPP_TOKEN;
    const phoneId = phoneIdOverride || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      console.log(`[RECORDATORIO AUTOMÁTICO WHATSAPP a ${cleanPhone}]:\n${message}`);
      if (botones && botones.length > 0) {
        console.log(`[BOTONES DE RESPUESTA]:`, botones);
      }
      return;
    }

    // 1. Si hay botones interactivos disponibles, intentar enviar formato interactivo
    if (botones && botones.length > 0) {
      try {
        const payloadInteractivo = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: message },
            action: {
              buttons: botones.map((b) => ({
                type: 'reply',
                reply: {
                  id: String(b.id || '').slice(0, 200),
                  title: String(b.title || '').slice(0, 20),
                },
              })),
            },
          },
        };

        const res = await axios.post(
          `https://graph.facebook.com/v21.0/${phoneId}/messages`,
          payloadInteractivo,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log(`✅ [RECORDATORIO INTERACTIVO WHATSAPP ENVIADO a ${cleanPhone}]: ID ${res.data?.messages?.[0]?.id}`);
        return;
      } catch (errInteractivo: any) {
        console.warn(`⚠️ Error enviando botones interactivos de WhatsApp (${errInteractivo.message}), recurriendo a mensaje de texto estándar...`);
      }
    }

    // 2. Envío en texto estándar como fallback
    try {
      const res = await axios.post(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ [RECORDATORIO WHATSAPP ENVIADO a ${cleanPhone}]: ID ${res.data?.messages?.[0]?.id}`);
    } catch (err: any) {
      console.error(`❌ [ERROR RECORDATORIO WHATSAPP a ${cleanPhone}]:`, err.response?.data || err.message);
    }
  }
}
