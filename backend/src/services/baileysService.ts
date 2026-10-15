import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
  WAMessage,
  generateWAMessageFromContent,
  jidNormalizedUser,
  areJidsSameUser,
  isJidGroup,
  isJidBroadcast,
  isLidUser,
  Browsers,
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
  private static mensajeStore = new Map<string, proto.IMessage>();
  public static eventosDebug: Array<{ hora: string; tipo: string; detalle: any }> = [];

  // Mapeo verificado de LIDs de WhatsApp a números de teléfono reales autorizados
  public static lidToPhoneMap: Map<string, string> = new Map([
    // Contacto 3134862536 (LID oficial verificado por onWhatsApp y sub-dispositivo)
    ['272627444801659', '573134862536'],
    ['24327567204353', '573134862536'],

    // Contacto 3022779797 (LID oficial verificado por onWhatsApp y sub-dispositivos)
    ['263677336907937', '573022779797'],
    ['32547346104379', '573022779797'],
    ['264784868065348', '573022779797'],

    // Bot Mímate Nails Spa (Teléfono propio 3223739845)
    ['89296748961918', '573223739845'],
  ]);

  /**
   * Sincroniza dinámicamente los LIDs de WhatsApp para los números autorizados en la lista blanca
   */
  public static async sincronizarLids(): Promise<void> {
    try {
      if (!this.socket) return;
      const wl = this.getWhitelist();
      const phones = wl
        .filter((n) => n.length >= 10 && !n.startsWith('27') && !n.startsWith('89'))
        .map((n) => `+${n.startsWith('57') ? n : '57' + n}`);
      const uniquePhones = Array.from(new Set(phones));

      if (uniquePhones.length > 0) {
        const results = await this.socket.onWhatsApp(...uniquePhones);
        if (results) {
          for (const r of (results as any[])) {
            if (r.lid && r.jid) {
              const lidId = String(r.lid).split('@')[0];
              const phoneId = String(r.jid).split('@')[0];
              this.lidToPhoneMap.set(lidId, phoneId);
              console.log(`[Baileys] 🔗 LID Mapeado dinámicamente: ${lidId} -> ${phoneId}`);
            }
          }
        }
      }
    } catch (errSync) {
      console.warn('[Baileys] Error sincronizando LIDs:', errSync);
    }
  }

  public static addDebugEvent(tipo: string, detalle: any) {
    this.eventosDebug.unshift({
      hora: new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
      tipo,
      detalle,
    });
    if (this.eventosDebug.length > 50) this.eventosDebug.pop();
  }

  /**
   * Obtiene la lista blanca de números autorizados.
   * ÚNICAMENTE autorizados: 3134862536 y 3022779797 (además del propio bot 3223739845).
   */
  public static getWhitelist(): string[] {
    const defaultNumbers = [
      '573134862536',
      '573022779797',
      '573223739845',
      '3134862536',
      '3022779797',
      '3223739845',
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
  public static estaEnListaBlanca(telefonoLimpio: string): boolean {
    const limpio = telefonoLimpio.replace(/\D/g, '');
    if (!limpio) return false;

    // Si es un LID de WhatsApp mapeado a un número de teléfono conocido
    if (this.lidToPhoneMap.has(limpio)) {
      const telReal = this.lidToPhoneMap.get(limpio)!;
      return this.estaEnListaBlanca(telReal);
    }

    // Si es un identificador no mapeado de tipo LID (>12 dígitos y no empieza con 573...), bloquear
    if (limpio.length > 12 && !limpio.startsWith('573')) {
      return false;
    }

    const whitelist = this.getWhitelist();
    // Si no hay lista blanca configurada en .env ni números default, atiende normalmente
    if (whitelist.length === 0) return true;

    const ultimos10 = limpio.length >= 10 ? limpio.slice(-10) : limpio;

    // Verificación ESTRICTA de seguridad: Solo coincidencia exacta de número o de los 10 dígitos celulares
    return whitelist.some((autorizado) => {
      const authClean = autorizado.replace(/\D/g, '');
      const auth10 = authClean.length >= 10 ? authClean.slice(-10) : authClean;
      return limpio === authClean || (ultimos10.length === 10 && ultimos10 === auth10);
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
    // 1. Purgar localmente cualquier archivo de sesión de dispositivo propio que cause Bad MAC
    if (fs.existsSync(authDir)) {
      try {
        const localFiles = fs.readdirSync(authDir);
        for (const f of localFiles) {
          if (f.startsWith('session-89296748961918') || f.startsWith('session-573223739845')) {
            fs.unlinkSync(path.join(authDir, f));
            console.log(`🧹 Archivo de sesión desincronizado eliminado localmente: ${f}`);
          }
        }
      } catch (e) {}
    }

    const credsPath = path.join(authDir, 'creds.json');
    if (fs.existsSync(credsPath)) return true;

    try {
      const complejos = await BookingService.getComplejos();
      const tokenData = complejos[0]?.whatsapp_token;
      if (!tokenData || !tokenData.includes('"creds.json"')) return false;

      const bundle = JSON.parse(tokenData);
      for (const [nombreArchivo, contenido] of Object.entries(bundle)) {
        // No restaurar sesiones de sincronización de dispositivo propio para evitar Bad MAC
        if (nombreArchivo.startsWith('session-89296748961918') || nombreArchivo.startsWith('session-573223739845')) {
          continue;
        }
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
          // Omitir sesiones de sincronización interna que se desincronizan entre instancias
          if (f.startsWith('session-89296748961918') || f.startsWith('session-573223739845')) {
            continue;
          }
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

    // Blindaje de conexión: Browser Fingerprint oficial y keep-alive continuo anti-zombie
    this.socket = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['Windows', 'Chrome', '124.0.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      emitOwnEvents: true,
      retryRequestDelayMs: 250,
      getMessage: async (key) => {
        if (key?.id && this.mensajeStore.has(key.id)) {
          const msg = this.mensajeStore.get(key.id);
          this.addDebugEvent('REINTENTO_GETMESSAGE', { id: key.id });
          return msg;
        }
        return undefined;
      },
    });

    // 1. Guardado de credenciales independiente y no bloqueante
    this.socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        this.respaldarSesionEnSupabase(authDir);
      } catch (e) {
        console.error('Error guardando credenciales:', e);
      }
    });

    // 2. Control de estado de conexión
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

        // Sincronizar automáticamente LIDs de WhatsApp para los números de la lista blanca
        setTimeout(() => this.sincronizarLids(), 2000);
      }
    });

    // 3. Procesar mensajes entrantes con máxima prioridad e inmediatez
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`[Baileys] 📥 Mensajes entrantes detectados (Cantidad: ${messages.length}, Tipo: ${type})`);
      this.addDebugEvent('UPSERT_EVENTO', {
        tipo: type,
        cantidad: messages.length,
        remitentes: messages.map((m) => m.key?.remoteJid),
      });

      for (const m of messages) {
        try {
          await this.procesarMensajeEntrante(m);
        } catch (err) {
          console.error('[Baileys] Error procesando mensaje:', err);
          this.addDebugEvent('ERROR_UPSERT_ITEM', { error: String(err) });
        }
      }
    });
  }

  /**
   * Limpia credenciales y solicita un nuevo código QR
   */
  public static async desvincularYReiniciar(): Promise<void> {
    const authDir = path.join(process.cwd(), 'baileys_auth_info');
    try {
      if (this.socket) {
        try {
          this.socket.end(new Error('Reinicio manual solicitado'));
        } catch (e) {}
        this.socket = null;
      }
      fs.rmSync(authDir, { recursive: true, force: true });
      const complejos = await BookingService.getComplejos();
      if (complejos[0]?.id) {
        await supabase.from('complejos').update({ whatsapp_token: null }).eq('id', complejos[0].id);
      }
      this.statusConexion = 'DESCONECTADO';
      this.qrCode = null;
      this.procesadosCache.clear();
      this.eventosDebug = [];
      console.log('🔄 Sesión limpiada por completo. Generando nuevo QR...');
      setTimeout(() => this.iniciar(), 1000);
    } catch (err) {
      console.error('Error desvinculando sesión:', err);
    }
  }

  /**
   * Procesa cada mensaje con las protecciones de lista blanca y comportamiento humano
   */
  public static async procesarMensajeEntrante(m: WAMessage): Promise<void> {
    if (!this.socket) return;

    const rawJid = m.key?.remoteJid || '';
    this.addDebugEvent('PROCESAR_ITEM', {
      rawJid,
      fromMe: m.key?.fromMe,
      id: m.key?.id,
      tieneMensaje: !!m.message,
    });

    if (!m.message || !m.key) return;

    // 1. BLINDAJE: Filtrar grupos, difusiones y canales
    if (
      !rawJid ||
      isJidGroup(rawJid) ||
      isJidBroadcast(rawJid) ||
      rawJid.includes('@broadcast') ||
      rawJid.endsWith('@newsletter')
    ) {
      return;
    }

    // Normalizar JID a formato base sin sufijos de dispositivo (ej. 57313...:1@s.whatsapp.net -> 57313...@s.whatsapp.net)
    const normalizedJid = jidNormalizedUser(rawJid);

    // Deduplicación por ID de mensaje
    const msgId = m.key.id || '';
    if (!msgId || this.procesadosCache.has(msgId)) return;
    this.procesadosCache.add(msgId);
    if (this.procesadosCache.size > 2000) {
      this.procesadosCache.clear();
    }

    // 2. Extraer teléfono limpio y resolver LID de WhatsApp si aplica
    let telefonoLimpio = normalizedJid.split('@')[0].replace(/\D/g, '');
    const esLid = isLidUser(normalizedJid);

    if (esLid && !this.lidToPhoneMap.has(telefonoLimpio)) {
      await this.sincronizarLids();
    }

    if (this.lidToPhoneMap.has(telefonoLimpio)) {
      const telReal = this.lidToPhoneMap.get(telefonoLimpio)!;
      this.addDebugEvent('LID_RESUELTO', { lid: telefonoLimpio, telefonoReal: telReal });
      console.log(`[Baileys] 🔄 Remitente LID ${telefonoLimpio} reconocido como teléfono real: ${telReal}`);
      telefonoLimpio = telReal;
    }

    // 3. Manejo de mensajes propios (m.key.fromMe)
    if (m.key.fromMe) {
      const myNormalizedJid = this.socket.user?.id ? jidNormalizedUser(this.socket.user.id) : '';
      const myNormalizedLid = this.socket.user?.lid ? jidNormalizedUser(this.socket.user.lid) : '';
      const esChatPropio =
        (myNormalizedJid && areJidsSameUser(normalizedJid, myNormalizedJid)) ||
        (myNormalizedLid && areJidsSameUser(normalizedJid, myNormalizedLid)) ||
        telefonoLimpio === this.socket.user?.id?.split(':')[0]?.replace(/\D/g, '');

      // Si el mensaje fue enviado por el bot/admin a otro usuario en un chat ordinario, no auto-responder
      if (!esChatPropio) {
        return;
      }
      this.addDebugEvent('CHAT_PROPIO_TEST', { telefonoLimpio });
      console.log(`[Baileys] 🧪 Mensaje de prueba recibido en chat propio: ${telefonoLimpio}`);
    }

    this.addDebugEvent('MENSAJE_ENTRANTE', { rawJid, normalizedJid, telefonoLimpio, fromMe: m.key.fromMe });
    console.log(`[Baileys] 📨 Mensaje entrante de: ${rawJid} -> Normalizado: ${normalizedJid} (Teléfono: ${telefonoLimpio})`);

    // 4. BLINDAJE: Verificación estricta de Lista Blanca
    if (!this.estaEnListaBlanca(telefonoLimpio)) {
      this.addDebugEvent('BLOQUEADO_LISTA_BLANCA', { telefonoLimpio, rawJid });
      console.log(`[Baileys] 🛑 Número/LID ${telefonoLimpio} NO está en la lista blanca. Ignorado por blindaje.`);
      return;
    }

    // Verificar si el número está en la lista de exclusión (atención humana / bot silenciado)
    const esExcluido = await BotExclusionsService.esNumeroExcluido(telefonoLimpio);
    if (esExcluido) {
      this.addDebugEvent('IGNORADO_ATENCION_HUMANA', { telefonoLimpio });
      console.log(`[Baileys] 👤 Mensaje de ${telefonoLimpio} ignorado (en lista de atención humana).`);
      return;
    }

    // 5. Desenvolver contenido del mensaje si viene encapsulado (efímeros, view-once, multimedia con caption)
    let messageContent: any = m.message;
    while (
      messageContent?.ephemeralMessage?.message ||
      messageContent?.viewOnceMessage?.message ||
      messageContent?.viewOnceMessageV2?.message ||
      messageContent?.documentWithCaptionMessage?.message
    ) {
      messageContent =
        messageContent.ephemeralMessage?.message ||
        messageContent.viewOnceMessage?.message ||
        messageContent.viewOnceMessageV2?.message ||
        messageContent.documentWithCaptionMessage?.message;
    }

    // Extraer texto y adjuntos del mensaje (incluyendo clics de botones interactivos)
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

    if (!texto && !directBuffer) {
      console.log(`[Baileys] Mensaje sin texto ni imagen descargable recibido de ${telefonoLimpio}. Ignorando.`);
      return;
    }

    console.log(`[Baileys] 💬 Procesando texto de ${telefonoLimpio}: "${texto}"`);

    // 6. BLINDAJE ANTI-DETECCIÓN (<5% RIESGO):
    // Esperar entre 1.5 y 2.5 segundos antes de marcar como leído para simular lectura humana
    await this.delay(1500 + Math.random() * 1000);
    try {
      await this.socket.readMessages([m.key as any]);
    } catch (e) {
      // Ignorar fallo de marcado de lectura
    }

    // 7. Obtener complejo/spa
    const complejos = await BookingService.getComplejos();
    const complejo: Complejo = complejos[0];
    const nombrePush = m.pushName || undefined;

    // Normalizar a formato Colombia internacional estándar (573XXXXXXXXX) para consultas en BD
    const telefonoNormalizado = telefonoLimpio.startsWith('57')
      ? telefonoLimpio
      : telefonoLimpio.length === 10
      ? `57${telefonoLimpio}`
      : telefonoLimpio;

    // Si envió imagen de comprobante, enviar de inmediato mensaje de espera
    if (directBuffer) {
      const nombreDest = nombrePush ? ` ${nombrePush}` : '';
      const msgEspera =
        `🌸 *¡Hola${nombreDest}!* Recibimos tu comprobante de pago 💕.\n\n` +
        `⏳ Estamos confirmando tu transferencia, por favor espera un momento mientras validamos los datos... 🔍✨`;

      await this.enviarConTipeoHumano(normalizedJid, msgEspera);
    }

    // 8. Procesar con el cerebro de WhatsAppFlow (IA Gemini + Supabase)
    const respuestaBot = await WhatsAppFlow.procesarMensaje(
      telefonoNormalizado,
      texto,
      nombrePush,
      complejo,
      undefined,
      mediaType,
      directBuffer
    );

    // 9. Enviar respuesta adaptada para Baileys con presencia de tipeo humano
    await this.enviarConTipeoHumano(normalizedJid, respuestaBot);
  }

  /**
   * Envía un mensaje simulando comportamiento humano (escribiendo...) y adaptando menús interactivos
   */
  private static async enviarConTipeoHumano(remoteJid: string, response: string | BotResponse): Promise<void> {
    if (!this.socket) return;

    const targetJid = jidNormalizedUser(remoteJid);
    const textoFinal = this.formatearTextoParaBaileys(response);
    if (!textoFinal.trim()) {
      console.warn(`[Baileys] Texto final vacío para ${targetJid}, no se envía mensaje.`);
      return;
    }

    // 1. Simular presencia de "escribiendo..." (composing)
    try {
      await this.socket.sendPresenceUpdate('composing', targetJid);
    } catch (e) {
      // Ignorar si falla presencia
    }

    // 2. Retardo natural proporcional a la longitud del texto (1.5s a 3.5s)
    const msTipeo = Math.min(1800 + textoFinal.length * 10, 3800) + Math.random() * 500;
    await this.delay(msTipeo);

    // 3. Pausar presencia
    try {
      await this.socket.sendPresenceUpdate('paused', targetJid);
    } catch (e) {}

    // 4. Envío garantizado del mensaje en formato texto estándar y seguro
    try {
      const sent = await this.socket.sendMessage(targetJid, { text: textoFinal });
      if (sent?.key?.id && sent?.message) {
        this.mensajeStore.set(sent.key.id, sent.message);
      }
      this.addDebugEvent('RESPUESTA_TEXTO_ENVIADA', { destinatario: targetJid, preview: textoFinal.slice(0, 60) });
      console.log(`[Baileys] ✅ Mensaje respondido exitosamente a ${targetJid}`);
    } catch (sendErr) {
      console.error('[Baileys] ❌ Error enviando mensaje a:', targetJid, sendErr);
      this.addDebugEvent('ERROR_ENVIO', { destinatario: targetJid, error: String(sendErr) });

      // Fallback: si falló el envío a un @lid, intentar enviar directamente al número telefónico normalizado @s.whatsapp.net
      if (isLidUser(targetJid)) {
        const lidOnly = targetJid.split('@')[0].replace(/\D/g, '');
        const telReal = this.lidToPhoneMap.get(lidOnly);
        if (telReal) {
          const fallbackJid = `${telReal}@s.whatsapp.net`;
          try {
            console.log(`[Baileys] 🔄 Reintentando envío a través de JID telefónico: ${fallbackJid}`);
            const sentFallback = await this.socket.sendMessage(fallbackJid, { text: textoFinal });
            if (sentFallback?.key?.id && sentFallback?.message) {
              this.mensajeStore.set(sentFallback.key.id, sentFallback.message);
            }
            this.addDebugEvent('RESPUESTA_FALLBACK_ENVIADA', { destinatario: fallbackJid });
            console.log(`[Baileys] ✅ Mensaje respondido exitosamente por fallback telefónico a ${fallbackJid}`);
          } catch (fallbackErr) {
            console.error('[Baileys] ❌ Fallback telefónico también falló:', fallbackErr);
          }
        }
      }
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
        if (url && !texto.includes(url)) {
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

    // Si tiene botones, estructurarlos como opciones numeradas para compatibilidad universal en cualquier teléfono
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
