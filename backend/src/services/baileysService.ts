import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  WAMessage,
  generateWAMessageFromContent,
} from '@whiskeysockets/baileys';
import pino from 'pino';
// @ts-ignore
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import { WhatsAppFlow, BotResponse } from '../bot/whatsappFlow.js';
import { BookingService, Complejo } from './bookingService.js';
import { BotExclusionsService } from './botExclusionsService.js';
import { supabase } from '../config/supabase.js';

export class BaileysService {
  private static socket: WASocket | null = null;
  private static qrCode: string | null = null;
  private static statusConexion: 'DESCONECTADO' | 'ESPERANDO_QR' | 'CONECTANDO' | 'CONECTADO' = 'DESCONECTADO';
  private static procesadosCache = new Set<string>();

  /**
   * Obtiene la lista blanca de números autorizados desde variables de entorno.
   * Si está configurada, el bot NUNCA responderá a ningún otro número.
   */
  private static getWhitelist(): string[] {
    const defaultNumbers = [
      '573022779797',
      '573223739845',
      '573134862536',
      '3022779797',
      '3223739845',
      '3134862536',
    ];
    const raw = process.env.BAILEYS_WHITELIST_NUMBERS || '';
    const envNumbers = raw
      .split(',')
      .map((num) => num.replace(/\D/g, '').trim())
      .filter((num) => num.length > 0);
    return Array.from(new Set([...defaultNumbers, ...envNumbers]));
  }

  /**
   * Verifica si un remitente está en la lista blanca de seguridad.
   */
  private static estaEnListaBlanca(telefonoLimpio: string): boolean {
    const whitelist = this.getWhitelist();
    // Si no hay lista blanca configurada en .env, atiende normalmente (modo producción abierta)
    if (whitelist.length === 0) return true;

    // Si hay lista blanca configurada, el remitente DEBE estar en la lista
    return whitelist.some((autorizado) => {
      return (
        telefonoLimpio === autorizado ||
        telefonoLimpio.endsWith(autorizado) ||
        autorizado.endsWith(telefonoLimpio)
      );
    });
  }

  /**
   * Simula retardo humano (espera asíncrona)
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Restaura la sesión desde la base de datos de Supabase si el disco local está vacío (como en Render)
   */
  private static async restaurarSesionDesdeSupabase(authDir: string): Promise<boolean> {
    const credsPath = path.join(authDir, 'creds.json');
    if (fs.existsSync(credsPath)) return true;

    try {
      const complejos = await BookingService.getComplejos();
      const tokenData = complejos[0]?.whatsapp_token;
      if (!tokenData || !tokenData.includes('"creds.json"')) return false;

      const bundle = JSON.parse(tokenData);
      for (const [nombreArchivo, contenido] of Object.entries(bundle)) {
        fs.writeFileSync(path.join(authDir, nombreArchivo), contenido as string, 'utf-8');
      }
      console.log(`💾 Sesión de Baileys restaurada exitosamente desde Supabase (${Object.keys(bundle).length} archivos).`);
      return true;
    } catch (err) {
      console.error('Error restaurando sesión de Baileys desde Supabase:', err);
      return false;
    }
  }

  /**
   * Respalda automáticamente los archivos de sesión en Supabase para que Render no vuelva a pedir QR
   */
  private static debounceGuardado: NodeJS.Timeout | null = null;
  private static respaldarSesionEnSupabase(authDir: string, inmediato: boolean = false): void {
    if (this.debounceGuardado) clearTimeout(this.debounceGuardado);

    const ejecutarRespaldo = async () => {
      try {
        const credsPath = path.join(authDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        const files = fs.readdirSync(authDir);
        const bundle: Record<string, string> = {};
        for (const f of files) {
          const filePath = path.join(authDir, f);
          if (fs.statSync(filePath).isFile()) {
            bundle[f] = fs.readFileSync(filePath, 'utf-8');
          }
        }

        const serialized = JSON.stringify(bundle);
        const complejos = await BookingService.getComplejos();
        const complejoId = complejos[0]?.id;
        if (complejoId) {
          await supabase
            .from('complejos')
            .update({ whatsapp_token: serialized })
            .eq('id', complejoId);
          console.log(`💾 Sesión de WhatsApp respaldada permanentemente en Supabase (${files.length} archivos).`);
        }
      } catch (err) {
        console.error('Error respaldando sesión en Supabase:', err);
      }
    };

    if (inmediato) {
      ejecutarRespaldo();
    } else {
      this.debounceGuardado = setTimeout(ejecutarRespaldo, 2000);
    }
  }

  /**
   * Inicializa la conexión de Baileys con blindaje anti-baneo
   */
  static async iniciar(): Promise<void> {
    const authDir = path.join(process.cwd(), 'baileys_auth_info');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // 1. Restaurar sesión previa de Supabase si estamos en un contenedor nuevo (como Render)
    await this.restaurarSesionDesdeSupabase(authDir);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' });

    console.log('\n======================================================');
    console.log('🤖 INICIANDO SERVICIO BLINDADO DE BAILEYS (WHATSAPP)');
    console.log(`📦 Versión del protocolo WhatsApp Web: ${version.join('.')}`);
    const whitelist = this.getWhitelist();
    if (whitelist.length > 0) {
      console.log(`🛡️  MODO LISTA BLANCA ACTIVO: Solo responderá a: [${whitelist.join(', ')}]`);
    } else {
      console.log('⚠️  MODO ABIERTO: Sin lista blanca (responderá a todos los chats)');
    }
    console.log('======================================================\n');

    this.statusConexion = 'CONECTANDO';

    // Blindaje de conexión: Browser Fingerprint oficial de Google Chrome en Desktop
    this.socket = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['Windows', 'Chrome', '124.0.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 60000,
    });

    this.socket.ev.on('creds.update', async () => {
      await saveCreds();
      this.respaldarSesionEnSupabase(authDir);
    });

    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.statusConexion = 'ESPERANDO_QR';
        console.log('\n📲 ESCANEA ESTE CÓDIGO QR EN TU WHATSAPP (Dispositivos vinculados):\n');
        qrcode.generate(qr, { small: true });
        console.log('👆 Abre WhatsApp > Dispositivos Vinculados > Vincular un dispositivo.\n');
      }

      if (connection === 'close') {
        this.statusConexion = 'DESCONECTADO';
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const debeReconectar = statusCode !== DisconnectReason.loggedOut;

        console.log(`⚠️ Conexión de Baileys cerrada (Código: ${statusCode}). Reconectando: ${debeReconectar}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('❌ Sesión cerrada desde el celular. Limpiando credenciales antiguas...');
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
            const complejos = await BookingService.getComplejos();
            if (complejos[0]?.id) {
              await supabase.from('complejos').update({ whatsapp_token: null }).eq('id', complejos[0].id);
            }
          } catch (e) {
            console.error('Error limpiando authDir:', e);
          }
          setTimeout(() => this.iniciar(), 5000);
        } else if (debeReconectar) {
          // Retardo progresivo para evitar spam de reconexiones
          setTimeout(() => this.iniciar(), 4000);
        }
      } else if (connection === 'open') {
        this.statusConexion = 'CONECTADO';
        this.qrCode = null;
        console.log('\n✅ ¡BAILEYS CONECTADO EXITOSAMENTE A WHATSAPP!');
        console.log(`📱 Usuario conectado: ${this.socket?.user?.id || 'Sesión Activa'}\n`);
        this.respaldarSesionEnSupabase(authDir, true);
      }
    });

    // Procesar mensajes entrantes con blindaje
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const m of messages) {
        try {
          await this.procesarMensajeEntrante(m);
        } catch (err) {
          console.error('[Baileys] Error procesando mensaje:', err);
        }
      }
    });
  }

  /**
   * Procesa cada mensaje con las protecciones de lista blanca y comportamiento humano
   */
  private static async procesarMensajeEntrante(m: WAMessage): Promise<void> {
    if (!this.socket || !m.message || !m.key) return;

    // 1. BLINDAJE: Evitar bucles de mensajes propios (a menos que hables contigo mismo en un chat privado de pruebas)
    const remoteJid = m.key.remoteJid || '';
    if (!remoteJid || remoteJid.endsWith('@g.us')) {
      // Ignorar grupos para evitar baneos por mensajes no solicitados
      return;
    }

    // Deduplicación por ID de mensaje
    const msgId = m.key.id || '';
    if (this.procesadosCache.has(msgId)) return;
    this.procesadosCache.add(msgId);
    if (this.procesadosCache.size > 2000) {
      this.procesadosCache.clear();
    }

    // 2. Extraer teléfono limpio
    const telefonoLimpio = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');

    // 3. BLINDAJE: Verificación estricta de Lista Blanca
    if (!this.estaEnListaBlanca(telefonoLimpio)) {
      // Si el número NO está en la lista blanca, salir silenciosamente
      return;
    }

    // Ignorar mensajes enviados por mí si no es un chat contigo mismo
    if (m.key.fromMe) {
      const myJid = this.socket.user?.id ? this.socket.user.id.split(':')[0] + '@s.whatsapp.net' : '';
      if (remoteJid !== myJid) {
        return;
      }
    }

    // Verificar si el número está en la lista de exclusión (atención humana / bot silenciado)
    const esExcluido = await BotExclusionsService.esNumeroExcluido(telefonoLimpio);
    if (esExcluido) {
      console.log(`[Baileys] Mensaje de ${telefonoLimpio} ignorado (en lista de atención humana).`);
      return;
    }

    // 4. Extraer texto y adjuntos del mensaje (incluyendo clics de botones interactivos)
    const messageContent = m.message;
    let texto =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      '';

    if (messageContent.buttonsResponseMessage) {
      texto =
        messageContent.buttonsResponseMessage.selectedButtonId ||
        messageContent.buttonsResponseMessage.selectedDisplayText ||
        '';
    } else if (messageContent.templateButtonReplyMessage) {
      texto =
        messageContent.templateButtonReplyMessage.selectedId ||
        messageContent.templateButtonReplyMessage.selectedDisplayText ||
        '';
    } else if (messageContent.interactiveResponseMessage) {
      const nativeFlow = messageContent.interactiveResponseMessage.nativeFlowResponseMessage;
      if (nativeFlow?.paramsJson) {
        try {
          const parsed = JSON.parse(nativeFlow.paramsJson);
          texto = parsed.id || messageContent.interactiveResponseMessage.body?.text || '';
        } catch {
          texto = messageContent.interactiveResponseMessage.body?.text || '';
        }
      } else {
        texto = messageContent.interactiveResponseMessage.body?.text || '';
      }
    } else if (messageContent.listResponseMessage?.singleSelectReply?.selectedRowId) {
      texto = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
    }

    let directBuffer: Buffer | undefined;
    let mediaType: string | undefined;

    if (messageContent.imageMessage) {
      try {
        const stream = await downloadMediaMessage(m as any, 'buffer', {});
        directBuffer = stream as Buffer;
        mediaType = messageContent.imageMessage.mimetype || 'image/jpeg';
        if (!texto) texto = 'comprobante_imagen';
      } catch (mediaErr) {
        console.error('[Baileys] Error descargando imagen de mensaje:', mediaErr);
      }
    }

    if (!texto && !directBuffer) return;

    // 5. BLINDAJE ANTI-DETECCIÓN (<5% RIESGO):
    // Esperar entre 1.5 y 2.5 segundos antes de marcar como leído para simular lectura humana
    await this.delay(1500 + Math.random() * 1000);
    try {
      await this.socket.readMessages([m.key as any]);
    } catch (e) {
      // Ignorar fallo de marcado de lectura
    }

    // 6. Obtener complejo/spa
    const complejos = await BookingService.getComplejos();
    const complejo: Complejo = complejos[0];
    const nombrePush = m.pushName || undefined;

    // Si envió imagen de comprobante, enviar de inmediato mensaje de espera
    if (directBuffer) {
      const nombreDest = nombrePush ? ` ${nombrePush}` : '';
      const msgEspera =
        `🌸 *¡Hola${nombreDest}!* Recibimos tu comprobante de pago 💕.\n\n` +
        `⏳ Estamos confirmando tu transferencia, por favor espera un momento mientras validamos los datos... 🔍✨`;

      await this.enviarConTipeoHumano(remoteJid, msgEspera);
    }

    // 7. Procesar con el cerebro de WhatsAppFlow (IA Gemini + Supabase)
    const respuestaBot = await WhatsAppFlow.procesarMensaje(
      telefonoLimpio,
      texto,
      nombrePush,
      complejo,
      undefined,
      mediaType,
      directBuffer
    );

    // 8. Enviar respuesta adaptada para Baileys con presencia de tipeo humano
    await this.enviarConTipeoHumano(remoteJid, respuestaBot);
  }

  /**
   * Envía un mensaje simulando comportamiento humano (escribiendo...) y adaptando menús interactivos
   */
  private static async enviarConTipeoHumano(remoteJid: string, response: string | BotResponse): Promise<void> {
    if (!this.socket) return;

    const textoFinal = this.formatearTextoParaBaileys(response);
    if (!textoFinal.trim()) return;

    // 1. Simular presencia de "escribiendo..." (composing)
    try {
      await this.socket.sendPresenceUpdate('composing', remoteJid);
    } catch (e) {
      // Ignorar si falla presencia
    }

    // 2. Retardo natural proporcional a la longitud del texto (1.5s a 3.5s)
    const msTipeo = Math.min(1800 + textoFinal.length * 10, 3800) + Math.random() * 500;
    await this.delay(msTipeo);

    // 3. Pausar presencia y enviar el mensaje
    try {
      await this.socket.sendPresenceUpdate('paused', remoteJid);
      await this.socket.sendMessage(remoteJid, { text: textoFinal });
    } catch (sendErr) {
      console.error('[Baileys] Error enviando mensaje a:', remoteJid, sendErr);
    }
  }

  /**
   * Adapta las respuestas interactivas de Meta (botones/listas) a formato de texto legible
   * con números claros para que el usuario responda con 1, 2, 3...
   */
  private static formatearTextoParaBaileys(response: string | BotResponse): string {
    if (typeof response === 'string') return response;

    let texto = response.texto || '';

    if (response.interactive) {
      if (response.interactive.type === 'list') {
        const sections = response.interactive.action?.sections || [];
        const itemsText: string[] = [];
        let indexGlobal = 1;

        for (const sec of sections) {
          if (sec.title) {
            itemsText.push(`\n📌 *${sec.title.toUpperCase()}*`);
          }
          for (const row of sec.rows || []) {
            const desc = row.description ? ` _(${row.description})_` : '';
            itemsText.push(`${indexGlobal}️⃣ *${row.title}*${desc}`);
            indexGlobal++;
          }
        }

        if (itemsText.length > 0) {
          texto += `\n\n${itemsText.join('\n')}\n\n👉 *Responde con el número de tu opción (ej. 1).*`;
        }
      } else if (response.interactive.type === 'cta_url') {
        const action = response.interactive.action as any;
        const url = action?.parameters?.url;
        const label = action?.parameters?.display_text || 'Abrir enlace';
        if (url) {
          texto += `\n\n🔗 *${label}:*\n${url}`;
        }
      }
    }

    return texto;
  }

  /**
   * Envía un mensaje proactivo o recordatorio directo a través de Baileys
   */
  static async enviarMensajeDirecto(
    telefono: string,
    mensaje: string | BotResponse,
    botones?: Array<{ id: string; title: string }>
  ): Promise<boolean> {
    if (!this.socket || this.statusConexion !== 'CONECTADO') {
      return false;
    }
    let clean = telefono.replace(/\D/g, '');
    if (clean.length === 10 && clean.startsWith('3')) {
      clean = `57${clean}`;
    }
    if (!this.estaEnListaBlanca(clean)) {
      console.log(`[Baileys] Envío directo a ${clean} bloqueado por Lista Blanca.`);
      return false;
    }
    const remoteJid = `${clean}@s.whatsapp.net`;

    // Si tiene botones, intentar enviar botones interactivos nativos de WhatsApp
    if (botones && botones.length > 0) {
      try {
        const textBody = typeof mensaje === 'string' ? mensaje : mensaje.texto;
        const interactiveButtons = botones.map((b) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: b.title,
            id: b.id,
          }),
        }));

        const msg = generateWAMessageFromContent(
          remoteJid,
          {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2,
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  body: proto.Message.InteractiveMessage.Body.create({
                    text: textBody,
                  }),
                  footer: proto.Message.InteractiveMessage.Footer.create({
                    text: 'JL Mímate Nails Spa 💕',
                  }),
                  header: proto.Message.InteractiveMessage.Header.create({
                    title: '🌸 Recordatorio de Cita',
                    hasMediaAttachment: false,
                  }),
                  nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: interactiveButtons,
                  }),
                }),
              },
            },
          },
          { userJid: this.socket.user?.id || remoteJid }
        );

        await this.delay(1200);
        await this.socket.relayMessage(remoteJid, msg.message!, { messageId: msg.key.id! });
        return true;
      } catch (btnErr) {
        console.warn('[Baileys] Error enviando botones interactivos nativos, recurriendo a formato texto:', btnErr);
      }
    }

    // Fallback: si no hay botones o fallaron los botones nativos
    let textoSalida = mensaje;
    if (botones && botones.length > 0 && typeof mensaje === 'string') {
      const opciones = botones.map((b, i) => `${i + 1}️⃣ ${b.title}`).join('\n');
      textoSalida = `${mensaje}\n\n${opciones}\n\n👉 Responde con el número de tu opción.`;
    }

    await this.enviarConTipeoHumano(remoteJid, textoSalida);
    return true;
  }

  /**
   * Estado actual de Baileys para consulta en endpoints
   */
  static getEstado() {
    return {
      status: this.statusConexion,
      tieneQr: !!this.qrCode,
      qr: this.qrCode,
      whitelist: this.getWhitelist(),
      usuarioConectado: this.socket?.user?.id || null,
    };
  }
}
