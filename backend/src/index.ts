import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { supabase } from './config/supabase.js';
import { WhatsAppFlow, BotResponse } from './bot/whatsappFlow.js';
import { ReminderService } from './services/reminderService.js';
import { BookingService } from './services/bookingService.js';
import { AIReceptionistService } from './services/aiReceptionistService.js';
import { BotExclusionsService } from './services/botExclusionsService.js';

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
    servicio: 'JL Mímate Nails Spa - API & WhatsApp Bot',
    base_de_datos: 'Supabase PostgreSQL Conectada',
    version: '2.0.0',
    webhook_url: '/webhook',
    politica_privacidad: '/politica-de-privacidad',
    simulador_bot: '/api/bot/simulate',
    cron_recordatorios: '/api/cron/recordatorios',
  });
});

app.get('/politica-de-privacidad', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Política de Privacidad - JL Mímate Nails Spa</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { color: #db2777; border-bottom: 2px solid #fbcfe8; padding-bottom: 10px; }
    h2 { color: #be185d; margin-top: 30px; }
    p, li { font-size: 15px; }
    .footer { margin-top: 50px; font-size: 13px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Política de Privacidad - JL Mímate Nails Spa</h1>
  <p><strong>Última actualización:</strong> Octubre de 2026</p>
  <p>En <strong>JL Mímate Nails Spa</strong> (Pereira, Colombia), nos tomamos muy en serio la privacidad y protección de los datos personales de nuestras clientas.</p>
  
  <h2>1. Información que recopilamos</h2>
  <p>Cuando interactúas con nuestro servicio de agendamiento y atención por WhatsApp o plataforma web, podemos recopilar:</p>
  <ul>
    <li>Nombre completo y número de teléfono de contacto.</li>
    <li>Historial de citas, servicios solicitados (manicura, pedicura, etc.) y fechas deseadas.</li>
  </ul>

  <h2>2. Uso de la información</h2>
  <p>Los datos recopilados se utilizan exclusivamente para:</p>
  <ul>
    <li>Gestionar y confirmar tus citas en nuestro spa.</li>
    <li>Enviarte recordatorios automáticos de tus citas para tu comodidad.</li>
    <li>Brindarte atención y soporte personalizado sobre nuestros servicios.</li>
  </ul>

  <h2>3. Protección de tus datos</h2>
  <p>No compartimos, vendemos ni divulgamos tu información personal con terceros para fines publicitarios. Tus datos están almacenados de forma segura con estándares de cifrado.</p>

  <h2>4. Contacto</h2>
  <p>Si tienes preguntas o deseas solicitar la eliminación de tus datos, puedes comunicarte con nosotros vía WhatsApp al +57 321 961 0896 o en nuestra sede en Pereira, Cuba.</p>

  <div class="footer">
    <p>© 2026 JL Mímate Nails Spa. Todos los derechos reservados.</p>
  </div>
</body>
</html>`);
});

// ==============================================================================
// 2. WHATSAPP CLOUD API - WEBHOOK (META MULTI-EMPRESA)
// ==============================================================================

app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const configuredToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  const defaultToken = 'token_secreto_para_webhook_12345';
  const cleanIncoming = String(token || '').trim().replace(/^["']|["']$/g, '');

  if (mode && token) {
    if (
      mode === 'subscribe' &&
      (cleanIncoming === defaultToken || (configuredToken && cleanIncoming === configuredToken))
    ) {
      console.log('✅ Webhook de WhatsApp verificado con éxito');
      return res.status(200).send(challenge);
    } else {
      console.warn(`❌ Intento de verificación fallido. Esperado: '${configuredToken || defaultToken}', recibido: '${cleanIncoming}'`);
      return res.sendStatus(403);
    }
  } else {
    return res.sendStatus(400);
  }
});

interface DebugLog {
  timestamp: string;
  type: 'WEBHOOK_IN' | 'SEND_SUCCESS' | 'SEND_ERROR' | 'CONFIG_CHECK';
  detalles: any;
}
const debugLogs: DebugLog[] = [];
function addDebugLog(type: DebugLog['type'], detalles: any) {
  debugLogs.unshift({ timestamp: new Date().toISOString(), type, detalles });
  if (debugLogs.length > 50) debugLogs.pop();
}

app.get('/api/debug/whatsapp', (req: Request, res: Response) => {
  const token = (process.env.WHATSAPP_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();

  res.json({
    status: 'ok',
    environment_variables: {
      has_whatsapp_token: token.length > 0,
      whatsapp_token_length: token.length,
      whatsapp_token_preview: token.length > 10 ? `${token.slice(0, 7)}...${token.slice(-5)}` : null,
      whatsapp_phone_number_id: phoneId || 'NO_CONFIGURADO_EN_RENDER',
      has_whatsapp_verify_token: verifyToken.length > 0,
      has_supabase_url: !!process.env.SUPABASE_URL,
      has_supabase_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    total_logs: debugLogs.length,
    recent_logs: debugLogs.slice(0, 20),
  });
});

app.get('/api/debug/phone-info', async (req: Request, res: Response) => {
  const token = (process.env.WHATSAPP_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  if (!token || !phoneId) {
    return res.status(500).json({ error: 'Faltan credenciales en Render' });
  }

  try {
    const metaRes = await axios.get(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,throughput`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return res.json({ success: true, phone_info: metaRes.data });
  } catch (err: any) {
    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

app.get('/api/debug/subscribe-waba', async (req: Request, res: Response) => {
  const token = (process.env.WHATSAPP_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  if (!token || !phoneId) {
    return res.status(500).json({ error: 'Faltan credenciales en Render' });
  }

  const targetWabaId = (req.query.waba_id as string) || '1417768020334062';

  try {
    // 1. Suscribir la nueva App a la WABA (Activa la entrega de Webhooks de WhatsApp)
    const subRes = await axios.post(
      `https://graph.facebook.com/v21.0/${targetWabaId}/subscribed_apps`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // 2. Comprobar las apps suscritas a la WABA
    const checkRes = await axios.get(
      `https://graph.facebook.com/v21.0/${targetWabaId}/subscribed_apps`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return res.json({
      success: true,
      target_waba_id: targetWabaId,
      subscripcion_result: subRes.data,
      apps_suscritas: checkRes.data,
    });
  } catch (err: any) {
    return res.status(err.response?.status || 500).json({
      success: false,
      target_waba_id: targetWabaId,
      error: err.response?.data || err.message,
    });
  }
});

app.post('/api/debug/test-send', async (req: Request, res: Response) => {
  const { to, text } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Falta parametro "to" (ej. "573219610896")' });
  }

  const token = (process.env.WHATSAPP_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  if (!token || !phoneId) {
    return res.status(500).json({
      error: 'Variables no configuradas en Render',
      has_token: !!token,
      has_phone_id: !!phoneId,
    });
  }

  let cleanTo = String(to).replace(/\D/g, '');
  if (cleanTo.length === 10 && cleanTo.startsWith('3')) {
    cleanTo = `57${cleanTo}`;
  }

  try {
    const apiRes = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { body: text || 'Prueba de conexión directa con Meta Cloud API' },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    addDebugLog('SEND_SUCCESS', { to: cleanTo, data: apiRes.data });
    return res.json({ success: true, meta_response: apiRes.data });
  } catch (err: any) {
    const errorData = err.response?.data || err.message;
    addDebugLog('SEND_ERROR', { to: cleanTo, error: errorData });
    return res.status(err.response?.status || 500).json({ success: false, error: errorData });
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

        const telefonoCliente = messageObj.from;
        let texto = messageObj.text?.body || '';
        const nombrePush = contactObj?.profile?.name;

        addDebugLog('WEBHOOK_IN', {
          telefonoCliente,
          nombrePush,
          phoneId,
          displayPhone,
          tipoMensaje: messageObj.type,
          texto,
        });

        // Buscar a qué empresa le pertenece este número de WhatsApp
        const complejo = await BookingService.getComplejoByPhone(phoneId, displayPhone);

        // Soporte para respuestas interactivas de WhatsApp (Menú desplegable / Botones)
        if (messageObj.type === 'interactive' && messageObj.interactive) {
          if (messageObj.interactive.type === 'list_reply' && messageObj.interactive.list_reply) {
            texto = messageObj.interactive.list_reply.id || messageObj.interactive.list_reply.title || '';
          } else if (messageObj.interactive.type === 'button_reply' && messageObj.interactive.button_reply) {
            texto = messageObj.interactive.button_reply.id || messageObj.interactive.button_reply.title || '';
          }
        } else if (messageObj.type === 'button' && messageObj.button) {
          texto = messageObj.button.payload || messageObj.button.text || '';
        }

        let mediaId: string | undefined;
        let mediaType: string | undefined;

        if (messageObj.type === 'image') {
          mediaId = messageObj.image?.id;
          mediaType = messageObj.image?.mime_type;
          texto = messageObj.image?.caption || 'comprobante_imagen';
        }

        // Verificar si el número está en la lista de exclusión (atención humana / bot silenciado)
        const esExcluido = await BotExclusionsService.esNumeroExcluido(telefonoCliente);
        if (esExcluido) {
          console.log(`[Bot WhatsApp] Mensaje de ${telefonoCliente} IGNORADO (Número en lista de atención humana).`);
          addDebugLog('WEBHOOK_IN', {
            telefonoCliente,
            nombrePush,
            motivo: 'NUMERO_EXCLUIDO_BOT_SILENCIADO',
            texto,
          });
          return res.sendStatus(200);
        }

        // 2. Procesar con las especialistas, tarifas, Nequi y comprobantes de ESE complejo
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
      } else {
        // Puede ser un status update (delivered, read, sent)
        const change = body.entry?.[0]?.changes?.[0];
        if (change?.value?.statuses) {
          // Status update ignorado silenciosamente
        } else {
          addDebugLog('WEBHOOK_IN', { raw_entry: body.entry });
        }
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error: any) {
    console.error('Error procesando webhook multi-tenant:', error);
    addDebugLog('SEND_ERROR', { error: error?.message || error });
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
    console.warn(`[WHATSAPP MENSAJE NO ENVIADO a ${cleanTo}]: Faltan credenciales (token: ${!!token}, phoneId: ${phoneId || 'null'})`);
    addDebugLog('SEND_ERROR', {
      to: cleanTo,
      motivo: 'Faltan credenciales en Render o Complejo',
      has_token: !!token,
      phone_id: phoneId || null,
    });
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
    addDebugLog('SEND_SUCCESS', { to: cleanTo, messageId: res.data?.messages?.[0]?.id });
  } catch (err: any) {
    const errorMeta = err.response?.data || err.message;
    console.error(`❌ [ERROR WHATSAPP a ${cleanTo}]:`, errorMeta);
    addDebugLog('SEND_ERROR', { to: cleanTo, error: errorMeta });

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
        addDebugLog('SEND_SUCCESS', { to: cleanTo, fallback: true, messageId: fallbackRes.data?.messages?.[0]?.id });
      } catch (fallbackErr: any) {
        console.error('Error en fallback de texto WhatsApp:', fallbackErr.response?.data || fallbackErr.message);
      }
    }
  }
}

// ==============================================================================
// 2.1 LISTA DE EXCLUSIÓN DE WHATSAPP (BOT SILENCIADO - ATENCIÓN HUMANA MANUAL)
// ==============================================================================
app.get('/api/bot/exclusiones', async (req: Request, res: Response) => {
  try {
    const exclusiones = await BotExclusionsService.getExclusiones();
    res.json({ success: true, exclusiones });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/bot/exclusiones', async (req: Request, res: Response) => {
  try {
    const { telefono, nombre, motivo } = req.body;
    if (!telefono) {
      return res.status(400).json({ success: false, error: 'El número de teléfono es requerido' });
    }
    const nueva = await BotExclusionsService.agregarExclusion(telefono, nombre, motivo);
    res.json({ success: true, exclusion: nueva });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/bot/exclusiones/:telefono', async (req: Request, res: Response) => {
  try {
    const { telefono } = req.params;
    await BotExclusionsService.eliminarExclusion(telefono);
    res.json({ success: true, message: 'Número eliminado de la lista de exclusión. Bot reactivado.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
        `🌸✨ *¡ANTICIPO APROBADO CON ÉXITO!* ✨🌸\n\n` +
        `Hola *${cliente.nombre || 'Reina'}*, tu comprobante de pago ha sido verificado y aprobado por la administración de *${complejo?.nombre || 'JL Mímate Nails Spa'}*.\n\n` +
        `💅 Especialista: *${cancha.nombre}*\n` +
        `📅 Fecha: *${fechaFmt}*\n` +
        `⏰ Horario: *${horaInicio} a ${horaFin}*\n` +
        `💵 Saldo a pagar en el spa: *$${saldoPendiente}*\n\n` +
        `✅ Tu cita está 100% CONFIRMADA. ¡Te esperamos con todo el amor para consentirte! 💕💅`;

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
        `Hola *${cliente.nombre || 'Reina'}*, la administración de *${complejo?.nombre || 'JL Mímate Nails'}* no pudo validar tu comprobante de pago (${motivo || 'pago no recibido en la cuenta bancaria'}).\n\n` +
        `El turno con *${cancha.nombre}* ha sido liberado. Si consideras que se trata de un error, por favor comunícate directamente con nosotras. 💕`;

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

// Obtener horarios (slots) disponibles para una fecha y duración específica (Lunes a Sábado, 9:30 am a 5:30 pm)
app.get('/api/spa/slots', async (req: Request, res: Response) => {
  const { date, cancha_id, duracion_minutos } = req.query;
  if (!date) return res.status(400).json({ error: 'Parámetro date requerido (YYYY-MM-DD)' });

  try {
    const duracion = Math.max(15, parseInt(String(duracion_minutos || 45), 10));
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

    // Franjas base cada 30 minutos (jornada 9:30 a 17:30)
    const horasBase = [
      '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00',
      '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
    ];

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
    const horaCierreMs = new Date(`${date}T17:30:00-05:00`).getTime();

    // Candidatos dinámicos: horas base + puntos exactos donde terminan citas previas de ese día
    const candidatosSet = new Set<string>(horasBase);

    for (const r of ocupadas) {
      if (r.fecha_fin) {
        try {
          const dFin = new Date(r.fecha_fin);
          const hhmmFin = dFin.toLocaleTimeString('es-CO', {
            timeZone: 'America/Bogota',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const finMs = new Date(`${date}T${hhmmFin}:00-05:00`).getTime();
          const aperturaMs = new Date(`${date}T09:00:00-05:00`).getTime();
          if (finMs >= aperturaMs && finMs < horaCierreMs) {
            candidatosSet.add(hhmmFin);
          }
        } catch {
          // Ignorar fecha inválida
        }
      }
    }

    const candidatosOrdenados = Array.from(candidatosSet).sort();
    const slotsDisponibles: string[] = [];

    for (const h of candidatosOrdenados) {
      const slotStartMs = new Date(`${date}T${h}:00-05:00`).getTime();
      const slotEndMs = slotStartMs + duracion * 60 * 1000;

      // Si la fecha es hoy y la hora ya pasó, no se puede agendar
      if (slotStartMs <= ahoraMs) {
        continue;
      }

      // Si el servicio termina después de la hora de cierre del local, descartar
      if (slotEndMs > horaCierreMs) {
        continue;
      }

      // Verificar qué manicuristas están libres sin solapamiento
      const manicuristasOcupadas = ocupadas
        .filter(r => {
          const rStart = new Date(r.fecha_inicio).getTime();
          const rEnd = new Date(r.fecha_fin).getTime();
          return rStart < slotEndMs && rEnd > slotStartMs;
        })
        .map(r => r.cancha_id);

      if (cancha_id) {
        const estaOcupada = manicuristasOcupadas.includes(cancha_id as string);
        if (!estaOcupada) {
          slotsDisponibles.push(h);
        }
      } else {
        const hayLibre = listaEmpleadas.some(e => !manicuristasOcupadas.includes(e.id));
        if (hayLibre) {
          slotsDisponibles.push(h);
        }
      }
    }

    res.json({
      date,
      duracion_minutos: duracion,
      slots: slotsDisponibles,
      aviso: slotsDisponibles.length === 0 ? 'No hay horarios disponibles para esta fecha con la duración de este servicio. Prueba con otro día 💕' : undefined
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
      `🗺️ *Ubicación Maps:* https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8\n` +
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

// Endpoint de Keep-Alive y Salud para UptimeRobot / cron-job.org
app.get(['/api/ping', '/api/health', '/health'], (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    servicio: 'JL Mímate Nails Spa - Backend 24/7',
    uptime_segundos: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Tarea de recordatorios automáticos (admite GET y POST para cron jobs y keep-alive)
app.all('/api/cron/recordatorios', async (req: Request, res: Response) => {
  try {
    const resultado = await ReminderService.procesarRecordatoriosProximos();
    await BookingService.liberarReservasExpiradas();
    res.json({ status: 'ok', keep_alive: true, timestamp: new Date().toISOString(), ...resultado });
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
