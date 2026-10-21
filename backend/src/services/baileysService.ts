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
  private static isStarting = false;
  private static reconectarTimeout: NodeJS.Timeout | null = null;
  private static flushInterval: NodeJS.Timeout | null = null;

  // Mapeo oficial verificado directamente por los servidores de WhatsApp (onWhatsApp)
  public static lidToPhoneMap: Map<string, string> = new Map([
    // Contacto 3134862536 (Verificado por WhatsApp server: 272627444801659)
    ['272627444801659', '573134862536'],

    // Contacto 3108108166 (Verificado por WhatsApp server: 207953860776112)
    ['207953860776112', '573108108166'],

    // Contacto 3217176154 (Verificado por WhatsApp server: 163436390572209)
    ['163436390572209', '573217176154'],

    // Contacto 3022779797 (Verificado por WhatsApp server: 263677336907937)
    ['263677336907937', '573022779797'],

    // Bot Mímate Nails Spa (Teléfono propio 3223739845: 89296748961918)
    ['89296748961918', '573223739845'],
  ]);

  private static ultimoSyncLids = 0;

  /**
   * Sincroniza dinámicamente los LIDs de WhatsApp para los números autorizados en la lista blanca
   */
  public static async sincronizarLids(forzar: boolean = false): Promise<void> {
    try {
      if (!this.socket) return;
      const ahora = Date.now();
      if (!forzar && ahora - this.ultimoSyncLids < 20000) {
        return; // Evitar saturación de consultas hacia WhatsApp
      }
      this.ultimoSyncLids = ahora;
      const wl = this.getWhitelist();
      // Extraer números celulares reales de 10 dígitos (Colombia: 3XXXXXXXXX o 573XXXXXXXXX)
      const phones = wl
        .map((n) => n.replace(/\D/g, ''))
        .filter((n) => {
          const ten = n.length >= 10 ? n.slice(-10) : '';
          return ten.startsWith('3') && ten.length === 10;
        })
        .map((n) => `57${n.slice(-10)}`);

      const uniquePhones = Array.from(new Set(phones));

      if (uniquePhones.length > 0) {
        // Enviar a WhatsApp SIN el signo '+'
        const results = await this.socket.onWhatsApp(...uniquePhones);
        if (results && Array.isArray(results)) {
          this.addDebugEvent('SYNC_LIDS_SUCCESS', { count: results.length, items: results });
          for (const r of (results as any[])) {
            if (r.lid && r.jid) {
              const lidId = String(r.lid).split('@')[0].replace(/\D/g, '');
              const phoneId = String(r.jid).split('@')[0].replace(/\D/g, '');
              // Seguridad estricta: Solo registrar el LID si el número telefónico devuelto por WhatsApp pertenece a la lista blanca
              if (this.estaEnListaBlanca(phoneId)) {
                this.lidToPhoneMap.set(lidId, phoneId);
                console.log(`[Baileys] 🔗 LID legítimo verificado con WhatsApp server: ${lidId} -> ${phoneId}`);
              }
            }
          }
        }
      }
    } catch (errSync: any) {
      this.addDebugEvent('SYNC_LIDS_ERROR', { error: errSync?.message || String(errSync) });
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
    const raw = process.env.BAILEYS_WHITELIST_NUMBERS || '';
    if (raw === '*' || raw.toLowerCase() === 'all' || process.env.BAILEYS_ALLOW_ALL === 'true') {
      return [];
    }
    const envNumbers = raw
      .split(',')
      .map((num) => num.replace(/\D/g, '').trim())
      .filter((num) => num.length > 0);

    // Números de prueba autorizados y el propio bot
    const defaultNumbers = [
      '573134862536',
      '3134862536',
      '573022779797',
      '3022779797',
      '573223739845',
      '3223739845',
    ];

    const allowed = new Set<string>(defaultNumbers);
    for (const num of envNumbers) {
      allowed.add(num);
      if (num.startsWith('57') && num.length > 10) {
        allowed.add(num.slice(2));
      } else if (num.length === 10) {
        allowed.add(`57${num}`);
      }
    }
    return Array.from(allowed);
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
    const credsPath = path.join(authDir, 'creds.json');
    if (fs.existsSync(credsPath)) return true;

    try {
      const complejos = await BookingService.getComplejos();
      const tokenData = complejos[0]?.whatsapp_token;
      if (!tokenData || !tokenData.includes('"creds.json"')) return false;

      const bundle = JSON.parse(tokenData);
      let restaurados = 0;
      for (const [nombreArchivo, contenido] of Object.entries(bundle)) {
        const strContenido = contenido as string;
        // Descartar sesiones unidireccionales corruptas (pendingPreKey) creadas por assertSessions forzado
        if (nombreArchivo.startsWith('session-') && strContenido.includes('"pendingPreKey"')) {
          continue;
        }
        fs.writeFileSync(path.join(authDir, nombreArchivo), strContenido, 'utf-8');
        restaurados++;
      }
      console.log(`💾 Sesión de Baileys restaurada exitosamente desde Supabase (${restaurados} archivos).`);
      return true;
    } catch (err) {
      console.error('Error restaurando sesión de Baileys desde Supabase:', err);
      return false;
    }
  }

  /**
   * Respalda automáticamente los archivos de sesión en Supabase de forma 100% asíncrona para no bloquear el Event Loop
   */
  private static debounceGuardado: NodeJS.Timeout | null = null;
  private static respaldarSesionEnSupabase(authDir: string, inmediato: boolean = false): void {
    if (this.debounceGuardado) clearTimeout(this.debounceGuardado);

    const ejecutarRespaldo = async () => {
      try {
        const credsPath = path.join(authDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        const files = await fs.promises.readdir(authDir);
        const bundle: Record<string, string> = {};
        for (const f of files) {
          const filePath = path.join(authDir, f);
          try {
            const stat = await fs.promises.stat(filePath);
            if (stat.isFile()) {
              bundle[f] = await fs.promises.readFile(filePath, 'utf-8');
            }
          } catch {}
        }

        const serialized = JSON.stringify(bundle);
        const complejos = await BookingService.getComplejos();
        const complejoId = complejos[0]?.id;
        if (complejoId) {
          await supabase
            .from('complejos')
            .update({ whatsapp_token: serialized })
            .eq('id', complejoId);
          console.log(`💾 Sesión de WhatsApp respaldada permanentemente en Supabase (${Object.keys(bundle).length} archivos).`);
        }
      } catch (err) {
        console.error('Error respaldando sesión en Supabase:', err);
      }
    };

    if (inmediato) {
      ejecutarRespaldo();
    } else {
      this.debounceGuardado = setTimeout(ejecutarRespaldo, 4500);
    }
  }

  /**
   * Inicializa la conexión de Baileys con blindaje anti-baneo
   */
  static async iniciar(): Promise<void> {
    if (this.isStarting) {
      console.log('[Baileys] ⏳ Ya hay una inicialización en curso. Omitiendo llamada duplicada.');
      return;
    }
    this.isStarting = true;

    if (this.reconectarTimeout) {
      clearTimeout(this.reconectarTimeout);
      this.reconectarTimeout = null;
    }

    // Si ya existía un socket previo, desconectarlo y desvincular listeners para evitar colisiones
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.end(undefined);
      } catch (e) {}
      this.socket = null;
    }

    try {
      const authDir = path.join(process.cwd(), 'baileys_auth_info');
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      // 1. Restaurar sesión previa de Supabase si estamos en un contenedor nuevo (como Render)
      await this.restaurarSesionDesdeSupabase(authDir);

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      // Asegurar que cada nueva sesión Signal (session-*.json) o PreKey (pre-key-*.json) se respalde en Supabase
      const originalKeysSet = state.keys.set.bind(state.keys);
      state.keys.set = async (data) => {
        await originalKeysSet(data);
        this.respaldarSesionEnSupabase(authDir);
      };

      const { version } = await fetchLatestBaileysVersion();

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

      // Bloquear solicitudes PeerDataOperation (PLACEHOLDER_MESSAGE_RESEND) hacia el celular
      // que causaban las notificaciones en ráfaga de "Sincronizando con WhatsApp en Windows"
      const noopPlaceholderCache = {
        get: <T>(_key: string): T | undefined => true as unknown as T,
        set: (): void => {},
        del: (): void => {},
        flushAll: (): void => {},
      };

      // Blindaje de conexión: Browser Fingerprint oficial y keep-alive continuo anti-zombie
      this.socket = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'warn' }),
        browser: Browsers.windows('Desktop'),
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        placeholderResendCache: noopPlaceholderCache,
        shouldIgnoreJid: (jid) =>
          !jid ? false : Boolean(isJidBroadcast(jid) || isJidGroup(jid) || jid.endsWith('@newsletter') || jid.includes('@broadcast')),
        generateHighQualityLinkPreview: true,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        retryRequestDelayMs: 150,
        getMessage: async (key) => {
          if (key?.id && this.mensajeStore.has(key.id)) {
            const msg = this.mensajeStore.get(key.id);
            this.addDebugEvent('REINTENTO_GETMESSAGE', { id: key.id });
            return msg;
          }
          return undefined;
        },
      });

      // Garantizar que ningún evento entrante quede retenido en el buffer interno de Baileys
      if (this.flushInterval) clearInterval(this.flushInterval);
      this.flushInterval = setInterval(() => {
        try {
          if (this.socket?.ev?.isBuffering()) {
            this.socket.ev.flush();
          }
        } catch (e) {}
      }, 300);

      // Procesar todos los eventos de forma ordenada a través del buffer nativo de Baileys
      this.socket.ev.process(async (events) => {
        // 1. Guardado de credenciales independiente y no bloqueante
        if (events['creds.update']) {
          try {
            await saveCreds();
            this.respaldarSesionEnSupabase(authDir);
          } catch (e) {
            console.error('Error guardando credenciales:', e);
          }
        }

        // 2. Control de estado de conexión
        if (events['connection.update']) {
          const update = events['connection.update'];
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

            this.addDebugEvent('CONEXION_CERRADA', { statusCode, debeReconectar });
            console.log(`⚠️ Conexión de Baileys cerrada (Código: ${statusCode}). Reconectando: ${debeReconectar}`);

            if (this.reconectarTimeout) {
              clearTimeout(this.reconectarTimeout);
              this.reconectarTimeout = null;
            }

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
              this.reconectarTimeout = setTimeout(() => this.iniciar(), 6000);
            } else if (debeReconectar) {
              // Retardo controlado para evitar spam o tormentas de reconexión
              this.reconectarTimeout = setTimeout(() => this.iniciar(), 6000);
            }
          } else if (connection === 'open') {
            this.statusConexion = 'CONECTADO';
            this.qrCode = null;
            this.addDebugEvent('CONEXION_ABIERTA', { usuario: this.socket?.user?.id });
            console.log('\n✅ ¡BAILEYS CONECTADO EXITOSAMENTE A WHATSAPP!');
            console.log(`📱 Usuario conectado: ${this.socket?.user?.id || 'Sesión Activa'}\n`);
            this.respaldarSesionEnSupabase(authDir);
            setTimeout(() => this.sincronizarLids(), 3000);
          }
        }

      // 3. Procesar mensajes entrantes con máxima prioridad e inmediatez
      if (events['messages.upsert']) {
        const { messages, type } = events['messages.upsert'];
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
      }
    });
  } finally {
    this.isStarting = false;
  }
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
      stubType: m.messageStubType,
      stubParams: m.messageStubParameters,
    });

    if (!m.message || !m.key) {
      // Si es un eco antiguo emitido por una instancia previa de Baileys (3EB0...), acusar recibo para limpiarlo de la cola
      if (m.messageStubType === 2 && m.key?.fromMe && m.key?.id?.startsWith('3EB0') && rawJid) {
        this.socket.sendReceipt(rawJid, undefined, [m.key.id], 'sender' as any).catch(() => {});
      }
      return;
    }

    // Guardar copia del mensaje en almacén para reintentos de cifrado
    if (m.key.id && m.message) {
      this.mensajeStore.set(m.key.id, m.message);
    }

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

    // Si viene de un LID pero trae participant con número telefónico, verificar primero lista blanca
    const participantJid = m.key?.participant ? jidNormalizedUser(m.key.participant) : '';
    if (isLidUser(normalizedJid) && participantJid && !isLidUser(participantJid)) {
      const lidRaw = normalizedJid.split('@')[0].replace(/\D/g, '');
      const telReal = participantJid.split('@')[0].replace(/\D/g, '');
      if (telReal.length >= 10 && this.estaEnListaBlanca(telReal)) {
        this.lidToPhoneMap.set(lidRaw, telReal);
        console.log(`[Baileys] 🔗 LID ${lidRaw} mapeado legítimamente para número autorizado: ${telReal}`);
      }
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

    // 5. Desenvolver contenido del mensaje si viene encapsulado (efímeros, view-once, multimedia con caption, deviceSent)
    let messageContent: any = m.message;
    while (
      messageContent?.ephemeralMessage?.message ||
      messageContent?.viewOnceMessage?.message ||
      messageContent?.viewOnceMessageV2?.message ||
      messageContent?.documentWithCaptionMessage?.message ||
      messageContent?.deviceSentMessage?.message
    ) {
      messageContent =
        messageContent.ephemeralMessage?.message ||
        messageContent.viewOnceMessage?.message ||
        messageContent.viewOnceMessageV2?.message ||
        messageContent.documentWithCaptionMessage?.message ||
        messageContent.deviceSentMessage?.message;
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

    // Evitar bucle en chat propio: nunca auto-responder a los propios mensajes emitidos por el bot
    if (
      m.key.fromMe &&
      (texto.includes('BIENVENIDA A JL MÍMATE NAILS') ||
        texto.includes('ABRIR AGENDA:') ||
        texto.includes('Conversación reiniciada con éxito') ||
        texto.includes('Recibimos tu comprobante de pago'))
    ) {
      return;
    }

    console.log(`[Baileys] 💬 Procesando texto de ${telefonoLimpio}: "${texto}"`);

    // 6. BLINDAJE Y PRIVACIDAD:
    // NO marcar mensajes como leídos (readMessages desactivado) para no alterar las insignias de mensajes
    // no leídos ni poner en azul los chats personales o clientes en el WhatsApp del usuario.
    // Se mantiene un retardo natural antes de responder para simular presencia humana.
    await this.delay(1000 + Math.random() * 1000);

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

    // Enviar respuesta al chat de origen (o a número telefónico si es chat propio)
    const jidDestino = m.key.fromMe
      ? `${telefonoNormalizado}@s.whatsapp.net`
      : rawJid;

    this.addDebugEvent('TEXTO_PROCESANDO', { telefonoNormalizado, texto, jidDestino });

    // Si envió imagen de comprobante, enviar de inmediato mensaje de espera
    if (directBuffer) {
      const nombreDest = nombrePush ? ` ${nombrePush}` : '';
      const msgEspera =
        `🌸 *¡Hola${nombreDest}!* Recibimos tu comprobante de pago 💕.\n\n` +
        `⏳ Estamos confirmando tu transferencia, por favor espera un momento mientras validamos los datos... 🔍✨`;

      await this.enviarConTipeoHumano(jidDestino, msgEspera);
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
    await this.enviarConTipeoHumano(jidDestino, respuestaBot);
  }

  /**
   * Envía un mensaje simulando comportamiento humano (escribiendo...) y adaptando menús interactivos
   */
  private static async enviarConTipeoHumano(remoteJid: string, response: string | BotResponse): Promise<void> {
    if (!this.socket) return;

    let targetJid = jidNormalizedUser(remoteJid);
    if (isLidUser(targetJid)) {
      const lidOnly = targetJid.split('@')[0].replace(/\D/g, '');
      const telReal = this.lidToPhoneMap.get(lidOnly);
      if (telReal) {
        targetJid = `${telReal}@s.whatsapp.net`;
      }
    }

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
      if (sent?.key?.id) {
        this.procesadosCache.add(sent.key.id);
        if (sent.message) {
          this.mensajeStore.set(sent.key.id, sent.message);
        }
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
            if (sentFallback?.key?.id) {
              this.procesadosCache.add(sentFallback.key.id);
              if (sentFallback.message) {
                this.mensajeStore.set(sentFallback.key.id, sentFallback.message);
              }
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

  public static getSocketUser(): any {
    return this.socket?.user || null;
  }

  public static async reconectarSuave(): Promise<void> {
    try {
      this.addDebugEvent('RECONEXION_MANUAL', { timestamp: new Date().toISOString() });
      if (this.socket) {
        try {
          (this.socket as any).end(new Error('Manual reconnect'));
        } catch {}
      }
      setTimeout(() => this.iniciar(), 2000);
    } catch (e: any) {
      console.error('[Baileys] Error reconectando:', e?.message);
    }
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
