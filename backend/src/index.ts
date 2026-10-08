import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { supabase } from './config/supabase.js';
import { WhatsAppFlow, BotResponse } from './bot/whatsappFlow.js';
import { ReminderService } from './services/reminderService.js';
import { BookingService } from './services/bookingService.js';
import { AIReceptionistService } from './services/aiReceptionistService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==============================================================================
// 1. HEALTH CHECK & ESTADO DE CONEXIÓN
// ==============================================================================
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    servicio: 'SIRED - Ecosistema Multi-empresa de Reservas Deportivas & WhatsApp Bot',
    base_de_datos: 'Supabase PostgreSQL Conectada',
    modelo: 'Modelo A (Cada complejo con su propio WhatsApp oficial)',
    version: '2.0.0',
    webhook_url: '/webhook',
    simulador_bot: '/api/bot/simulate',
    cron_recordatorios: '/api/cron/recordatorios',
  });
});

// ==============================================================================
// 2. WHATSAPP CLOUD API - WEBHOOK (META MULTI-EMPRESA)
// ==============================================================================

app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'token_secreto_para_webhook_12345';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook de WhatsApp verificado con éxito');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const value = body.entry[0].changes[0].value;
        const messageObj = value.messages[0];
        const contactObj = value.contacts?.[0];

        // 1. Identificar el número de teléfono del establecimiento que recibió el mensaje (Modelo A)
        const phoneId = value.metadata?.phone_number_id;
        const displayPhone = value.metadata?.display_phone_number;

        // Buscar a qué empresa le pertenece este número de WhatsApp
        const complejo = await BookingService.getComplejoByPhone(phoneId, displayPhone);

        const telefonoCliente = messageObj.from;
        let texto = messageObj.text?.body || '';
        const nombrePush = contactObj?.profile?.name;

        // Soporte para respuestas interactivas de WhatsApp (Menú desplegable / Botones)
        if (messageObj.type === 'interactive' && messageObj.interactive) {
          if (messageObj.interactive.type === 'list_reply' && messageObj.interactive.list_reply) {
            texto = messageObj.interactive.list_reply.id || messageObj.interactive.list_reply.title || '';
          } else if (messageObj.interactive.type === 'button_reply' && messageObj.interactive.button_reply) {
            texto = messageObj.interactive.button_reply.id || messageObj.interactive.button_reply.title || '';
          }
        }

        let mediaId: string | undefined;
        let mediaType: string | undefined;

        if (messageObj.type === 'image') {
          mediaId = messageObj.image?.id;
          mediaType = messageObj.image?.mime_type;
          texto = messageObj.image?.caption || 'comprobante_imagen';
        }

        // 2. Procesar con las canchas, tarifas, Nequi y comprobantes de ESE complejo
        const respuestaBot = await WhatsAppFlow.procesarMensaje(
          telefonoCliente,
          texto,
          nombrePush,
          complejo,
          mediaId,
          mediaType
        );

        // 3. Responder al cliente usando el token y número de ese complejo (con menú desplegable si aplica)
        await enviarMensajeWhatsApp(telefonoCliente, respuestaBot, complejo.whatsapp_token, phoneId);
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error procesando webhook multi-tenant:', error);
    res.sendStatus(500);
  }
});

async function enviarMensajeWhatsApp(
  to: string,
  message: string | BotResponse,
  customToken?: string,
  customPhoneId?: string
) {
  let cleanTo = String(to).replace(/\D/g, '');
  if (cleanTo.length === 10 && cleanTo.startsWith('3')) {
    cleanTo = `57${cleanTo}`;
  }

  const token = customToken || process.env.WHATSAPP_TOKEN;
  const phoneId = customPhoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;

  let payload: any;
  if (typeof message === 'object' && message.interactive) {
    if (message.interactive.type === 'cta_url') {
      const ctaAction = message.interactive.action as any;
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...(message.interactive.header ? { header: { type: 'text', text: message.interactive.header.slice(0, 60) } } : {}),
          body: { text: message.interactive.body.slice(0, 1024) },
          ...(message.interactive.footer ? { footer: { text: message.interactive.footer.slice(0, 60) } } : {}),
          action: {
            name: 'cta_url',
            parameters: {
              display_text: (ctaAction.parameters?.display_text || 'Abrir Agenda').slice(0, 20),
              url: ctaAction.parameters?.url,
            },
          },
        },
      };
    } else {
      const sanitizedSections = (message.interactive.action?.sections || []).map((sec: any) => ({
        title: (sec.title || 'Opciones').slice(0, 24),
        rows: (sec.rows || []).map((row: any) => ({
          id: String(row.id || '').slice(0, 200),
          title: String(row.title || '').slice(0, 24),
          ...(row.description ? { description: String(row.description).slice(0, 72) } : {}),
        })),
      }));

      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'interactive',
        interactive: {
          type: message.interactive.type,
          ...(message.interactive.header ? { header: { type: 'text', text: message.interactive.header.slice(0, 60) } } : {}),
          body: { text: message.interactive.body.slice(0, 1024) },
          ...(message.interactive.footer ? { footer: { text: message.interactive.footer.slice(0, 60) } } : {}),
          action: {
            button: (message.interactive.action?.button || 'Elegir').slice(0, 20),
            sections: sanitizedSections,
          },
        },
      };
    }
  } else {
    const textBody = typeof message === 'string' ? message : message.texto;
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { body: textBody },
    };
  }

  if (!token || !phoneId) {
    console.log(`[WHATSAPP MENSAJE a ${cleanTo}]:`, JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ [WHATSAPP ENVIADO EXITOSAMENTE a ${cleanTo}]: ID ${res.data?.messages?.[0]?.id}`);
  } catch (err: any) {
    console.error(`❌ [ERROR WHATSAPP a ${cleanTo}]:`, err.response?.data || err.message);
    if (typeof message === 'object' && message.interactive) {
      try {
        console.log(`[WHATSAPP FALLBACK]: Enviando mensaje en texto plano a ${cleanTo}`);
        const fallbackRes = await axios.post(
          `https://graph.facebook.com/v21.0/${phoneId}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanTo,
            type: 'text',
            text: { body: message.texto },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log(`✅ [WHATSAPP FALLBACK ENVIADO a ${cleanTo}]: ID ${fallbackRes.data?.messages?.[0]?.id}`);
      } catch (fallbackErr: any) {
        console.error('Error en fallback de texto WhatsApp:', fallbackErr.response?.data || fallbackErr.message);
      }
    }
  }
}

// ==============================================================================
// 3. SIMULADOR CONVERSACIONAL DE WHATSAPP (SOPORTA SELECCIÓN DE EMPRESA)
// ==============================================================================
app.post('/api/bot/simulate', async (req: Request, res: Response) => {
  try {
    const { telefono = '573009999999', mensaje = 'HOLA', nombre = 'Jugador', complejo_id } = req.body;
    let complejo = null;

    if (complejo_id) {
      complejo = await BookingService.getComplejo(complejo_id);
    }
    if (!complejo) {
      const complejos = await BookingService.getComplejos();
      complejo = complejos[0];
    }

    const respuesta = await WhatsAppFlow.procesarMensaje(telefono, mensaje, nombre, complejo);
    res.json({
      complejo: complejo.nombre,
      remitente: telefono,
      mensaje_recibido: mensaje,
      respuesta_bot: typeof respuesta === 'string' ? respuesta : respuesta.texto,
      interactive: typeof respuesta === 'object' ? respuesta.interactive : undefined,
      urlRedirect: typeof respuesta === 'object' ? respuesta.urlRedirect : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==============================================================================
// 4. GESTIÓN MULTI-TENANT DE EMPRESAS (COMPLEJOS)
// ==============================================================================

// Listar todos los complejos deportivos
app.get('/api/complejos', async (req: Request, res: Response) => {
  try {
    const complejos = await BookingService.getComplejos();
    res.json(complejos);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar un nuevo complejo deportivo en la plataforma
app.post('/api/complejos', async (req: Request, res: Response) => {
  try {
    const nuevoComplejo = await BookingService.crearComplejo(req.body);
    res.status(201).json(nuevoComplejo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar configuración de un complejo (WhatsApp Token, Phone ID, Nequi, etc.)
app.patch('/api/complejos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('complejos')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Consultar base de conocimiento / FAQ personalizada de un complejo
app.get('/api/complejos/:id/faq', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const complejo = await BookingService.getComplejo(id);
    if (!complejo) return res.status(404).json({ error: 'Complejo no encontrado' });
    const info = AIReceptionistService.getConocimientoComplejo(complejo);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar base de conocimiento / FAQ personalizada de un complejo
app.post('/api/complejos/:id/faq', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    AIReceptionistService.guardarConocimientoComplejo(id, req.body);
    res.json({ success: true, message: 'Conocimiento del recepcionista virtual actualizado con éxito' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==============================================================================
// 5. ENDPOINTS REST POR COMPLEJO (CALENDARIO, RESERVAS, MÉTRICAS)
// ==============================================================================

// Lista de Canchas filtradas por complejo
app.get('/api/canchas', async (req: Request, res: Response) => {
  const { complejo_id } = req.query;
  try {
    const canchas = await BookingService.getCanchas(complejo_id as string | undefined);
    res.json(canchas);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Lista de Reservas para el Calendario (filtradas por complejo)
app.get('/api/reservas', async (req: Request, res: Response) => {
  const { desde, hasta, complejo_id } = req.query;

  let query = supabase
    .from('reservas')
    .select('*, canchas!inner(id, nombre, deporte, complejo_id), clientes(nombre, telefono_wa), pagos_anticipos(*)');

  if (complejo_id) {
    query = query.eq('canchas.complejo_id', complejo_id as string);
  }
  if (desde) query = query.gte('fecha_inicio', desde as string);
  if (hasta) query = query.lte('fecha_fin', hasta as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Bloquear Horarios (1 hora o varias horas, para admin o manicuristas)
app.post('/api/bloqueos', async (req: Request, res: Response) => {
  try {
    const {
      cancha_id,
      cancha_ids,
      fecha,
      horas,
      fecha_inicio,
      fecha_fin,
      duracion_minutos = 60,
      motivo = 'Horario bloqueado',
      bloqueado_por = 'Personal del Spa',
    } = req.body;

    const idsCanchas: string[] = [];
    if (Array.isArray(cancha_ids) && cancha_ids.length > 0) {
      idsCanchas.push(...cancha_ids);
    } else if (cancha_id) {
      if (Array.isArray(cancha_id)) {
        idsCanchas.push(...cancha_id);
      } else {
        idsCanchas.push(cancha_id);
      }
    }

    if (idsCanchas.length === 0) {
      return res.status(400).json({ error: 'Debes seleccionar al menos una manicurista / especialista.' });
    }

    const registrosAInsertar: any[] = [];

    // Si viene fecha_inicio y fecha_fin en formato ISO directo
    if (fecha_inicio && fecha_fin) {
      for (const cid of idsCanchas) {
        registrosAInsertar.push({
          cancha_id: cid,
          cliente_id: null,
          fecha_inicio,
          fecha_fin,
          estado: 'bloqueada',
          valor_total: 0,
          valor_anticipo_requerido: 0,
          notas: `🔒 BLOQUEO: ${motivo} | Por: ${bloqueado_por}`,
        });
      }
    } else if (fecha && Array.isArray(horas) && horas.length > 0) {
      // Si viene fecha YYYY-MM-DD y lista de horas ['09:30', '10:30', ...]
      for (const h of horas) {
        const dInicio = new Date(`${fecha}T${h}:00-05:00`);
        const dFin = new Date(dInicio.getTime() + (Number(duracion_minutos) || 60) * 60 * 1000);

        for (const cid of idsCanchas) {
          registrosAInsertar.push({
            cancha_id: cid,
            cliente_id: null,
            fecha_inicio: dInicio.toISOString(),
            fecha_fin: dFin.toISOString(),
            estado: 'bloqueada',
            valor_total: 0,
            valor_anticipo_requerido: 0,
            notas: `🔒 BLOQUEO: ${motivo} | Hora: ${h} | Por: ${bloqueado_por}`,
          });
        }
      }
    } else if (fecha && req.body.hora) {
      // Si viene una sola hora
      const h = req.body.hora;
      const dInicio = new Date(`${fecha}T${h}:00-05:00`);
      const dFin = new Date(dInicio.getTime() + (Number(duracion_minutos) || 60) * 60 * 1000);

      for (const cid of idsCanchas) {
        registrosAInsertar.push({
          cancha_id: cid,
          cliente_id: null,
          fecha_inicio: dInicio.toISOString(),
          fecha_fin: dFin.toISOString(),
          estado: 'bloqueada',
          valor_total: 0,
          valor_anticipo_requerido: 0,
          notas: `🔒 BLOQUEO: ${motivo} | Hora: ${h} | Por: ${bloqueado_por}`,
        });
      }
    } else {
      return res.status(400).json({ error: 'Faltan parámetros de fecha y horario para realizar el bloqueo.' });
    }

    const { data, error } = await supabase
      .from('reservas')
      .insert(registrosAInsertar)
      .select('*, canchas(nombre)');

    if (error) {
      if (error.code === '23P01') {
        return res.status(409).json({
          error: 'Uno o más de los horarios seleccionados ya tiene una cita o bloqueo registrado.',
        });
      }
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({
      success: true,
      bloqueados: data?.length || 0,
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Desbloquear Horario (Eliminar bloqueo específico)
app.delete('/api/bloqueos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('reservas')
    .delete()
    .eq('id', id)
    .eq('estado', 'bloqueada');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: 'Horario desbloqueado con éxito' });
});

// Actualizar estado de una reserva
app.patch('/api/reservas/:id/estado', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { estado } = req.body;

  const { data, error } = await supabase
    .from('reservas')
    .update({ estado })
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Obtener detalles de una reserva por ID
app.get('/api/reservas/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data: reserva, error } = await supabase
      .from('reservas')
      .select('*, canchas(*), clientes(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!reserva) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(reserva);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar una reserva (Cancelar y remover del sistema)
app.delete('/api/reservas/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  // Primero eliminamos pagos asociados si los hubiese
  await supabase.from('pagos_anticipos').delete().eq('reserva_id', id);

  const { error } = await supabase
    .from('reservas')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: 'Reserva eliminada con éxito' });
});

// ==============================================================================
// OPCIÓN A: APROBACIÓN ASISTIDA DESDE EL VISOR WEB (CON NOTIFICACIÓN WHATSAPP)
// ==============================================================================

// 1. Aprobar Anticipo manualmente desde el Visor Web
app.patch('/api/reservas/:id/aprobar-anticipo', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { notas_admin } = req.body;

  try {
    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('id', id)
      .single();

    if (errRes || !reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const { data: reservaActualizada, error: errUpd } = await supabase
      .from('reservas')
      .update({
        estado: 'confirmada',
        notas: notas_admin || 'Anticipo aprobado manualmente por administrador en Visor Web',
      })
      .eq('id', id)
      .select()
      .single();

    if (errUpd) throw errUpd;

    await supabase.from('pagos_anticipos').insert({
      reserva_id: id,
      metodo: 'nequi',
      monto: reserva.valor_anticipo_requerido,
      estado: 'aprobado',
      revisado_por: 'ADMIN_VISOR',
      notas_admin: notas_admin || 'Aprobado desde Visor Web',
    });

    const cliente = reserva.clientes as any;
    const cancha = reserva.canchas as any;
    const complejo = cancha?.complejos as any;

    if (cliente?.telefono_wa) {
      const fechaFmt = new Date(reserva.fecha_inicio).toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
      const horaInicio = new Date(reserva.fecha_inicio).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });
      const horaFin = new Date(reserva.fecha_fin).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });

      const saldoPendiente = (Number(reserva.valor_total) - Number(reserva.valor_anticipo_requerido)).toLocaleString('es-CO');

      const mensajeConfirmacion =
        `🎉 *¡ANTICIPO APROBADO CON ÉXITO!*\n\n` +
        `Hola *${cliente.nombre || 'Jugador'}*, tu comprobante de pago ha sido verificado y aprobado por la administración de *${complejo?.nombre || 'el club'}*.\n\n` +
        `🏟️ Cancha: *${cancha.nombre}*\n` +
        `📅 Fecha: *${fechaFmt}*\n` +
        `⏰ Horario: *${horaInicio} a ${horaFin}*\n` +
        `💵 Saldo a pagar en cancha: *$${saldoPendiente}*\n\n` +
        `✅ Tu reserva está 100% CONFIRMADA. Te enviaremos un recordatorio 2 horas antes de tu partido. ¡Nos vemos en la cancha! ⚽🎾`;

      await enviarMensajeWhatsApp(
        cliente.telefono_wa,
        mensajeConfirmacion,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id
      );
    }

    res.json({ success: true, reserva: reservaActualizada });
  } catch (error: any) {
    console.error('Error aprobando anticipo:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Rechazar Comprobante de Anticipo desde el Visor Web
app.patch('/api/reservas/:id/rechazar-anticipo', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { motivo } = req.body;

  try {
    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('id', id)
      .single();

    if (errRes || !reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const { data: reservaActualizada, error: errUpd } = await supabase
      .from('reservas')
      .update({
        estado: 'cancelada',
        notas: `Rechazado por admin: ${motivo || 'Comprobante no válido o pago no recibido'}`,
      })
      .eq('id', id)
      .select()
      .single();

    if (errUpd) throw errUpd;

    const cliente = reserva.clientes as any;
    const cancha = reserva.canchas as any;
    const complejo = cancha?.complejos as any;

    if (cliente?.telefono_wa) {
      const mensajeRechazo =
        `❌ *Comprobante no aprobado:*\n\n` +
        `Hola *${cliente.nombre || 'Jugador'}*, la administración de *${complejo?.nombre || 'el club'}* no pudo validar tu comprobante de pago (${motivo || 'pago no recibido en la cuenta bancaria'}).\n\n` +
        `El turno en *${cancha.nombre}* ha sido liberado. Si consideras que se trata de un error, por favor comunícate directamente con la recepción del club.`;

      await enviarMensajeWhatsApp(
        cliente.telefono_wa,
        mensajeRechazo,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id
      );
    }

    res.json({ success: true, reserva: reservaActualizada });
  } catch (error: any) {
    console.error('Error rechazando anticipo:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Actualizar Estado de Pedido (Kanban Graniza2KL) con Notificación Automática WhatsApp
app.patch('/api/pedidos/:id/estado', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { nuevoEstado, notas } = req.body;

  try {
    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('id', id)
      .single();

    if (errRes || !reserva) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    let estadoDb = reserva.estado;
    let tag = '';

    if (nuevoEstado === 'en_preparacion') {
      estadoDb = 'confirmada';
      tag = '[EN_PREPARACION]';
    } else if (nuevoEstado === 'en_camino' || nuevoEstado === 'en_domicilio') {
      estadoDb = 'confirmada';
      tag = '[EN_DOMICILIO]';
    } else if (nuevoEstado === 'entregado' || nuevoEstado === 'completada') {
      estadoDb = 'completada';
      tag = '[ENTREGADO]';
    } else if (nuevoEstado === 'nuevo' || nuevoEstado === 'pendiente_pago') {
      estadoDb = 'pendiente_pago';
      tag = '[ESPERANDO_PAGO]';
    }

    const notaBase = (notas || reserva.notas || '')
      .replace(/\[EN_PREPARACION\]|\[EN_DOMICILIO\]|\[ENTREGADO\]|\[ESPERANDO_PAGO\]/g, '')
      .trim();

    const notasFinales = `${notaBase} ${tag}`.trim();

    const { data: reservaActualizada, error: errUpd } = await supabase
      .from('reservas')
      .update({
        estado: estadoDb,
        notas: notasFinales,
      })
      .eq('id', id)
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .single();

    if (errUpd) throw errUpd;

    // Extraer datos para la notificación al cliente por WhatsApp
    const cliente = reserva.clientes as any;
    const cancha = reserva.canchas as any;
    const complejo = cancha?.complejos as any;
    let mensajeEnviado = false;

    if (cliente?.telefono_wa) {
      let direccion = 'Pereira / Cobertura Domicilio';
      const dirMatch = (reservaActualizada.notas || '').match(/📍\s*Domicilio:\s*([^.[\n]+)/i);
      if (dirMatch && dirMatch[1]) direccion = dirMatch[1].trim();

      let detalleProd = 'tus granizados con licor';
      const prodMatch = (reservaActualizada.notas || '').match(/🍧\s*([^📍[\n]+)/i);
      if (prodMatch && prodMatch[1]) detalleProd = prodMatch[1].trim();

      const nombreCliente = cliente.nombre || 'Cliente';
      const totalFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(reservaActualizada.valor_total || 0);

      let mensajeWhatsApp = '';

      if (nuevoEstado === 'en_preparacion') {
        mensajeWhatsApp =
          `🍧 *¡Tu orden de Graniza2KL está en preparación!* 🍸\n\n` +
          `¡Hola *${nombreCliente}*! Tu pedido ya pasó a la barra de preparación.\n` +
          `Estamos licuando tus frappés con licor bien fríos, pulpa fresca y todos tus toppings listos ❄️✨.\n\n` +
          `📋 *Detalle:* ${detalleProd}\n` +
          `📍 *Dirección de entrega:* ${direccion}\n` +
          `💰 *Total:* ${totalFmt}\n\n` +
          `Te avisaremos en cuanto salga en camino con el repartidor 🛵💨.`;
      } else if (nuevoEstado === 'en_camino' || nuevoEstado === 'en_domicilio') {
        mensajeWhatsApp =
          `🛵💨 *¡Tu pedido de Graniza2KL va en camino!*\n\n` +
          `¡Hola *${nombreCliente}*! Tu orden acaba de ser despachada con nuestro repartidor rumbo a tu ubicación:\n` +
          `📍 *${direccion}*\n\n` +
          `📋 *Llevamos:* ${detalleProd}\n\n` +
          `Ten a la mano tu teléfono por si el repartidor te timbra o llama al llegar. ¡A disfrutar de tus granizados con licor (+18) bien helados! 🍸🍧✨`;
      } else if (nuevoEstado === 'entregado' || nuevoEstado === 'completada') {
        mensajeWhatsApp =
          `✅ *¡Pedido Entregado con Éxito!* 🎉\n\n` +
          `¡Hola *${nombreCliente}*! Tu orden ha sido completada y entregada.\n\n` +
          `¡Muchísimas gracias por elegir a *Graniza2KL - Granizados con Licor*! Esperamos que disfrutes al máximo tus cócteles frappé (+18) 🍸✨.\n\n` +
          `👉 Si deseas pedir de nuevo más tarde o para tu próxima fiesta, solo escribe *HOLA* en este chat. ¡Salud! 🥂🍧`;
      }

      if (mensajeWhatsApp) {
        try {
          await enviarMensajeWhatsApp(
            cliente.telefono_wa,
            mensajeWhatsApp,
            complejo?.whatsapp_token,
            complejo?.whatsapp_phone_number_id
          );
          mensajeEnviado = true;
        } catch (waErr: any) {
          console.error('Error enviando notificación WhatsApp de pedido:', waErr.message);
        }
      }
    }

    res.json({
      success: true,
      reserva: reservaActualizada,
      mensajeEnviado,
    });
  } catch (error: any) {
    console.error('Error actualizando estado de pedido:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================================================================
// 4. ENDPOINTS RESERVAS WEB SPA DE UÑAS (JL MÍMATE NAILS) - SIN ANTICIPO
// ==============================================================================

const SERVICIOS_MIMATE_NAILS = [
  {
    id: 1,
    nombre: 'Manicura tradicional',
    categoria: 'Tradicional',
    duracion: 45,
    precio: 25000,
    descripcion: 'Limpieza profunda, corte, limado, exfoliación, hidratación y esmaltado tradicional.'
  },
  {
    id: 2,
    nombre: 'Pedicure tradicional',
    categoria: 'Tradicional',
    duracion: 50,
    precio: 30000,
    descripcion: 'Cuidado completo de pies, retiro de callosidades, exfoliación, masaje y esmaltado.'
  },
  {
    id: 3,
    nombre: 'Semipermanente',
    categoria: 'Semipermanente & Ruber',
    duracion: 60,
    precio: 45000,
    descripcion: 'Esmaltado en gel curado en lámpara LED con brillo espejo y duración de hasta 21 días.'
  },
  {
    id: 4,
    nombre: 'Base ruber',
    categoria: 'Semipermanente & Ruber',
    duracion: 60,
    precio: 55000,
    descripcion: 'Nivelación y refuerzo estructural con base elástica de alta densidad para uñas frágiles.'
  },
  {
    id: 5,
    nombre: 'Dipping',
    categoria: 'Dipping & Press On',
    duracion: 60,
    precio: 60000,
    descripcion: 'Técnica de polvo de inmersión sin lámpara, extra resistente y acabado ultra natural.'
  },
  {
    id: 6,
    nombre: 'Uñas press on',
    categoria: 'Dipping & Press On',
    duracion: 60,
    precio: 50000,
    descripcion: 'Tips preformados de gel aplicados con adhesivo curable para largo y forma al instante.'
  },
  {
    id: 7,
    nombre: 'Acrilico esculpido',
    categoria: 'Esculpidas & Polygel',
    duracion: 90,
    precio: 85000,
    descripcion: 'Extensión artesanal esculpida a mano con monómero y polímero para estructura perfecta.'
  },
  {
    id: 8,
    nombre: 'Uñas polygel',
    categoria: 'Esculpidas & Polygel',
    duracion: 90,
    precio: 80000,
    descripcion: 'Fusión híbrida de gel y acrílico, liviano, sin olor y con máxima flexibilidad y durabilidad.'
  },
  {
    id: 9,
    nombre: 'Recubrimiento uña natural',
    categoria: 'Recubrimiento & Cuidado',
    duracion: 75,
    precio: 65000,
    descripcion: 'Capa protectora de acrílico o gel sobre el largo propio para evitar rupturas y permitir crecimiento.'
  },
];

// Obtener info del spa, empleadas y catálogo de servicios
app.get('/api/spa/info', async (req: Request, res: Response) => {
  try {
    let { data: complejo } = await supabase
      .from('complejos')
      .select('*')
      .eq('slug', 'mimate-nails')
      .maybeSingle();

    if (!complejo) {
      complejo = await BookingService.crearComplejo({
        nombre: 'JL Mímate Nails',
        slug: 'mimate-nails',
        tipo_negocio: 'belleza_unas',
        direccion: 'Pereira, Risaralda · Spa de Uñas',
        ciudad: 'Pereira',
        telefono_whatsapp: '573219610896',
        hora_apertura: '09:30:00',
        hora_cierre: '17:30:00',
        porcentaje_anticipo_minimo: 0,
      });
    }

    const { data: canchas } = await supabase
      .from('canchas')
      .select('*')
      .eq('complejo_id', complejo.id)
      .eq('activa', true)
      .order('nombre');

    res.json({
      complejo,
      equipo: canchas || [],
      servicios: SERVICIOS_MIMATE_NAILS,
      categorias: ['Todos', 'Tradicional', 'Semipermanente & Ruber', 'Dipping & Press On', 'Esculpidas & Polygel', 'Recubrimiento & Cuidado']
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener horarios (slots) disponibles para una fecha específica (Lunes a Sábado, 9:30 am a 5:30 pm)
app.get('/api/spa/slots', async (req: Request, res: Response) => {
  const { date, cancha_id } = req.query;
  if (!date) return res.status(400).json({ error: 'Parámetro date requerido (YYYY-MM-DD)' });

  try {
    const fechaObj = new Date(`${date}T12:00:00-05:00`);
    const diaSemana = fechaObj.getDay(); // 0 = Domingo

    if (diaSemana === 0) {
      return res.json({
        date,
        slots: [],
        aviso: 'Los domingos estamos cerrados. Atendemos con amor de Lunes a Sábado de 9:30 am a 5:30 pm 💕',
      });
    }

    const { data: complejo } = await supabase
      .from('complejos')
      .select('id')
      .eq('slug', 'mimate-nails')
      .maybeSingle();

    if (!complejo) return res.status(404).json({ error: 'Spa no configurado' });

    const { data: empleadas } = await supabase
      .from('canchas')
      .select('id, nombre')
      .eq('complejo_id', complejo.id)
      .eq('activa', true);

    const listaEmpleadas = empleadas || [];
    if (listaEmpleadas.length === 0) return res.json({ date, slots: [] });

    // Franjas horarias de 9:30 am a 5:30 pm (último turno inicia a las 16:30)
    const horasBase = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];

    const inicioBuffer = new Date(new Date(`${date}T00:00:00-05:00`).getTime() - 6 * 60 * 60 * 1000).toISOString();
    const finBuffer = new Date(new Date(`${date}T23:59:59-05:00`).getTime() + 6 * 60 * 60 * 1000).toISOString();

    const { data: reservasOcupadas } = await supabase
      .from('reservas')
      .select('cancha_id, fecha_inicio, fecha_fin, estado')
      .in('cancha_id', listaEmpleadas.map(e => e.id))
      .neq('estado', 'cancelada')
      .gte('fecha_inicio', inicioBuffer)
      .lte('fecha_inicio', finBuffer);

    const ocupadas = reservasOcupadas || [];
    const ahoraMs = Date.now();
    const slotsDisponibles: string[] = [];

    for (const h of horasBase) {
      const slotStartMs = new Date(`${date}T${h}:00-05:00`).getTime();
      const slotEndMs = slotStartMs + 60 * 60 * 1000;

      // Si la fecha es hoy y la hora ya pasó, no se puede agendar
      if (slotStartMs <= ahoraMs) {
        continue;
      }

      // Buscar qué manicuristas están ocupadas en esta franja mediante solapamiento temporal
      const manicuristasOcupadasEnHora = ocupadas
        .filter(r => {
          const rStart = new Date(r.fecha_inicio).getTime();
          const rEnd = new Date(r.fecha_fin).getTime();
          return rStart < slotEndMs && rEnd > slotStartMs;
        })
        .map(r => r.cancha_id);

      if (cancha_id) {
        // Si el cliente eligió una manicurista específica
        const estaOcupada = manicuristasOcupadasEnHora.includes(cancha_id as string);
        if (!estaOcupada) {
          slotsDisponibles.push(h);
        }
      } else {
        // Si no eligió manicurista (cualquiera disponible):
        // Hay disponibilidad si al menos UNA manicurista está libre
        const hayLibre = listaEmpleadas.some(e => !manicuristasOcupadasEnHora.includes(e.id));
        if (hayLibre) {
          slotsDisponibles.push(h);
        }
      }
    }

    res.json({
      date,
      slots: slotsDisponibles,
      aviso: slotsDisponibles.length === 0 ? 'No hay horarios disponibles para esta fecha. Prueba con otro día 💕' : undefined
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Confirmar reserva web (100% directa, sin anticipo) con Voucher y prevención de duplicados
app.post('/api/spa/reservar', async (req: Request, res: Response) => {
  const {
    servicio_nombre,
    precio,
    duracion_minutos = 60,
    fecha,
    hora,
    cancha_id,
    cliente_nombre,
    cliente_telefono,
    reagendar_reserva_id
  } = req.body;

  if (!fecha || !hora || !cliente_telefono || !cliente_nombre) {
    return res.status(400).json({ error: 'Faltan datos requeridos (fecha, hora, nombre, teléfono)' });
  }

  try {
    const { data: complejo } = await supabase
      .from('complejos')
      .select('*')
      .eq('slug', 'mimate-nails')
      .maybeSingle();

    if (!complejo) throw new Error('Spa no encontrado');

    const { data: empleadas } = await supabase
      .from('canchas')
      .select('*')
      .eq('complejo_id', complejo.id)
      .eq('activa', true);

    const listaEmpleadas = empleadas || [];
    if (listaEmpleadas.length === 0) {
      return res.status(400).json({ error: 'No hay personal registrado en el spa' });
    }

    const dInicio = new Date(`${fecha}T${hora}:00-05:00`);
    const dFin = new Date(dInicio.getTime() + (Number(duracion_minutos) || 60) * 60 * 1000);

    // 1. Validar que la hora no esté en el pasado
    if (dInicio.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'No puedes reservar un horario que ya pasó.' });
    }

    // 2. Buscar reservas activas solapadas en esta franja para evitar duplicados (excluyendo cita anterior si es reagendamiento)
    const { data: reservasSolapadas } = await supabase
      .from('reservas')
      .select('id, cancha_id, fecha_inicio, fecha_fin')
      .in('cancha_id', listaEmpleadas.map(e => e.id))
      .neq('estado', 'cancelada')
      .lt('fecha_inicio', dFin.toISOString())
      .gt('fecha_fin', dInicio.toISOString());

    const ocupadasIds = (reservasSolapadas || [])
      .filter(r => !reagendar_reserva_id || r.id !== reagendar_reserva_id)
      .map(r => r.cancha_id);

    let empleadaAsignada: any;

    if (cancha_id) {
      if (ocupadasIds.includes(cancha_id)) {
        return res.status(409).json({
          error: 'La manicurista seleccionada ya tiene una cita agendada en este horario. Por favor elige otra hora o especialista.',
        });
      }
      empleadaAsignada = listaEmpleadas.find(e => e.id === cancha_id);
      if (!empleadaAsignada) {
        return res.status(404).json({ error: 'Especialista no encontrada' });
      }
    } else {
      // Asignar automáticamente una manicurista libre
      const disponibles = listaEmpleadas.filter(e => !ocupadasIds.includes(e.id));
      if (disponibles.length === 0) {
        return res.status(409).json({
          error: 'Lo sentimos, todos los turnos para este horario ya fueron reservados. Por favor selecciona otro horario.',
        });
      }
      empleadaAsignada = disponibles[0];
    }

    // Normalizar teléfono celular (formato Colombia: 573...)
    let cleanPhone = String(cliente_telefono).replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = `57${cleanPhone}`;
    }

    const cliente = await BookingService.getOrCreateCliente(cleanPhone, cliente_nombre.trim());

    const notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | Reserva Web JL Mímate Nails | Pago en el spa (Sin cobro anticipado)`;

    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .insert({
        cancha_id: empleadaAsignada.id,
        cliente_id: cliente.id,
        fecha_inicio: dInicio.toISOString(),
        fecha_fin: dFin.toISOString(),
        valor_total: precio || 35000,
        valor_anticipo_requerido: 0,
        estado: 'confirmada',
        notas,
      })
      .select('*, canchas(*), clientes(*)')
      .single();

    if (errRes) throw errRes;

    // Si la reserva proviene de un flujo de reagendamiento, eliminar la reserva anterior para liberar el cupo previo
    if (reagendar_reserva_id) {
      try {
        console.log(`[REAGENDAMIENTO] Eliminando cita anterior ID: ${reagendar_reserva_id} tras confirmar nueva cita`);
        await supabase
          .from('reservas')
          .delete()
          .eq('id', reagendar_reserva_id);
      } catch (delErr: any) {
        console.warn(`[REAGENDAMIENTO] Error eliminando cita previa ${reagendar_reserva_id}:`, delErr.message);
      }
    }

    // Formatear precio en pesos colombianos ($25.000)
    const numPrecio = Number(precio || 0);
    const precioFmt = '$' + numPrecio.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    const fechaLegible = dInicio.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const avisoReagendado = reagendar_reserva_id
      ? `🔄 *Cita reagendada con éxito:* Tu cita anterior fue cancelada y actualizada a este nuevo horario.\n\n`
      : '';

    const voucherWhatsApp =
      `🌸 *JL MÍMATE NAILS* 🌸\n` +
      `_Comprobante de Cita_\n` +
      `───────────────\n\n` +
      `¡Hola *${cliente_nombre.trim()}*! 💅 Tu cita ha sido agendada con éxito:\n\n` +
      `💅 *Servicio:* ${servicio_nombre}\n` +
      `👩‍🎨 *Especialista:* ${empleadaAsignada.nombre}\n` +
      `📅 *Fecha:* ${fechaLegible}\n` +
      `⏰ *Hora:* ${hora}\n` +
      `⏱️ *Duración aprox:* ${duracion_minutos} min\n` +
      `💰 *Valor a pagar:* ${precioFmt}\n\n` +
      `📍 *Dirección:* Pereira, Cuba (Calle 66 bis #26-57)\n` +
      `🏢 *Lugar:* JL Mímate Nails - Spa de Uñas\n\n` +
      `───────────────\n` +
      avisoReagendado +
      `Si necesitas reprogramar o tienes alguna duda, puedes responder directamente a este mensaje.\n` +
      `¡Nos vemos pronto para consentirte reina! 💕🌸`;

    let waEnviado = false;
    try {
      await enviarMensajeWhatsApp(
        cleanPhone,
        voucherWhatsApp,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id
      );
      waEnviado = true;
    } catch (e: any) {
      console.warn('No se pudo enviar WhatsApp inmediato:', e.message);
    }

    res.status(201).json({
      success: true,
      reserva,
      empleada: empleadaAsignada.nombre,
      waEnviado,
      voucher: voucherWhatsApp,
    });
  } catch (error: any) {
    console.error('Error creando reserva web en spa:', error);
    res.status(500).json({ error: error.message });
  }
});

// Métricas y Resumen Financiero filtradas por complejo
app.get('/api/metricas', async (req: Request, res: Response) => {
  try {
    const { complejo_id } = req.query;
    let query = supabase.from('reservas').select('estado, valor_total, valor_anticipo_requerido, canchas!inner(complejo_id)');

    if (complejo_id) {
      query = query.eq('canchas.complejo_id', complejo_id as string);
    }

    const { data: reservas, error } = await query;
    if (error) throw error;

    const totalReservas = reservas?.length || 0;
    const confirmadas = reservas?.filter((r) => r.estado === 'confirmada' || r.estado === 'completada') || [];
    const ingresosTotales = confirmadas.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);
    const anticiposRecaudados = confirmadas.reduce((sum, r) => sum + Number(r.valor_anticipo_requerido || 0), 0);

    res.json({
      total_reservas: totalReservas,
      reservas_confirmadas: confirmadas.length,
      ingresos_estimados: ingresosTotales,
      anticipos_recaudados: anticiposRecaudados,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Tarea de recordatorios automáticos
app.post('/api/cron/recordatorios', async (req: Request, res: Response) => {
  try {
    const resultado = await ReminderService.procesarRecordatoriosProximos();
    await BookingService.liberarReservasExpiradas();
    res.json({ status: 'ok', ...resultado });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📡 Webhook WhatsApp listo en: http://localhost:${PORT}/webhook`);
  console.log(`💬 Simulador del Bot listo en: POST http://localhost:${PORT}/api/bot/simulate`);
  console.log(`⏰ Cron Recordatorios listo en: POST http://localhost:${PORT}/api/cron/recordatorios`);

  setInterval(async () => {
    try {
      await ReminderService.procesarRecordatoriosProximos();
      await BookingService.liberarReservasExpiradas();
    } catch (e) {
      console.error('Error en tarea programada:', e);
    }
  }, 5 * 60 * 1000);
});
