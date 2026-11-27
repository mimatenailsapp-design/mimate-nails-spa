import express, { Request, Response } from 'express';
import { createHash } from 'crypto';
import cors from 'cors';
// @ts-ignore
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import { WhatsAppFlow, BotResponse } from './bot/whatsappFlow.js';
import { ReminderService } from './services/reminderService.js';
import {
  BookingService,
  getMontoAnticipoFijo,
  requiereAnticipoParaFecha,
  esFechaDiciembre,
  enriquecerCancha,
  getLlaveNumero,
  getTitularLimpio,
  formatearCuentasRecaudoMensaje,
  esDiaCerradoPorDomingo,
  esIdentificadorLid,
  extraerDigitosLid,
  obtenerNombreRealManicurista,
} from './services/bookingService.js';
import { AIReceptionistService } from './services/aiReceptionistService.js';
import { BotExclusionsService } from './services/botExclusionsService.js';
import { BaileysService } from './services/baileysService.js';
import { notificarCambioReservas } from './services/realtimeService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Proxy para entornos detrás de reverse proxies (Render / Cloudflare)
app.set('trust proxy', 1);

// Ocultar cabecera que delata tecnología de servidor
app.disable('x-powered-by');

// Cabeceras de seguridad HTTP robustas (Anti-Clickjacking, Anti-Sniffing, HSTS)
app.use(
  helmet({
    contentSecurityPolicy: false, // Permite assets web y vistas QR sin bloquear scripts
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'sameorigin' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);


// CORS seguro con lista blanca de orígenes autorizados
const ORIGINS_EXACTOS_PERMITIDOS = new Set(
  [
    'https://mimate-nails-spa.vercel.app',
    'https://mimate-nails-api.onrender.com',
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL.trim().replace(/\/+$/, '') : '',
  ].filter(Boolean)
);

function esOrigenPermitido(origin?: string): boolean {
  if (!origin) return true; // Peticiones server-to-server, cron jobs o mismo origen
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (ORIGINS_EXACTOS_PERMITIDOS.has(cleanOrigin)) return true;
  if (/^https:\/\/mimate-nails[a-z0-9-]*\.vercel\.app$/i.test(cleanOrigin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)) return true;
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (esOrigenPermitido(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origen no permitido por política CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Spa-Auth'],
    credentials: true,
  })
);

app.use(compression());

// Límites estrictos de tamaño de payload para mitigar ataques DoS / Memory Exhaustion
app.use(express.json({ limit: '250kb' }));
app.use(express.urlencoded({ extended: true, limit: '250kb' }));

// Función defensiva recursiva contra Prototype Pollution
function sanitizeObject(obj: any, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 10) return;
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key], depth + 1);
    }
  }
}

// Filtro de seguridad defensivo contra Prototype Pollution aplicado tras el parseo del body
app.use((req: Request, _res: Response, next) => {
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    sanitizeObject(req.params);
  }
  next();
});

// ------------------------------------------------------------------------------
// RATE LIMITERS (Protección contra DDoS, Fuerza Bruta y Saturación de Endpoints)
// ------------------------------------------------------------------------------
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 400, // Hasta 400 peticiones por ventana para no afectar navegación legítima
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes desde esta dirección IP. Por favor intenta de nuevo en unos minutos.' },
});

// Limiter específico para reservas (evita bots o spam de citas automatizadas)
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 reservas por cada 15 min por IP es más que suficiente para clientes reales
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Has alcanzado el límite de intentos de agendamiento. Por favor espera unos minutos.' },
});

// Limiter para autocompletar nombre de clienta por número de teléfono
const phoneLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas seguidas. Intenta en unos minutos.' },
});

// Limiter para pruebas y simuladores
const testLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de simulaciones alcanzado. Intenta de nuevo más tarde.' },
});

// Limiter defensivo contra fuerza bruta en autenticación y verificación de PIN
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de verificación de seguridad. Por favor espera 15 minutos.' },
});

// Aplicar limiter general a todas las rutas de la API
app.use('/api/', generalLimiter);

// ------------------------------------------------------------------------------
// HELPERS DE SANITIZACIÓN Y VALIDACIÓN DEFENSIVA (Anti-XSS, Anti-Injection)
// ------------------------------------------------------------------------------
export function sanitizeInput(val: any, maxLength = 255): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/\0/g, '') // Eliminar null bytes
    .replace(/<[^>]*>?/gm, '') // Eliminar etiquetas HTML / script tags
    .trim()
    .slice(0, maxLength);
}

export function esFormatoFechaValido(f: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(f);
}

export function esFormatoHoraValido(h: string): boolean {
  return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(h);
}

export function esUUIDValido(id: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
}

/**
 * Helper para emitir cookies seguras con directivas modernas (HttpOnly, SameSite=Lax, Secure)
 */
export function setSecureCookie(
  res: Response,
  nombre: string,
  valor: string,
  dias = 30
): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(nombre, valor, {
    maxAge: dias * 24 * 60 * 60 * 1000,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: isProd,
  });
}

const STAFF_DEFAULT_PIN_HASH = 'fb03a4b64b8bcb37d2967b46951043048eed9c56629857495bba7d295520f186';
const ADMIN_MASTER_PIN_HASH = '7dc28d72e8f9bfaf28453b71d5a662b5f5baacdc373a6a1796f4acaa57b0138e';
const HASH_ACCESO_LILI = '4923057e68a376e2ea02a68b1ce057b977b2b9e82803184fadcd8ffed0c68c7c';
const HASH_ACCESO_JHOANA = '767db4e02b5bd73fb26a136a01393baa4793692b615a82f7b7828daf731f2c6c';
const HASH_ACCESO_MANUELA = '62be8d3a876bddec3b22097879e54def7e5a3886b078a81fc7eececd43a76d2b';

const HASHES_ADMIN_VALIDOS = new Set([
  ADMIN_MASTER_PIN_HASH,
  HASH_ACCESO_LILI,
  HASH_ACCESO_JHOANA,
  STAFF_DEFAULT_PIN_HASH,
]);

const HASHES_STAFF_VALIDOS = new Set([
  ...HASHES_ADMIN_VALIDOS,
  HASH_ACCESO_MANUELA,
]);

function extraerTokenStaff(req: Request): string {
  const headerToken = req.headers['x-spa-auth'];
  if (typeof headerToken === 'string') return headerToken.trim().toLowerCase();
  if (Array.isArray(headerToken) && typeof headerToken[0] === 'string') {
    return headerToken[0].trim().toLowerCase();
  }
  return '';
}

function esStaffAutenticado(req: Request): boolean {
  const token = extraerTokenStaff(req);
  return Boolean(token && HASHES_STAFF_VALIDOS.has(token));
}

function esAdminAutenticado(req: Request): boolean {
  const token = extraerTokenStaff(req);
  return Boolean(token && HASHES_ADMIN_VALIDOS.has(token));
}

function requireStaffAuth(req: Request, res: Response, next: any) {
  if (!esStaffAutenticado(req)) {
    return res.status(401).json({ error: 'No autorizado. Se requiere sesión activa del equipo.' });
  }
  next();
}

function requireAdminAuth(req: Request, res: Response, next: any) {
  if (!esAdminAutenticado(req)) {
    return res.status(401).json({ error: 'No autorizado. Acceso exclusivo para administración.' });
  }
  next();
}

function sanitizarComplejoPublico(complejo: any) {
  if (!complejo || typeof complejo !== 'object') return complejo;
  const { whatsapp_token: _tok, whatsapp_phone_number_id: _pid, ...seguro } = complejo;
  return seguro;
}

// Caché en memoria de corta duración para proteger Supabase contra picos de tráfico y bots
const CACHE_BOOTSTRAP_TTL_MS = 15 * 1000;
let spaBootstrapCache: { data: any; ts: number } | null = null;
let spaConfigCache: { data: any; ts: number } | null = null;
let ultimoCronRecordatoriosMs = 0;

// Endpoint de verificación segura de PIN por hash (con protección de fuerza bruta via rate limit)
app.post('/api/auth/verify-pin', authLimiter, (req: Request, res: Response) => {
  try {
    const { pinHash } = req.body;
    if (!pinHash || typeof pinHash !== 'string') {
      return res.status(400).json({ valido: false, error: 'Hash no proporcionado o inválido' });
    }
    const esValido = HASHES_STAFF_VALIDOS.has(pinHash.trim().toLowerCase());
    return res.json({ valido: esValido });
  } catch {
    return res.status(500).json({ error: 'Error interno en validación de seguridad.' });
  }
});

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
// 2. WHATSAPP BAILEYS - SERVICIO Y ENDPOINTS
// ==============================================================================

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

// Endpoint de compatibilidad / webhook (Informativo, Baileys no necesita webhooks externos)
app.all('/webhook', (req: Request, res: Response) => {
  res.json({
    status: 'activo',
    proveedor: 'baileys',
    mensaje: 'El bot opera de forma nativa a través de Baileys (WhatsApp Web directo). No requiere webhooks externos de Meta.',
  });
});

// Forzar sincronización dinámica de LIDs de WhatsApp (solo administración)
app.get(['/api/baileys/sync-lids', '/api/debug/sync-lids'], requireAdminAuth, async (req: Request, res: Response) => {
  await BaileysService.sincronizarLids();
  return res.json({
    ok: true,
    lids_mapeados: Array.from(BaileysService.lidToPhoneMap.entries()),
    whitelist: BaileysService.getWhitelist(),
    eventos: BaileysService.eventosDebug.slice(0, 10),
  });
});

// Estado de WhatsApp Baileys (sanitizado: sin variables de entorno, logs ni eventos internos)
app.get(['/api/debug/whatsapp', '/api/baileys/status', '/api/baileys/diagnostico'], (req: Request, res: Response) => {
  const estado = BaileysService.getEstado();
  const referer = String(req.headers.referer || '');
  const esQrMismoOrigen =
    /\/qr(\?|$|#)/.test(referer) &&
    (referer.startsWith('https://mimate-nails-api.onrender.com') ||
      referer.startsWith('http://localhost') ||
      referer.startsWith('http://127.0.0.1'));

  if (esStaffAutenticado(req) || esQrMismoOrigen) {
    return res.json({
      status: estado.status,
      tieneQr: estado.tieneQr,
      qr: estado.qr,
      usuarioConectado: estado.usuarioConectado,
      proveedor: 'baileys',
      baileys: {
        status: estado.status,
        tieneQr: estado.tieneQr,
        qr: estado.qr,
        usuarioConectado: estado.usuarioConectado,
      },
    });
  }

  return res.json({
    status: estado.status,
    tieneQr: estado.tieneQr,
    proveedor: 'baileys',
  });
});

// Prueba de envío directo con Baileys (solo administración)
app.post('/api/debug/test-send', requireAdminAuth, testLimiter, async (req: Request, res: Response) => {
  const { to, text } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Falta parametro "to" (ej. "573219610896")' });
  }

  let cleanTo = String(to).replace(/\D/g, '');
  if (cleanTo.length === 10 && cleanTo.startsWith('3')) {
    cleanTo = `57${cleanTo}`;
  }

  const enviado = await BaileysService.enviarMensajeDirecto(
    cleanTo,
    sanitizeInput(text, 500) || '🌸 Mensaje de prueba desde el bot Baileys de JL Mímate Nails Spa 💕'
  );

  return res.json({
    success: enviado,
    proveedor: 'baileys',
    destinatario: cleanTo,
  });
});

// Simulación directa de mensaje entrante para pruebas (solo administración)
app.post('/api/baileys/simular-entrante', requireAdminAuth, testLimiter, async (req: Request, res: Response) => {
  const { from, text } = req.body;
  const tel = String(from || '573134862536').replace(/\D/g, '');
  const dummyMessage: any = {
    key: {
      remoteJid: `${tel}@s.whatsapp.net`,
      fromMe: false,
      id: `SIM_${Date.now()}`,
    },
    message: {
      conversation: text || 'hola',
    },
    pushName: 'Cliente Simulado',
  };
  await BaileysService.procesarMensajeEntrante(dummyMessage);
  return res.json({
    ok: true,
    simulado: { from: tel, text: text || 'hola' },
  });
});

// Reconectar WebSocket suavemente manteniendo credenciales (solo administración)
app.all(['/api/baileys/reconnect', '/api/debug/reconnect'], requireAdminAuth, async (req: Request, res: Response) => {
  await BaileysService.reconectarSuave();
  return res.json({ ok: true, mensaje: 'Reconexión suave de WhatsApp solicitada exitosamente' });
});

// Desvincular sesión y forzar generación de nuevo QR (solo administración)
app.all('/api/baileys/relink', requireAdminAuth, async (req: Request, res: Response) => {
  await BaileysService.desvincularYReiniciar();
  if (req.method === 'POST' || extraerTokenStaff(req)) {
    return res.json({ ok: true, mensaje: 'Sesión desvinculada. Generando nuevo QR.' });
  }
  return res.redirect('/qr');
});

// Interfaz web visual para escanear el código QR fácilmente desde el celular
app.get(['/qr', '/api/baileys/qr'], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vincular WhatsApp - JL Mímate Nails Spa</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff5f8; color: #2d2529; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 24px; padding: 32px; max-width: 440px; width: 100%; box-shadow: 0 10px 30px rgba(219, 39, 119, 0.08); text-align: center; border: 1px solid #fce7f3; }
    .logo { font-size: 38px; margin-bottom: 8px; }
    h1 { color: #db2777; font-size: 22px; font-weight: 800; margin-bottom: 6px; }
    p.sub { font-size: 14px; color: #7d6870; margin-bottom: 24px; }
    #qr-container { display: flex; justify-content: center; align-items: center; min-height: 260px; padding: 16px; background: #fafafa; border-radius: 16px; border: 2px dashed #fbcfe8; margin-bottom: 20px; position: relative; }
    #qrcode img { margin: 0 auto; border-radius: 8px; }
    .status-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 16px; }
    .status-esperando { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .status-conectado { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
    .status-conectando { background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc; }
    .instructions { text-align: left; background: #fff1f2; border-radius: 14px; padding: 14px 16px; font-size: 13px; color: #9f1239; line-height: 1.5; }
    .instructions ol { margin-left: 20px; }
    .instructions li { margin-bottom: 4px; }
    .footer { margin-top: 18px; font-size: 12px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">💅</div>
    <h1>JL Mímate Nails Spa</h1>
    <p class="sub">Vinculación de WhatsApp (Baileys)</p>

    <div id="status-container">
      <div class="status-badge status-conectando" id="status-badge">🔄 Consultando estado...</div>
    </div>

    <div id="qr-container">
      <div id="qrcode"></div>
      <div id="msg-placeholder" style="color: #9ca3af; font-size: 14px;">Cargando código QR...</div>
    </div>

    <div class="instructions" id="instructions">
      <strong>📱 Cómo vincular:</strong>
      <ol>
        <li>Abre WhatsApp en tu teléfono</li>
        <li>Toca <strong>Ajustes</strong> o <strong>Menú (⋮)</strong></li>
        <li>Selecciona <strong>Dispositivos vinculados</strong></li>
        <li>Toca <strong>Vincular un dispositivo</strong> y escanea el código</li>
      </ol>
    </div>

    <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
      <a href="/api/baileys/relink" onclick="return confirm('¿Deseas desvincular la sesión actual y generar un nuevo código QR?');" style="display: inline-block; padding: 10px 18px; background: #e11d48; color: white; border-radius: 999px; text-decoration: none; font-size: 13px; font-weight: 700; box-shadow: 0 4px 12px rgba(225, 29, 72, 0.25);">🔄 Desvincular y Escanear Nuevo QR</a>
      <a href="/qr/image" target="_blank" style="display: inline-block; padding: 10px 18px; background: #be185d; color: white; border-radius: 999px; text-decoration: none; font-size: 13px; font-weight: 700;">🖼️ Ver Imagen Directa</a>
    </div>

    <p class="footer">Se actualiza automáticamente cada 3 segundos</p>
  </div>

  <script>
    let ultimoQr = '';
    let qrInstancia = null;

    async function actualizarEstado() {
      try {
        const res = await fetch('/api/baileys/status');
        const data = await res.json();
        const badge = document.getElementById('status-badge');
        const placeholder = document.getElementById('msg-placeholder');
        const qrDiv = document.getElementById('qrcode');
        const instructions = document.getElementById('instructions');

        const status = data.status || data.baileys?.status || 'INICIANDO';
        const qr = data.qr || data.baileys?.qr || '';
        const usuario = data.usuarioConectado || data.baileys?.usuarioConectado;

        if (status === 'CONECTADO') {
          badge.className = 'status-badge status-conectado';
          badge.innerHTML = '✅ WhatsApp Conectado';
          placeholder.style.display = 'block';
          placeholder.innerHTML = '🎉 ¡El bot está 100% activo y respondiendo chats!<br><br><strong>Usuario:</strong> ' + (usuario || 'Sesión Activa');
          qrDiv.style.display = 'none';
          instructions.style.display = 'none';
        } else if (qr && qr.length > 5) {
          badge.className = 'status-badge status-esperando';
          badge.innerHTML = '⏳ Esperando que escanees el QR';
          placeholder.style.display = 'none';
          qrDiv.style.display = 'block';
          instructions.style.display = 'block';

          if (ultimoQr !== qr) {
            ultimoQr = qr;
            qrDiv.innerHTML = '';
            try {
              if (typeof QRCode !== 'undefined') {
                qrInstancia = new QRCode(qrDiv, {
                  text: qr,
                  width: 230,
                  height: 230,
                  colorDark: '#000000',
                  colorLight: '#ffffff',
                  correctLevel: QRCode.CorrectLevel.M
                });
              } else {
                throw new Error('QRCode lib no disponible');
              }
            } catch (err) {
              console.warn('Fallback a imagen QR externa:', err);
              qrDiv.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=230x230&data=' + encodeURIComponent(qr) + '" style="border-radius: 8px; display: block; margin: 0 auto; max-width: 100%;" alt="Código QR WhatsApp" />';
            }
          }
        } else {
          badge.className = 'status-badge status-conectando';
          badge.innerHTML = '🔄 ' + status;
          placeholder.style.display = 'block';
          placeholder.textContent = 'Generando nuevo código QR...';
          qrDiv.style.display = 'none';
        }
      } catch (e) {
        console.error('Error consultando estado:', e);
      }
    }

    actualizarEstado();
    setInterval(actualizarEstado, 3000);
  </script>
</body>
</html>`);
});

app.get(['/qr/image', '/api/baileys/qr.png'], (req: Request, res: Response) => {
  const estado = BaileysService.getEstado();
  if (!estado.qr) {
    return res.status(404).send('No hay código QR disponible en este momento. Estado actual: ' + estado.status);
  }
  return res.redirect('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(estado.qr));
});

/**
 * Función central de despacho de mensajes de WhatsApp
 * Utiliza Baileys exclusivamente simulando tipeo humano y respetando lista blanca.
 */
const mensajesDirectosEnviados = new Map<string, number>();
const reintentosEnvioEnCurso = new Set<string>();
const DEDUP_ENVIO_TTL_MS = 30 * 60 * 1000;

function obtenerClaveDeduplicacionEnvio(cleanTo: string, message: string | BotResponse): string {
  const texto = typeof message === 'string' ? message : JSON.stringify(message);
  const hash = createHash('sha256').update(texto).digest('hex').slice(0, 16);
  return `${cleanTo}|${hash}`;
}

async function enviarMensajeWhatsApp(
  to: string,
  message: string | BotResponse,
  _customToken?: string,
  _customPhoneId?: string,
  _intento: number = 0
): Promise<boolean> {
  let cleanTo = String(to).replace(/\D/g, '');
  if (cleanTo.length === 10 && cleanTo.startsWith('3')) {
    cleanTo = `57${cleanTo}`;
  }

  const claveDedup = obtenerClaveDeduplicacionEnvio(cleanTo, message);
  const ahora = Date.now();

  // Limpiar entradas expiradas periódicamente
  if (mensajesDirectosEnviados.size > 500) {
    for (const [k, ts] of mensajesDirectosEnviados.entries()) {
      if (ahora - ts > DEDUP_ENVIO_TTL_MS) mensajesDirectosEnviados.delete(k);
    }
  }

  // Garantizar que nunca se envíe el mismo mensaje repetido al mismo número dentro de la ventana de deduplicación
  const enviadoPrevioTs = mensajesDirectosEnviados.get(claveDedup);
  if (enviadoPrevioTs && ahora - enviadoPrevioTs < DEDUP_ENVIO_TTL_MS) {
    reintentosEnvioEnCurso.delete(claveDedup);
    console.log(`⏭️ [WHATSAPP] Mensaje idéntico ya entregado recientemente a ${cleanTo}, se omite duplicado.`);
    return true;
  }

  // Si ya hay una cadena de reintentos programada para este mismo mensaje, no duplicar envíos paralelos
  if (_intento === 0 && reintentosEnvioEnCurso.has(claveDedup)) {
    console.log(`⏭️ [WHATSAPP] Reintento ya programado para este mensaje a ${cleanTo}, se omite duplicado.`);
    return false;
  }

  const enviado = await BaileysService.enviarMensajeDirecto(cleanTo, message);
  if (enviado) {
    mensajesDirectosEnviados.set(claveDedup, Date.now());
    reintentosEnvioEnCurso.delete(claveDedup);
    console.log(`✅ [WHATSAPP BAILEYS ENVIADO a ${cleanTo}]`);
    addDebugLog('SEND_SUCCESS', { to: cleanTo, provider: 'baileys' });
  } else {
    console.warn(`⚠️ [WHATSAPP BAILEYS NO ENVIADO a ${cleanTo}]: No conectado, sin WhatsApp o número en lista de exclusión`);
    addDebugLog('SEND_ERROR', { to: cleanTo, provider: 'baileys', motivo: 'No conectado, sin WhatsApp o silenciado por exclusión' });

    const falloPermanente =
      BaileysService.esFalloPermanenteEnvio(cleanTo) ||
      (await BotExclusionsService.esNumeroExcluido(cleanTo));

    // Reintentos automáticos solo para fallos temporales (reconexión), garantizando envío único
    if (_intento < 3 && !falloPermanente && !mensajesDirectosEnviados.has(claveDedup)) {
      const esperas = [60_000, 180_000, 480_000];
      const espera = esperas[_intento];
      reintentosEnvioEnCurso.add(claveDedup);
      console.log(`🔁 [WHATSAPP] Reintento ${_intento + 1}/3 para ${cleanTo} en ${espera / 60000} min`);
      setTimeout(() => {
        enviarMensajeWhatsApp(to, message, _customToken, _customPhoneId, _intento + 1).catch(() => {
          reintentosEnvioEnCurso.delete(claveDedup);
        });
      }, espera);
    } else {
      reintentosEnvioEnCurso.delete(claveDedup);
    }
  }
  return enviado;
}

// ==============================================================================
// 2.1 LISTA DE EXCLUSIÓN DE WHATSAPP (BOT SILENCIADO - ATENCIÓN HUMANA MANUAL)
// ==============================================================================
app.get('/api/bot/exclusiones', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const exclusiones = await BotExclusionsService.getExclusiones();
    res.json({ success: true, exclusiones });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/bot/exclusiones', requireAdminAuth, async (req: Request, res: Response) => {
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

app.delete('/api/bot/exclusiones/:telefono', requireAdminAuth, async (req: Request, res: Response) => {
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
app.post('/api/bot/simulate', requireAdminAuth, testLimiter, async (req: Request, res: Response) => {
  try {
    const rawTelefono = String(req.body.telefono || '573009999999').replace(/\D/g, '').slice(0, 15);
    const telefono = rawTelefono || '573009999999';
    const mensaje = sanitizeInput(req.body.mensaje || 'HOLA', 500);
    const nombre = sanitizeInput(req.body.nombre || 'Clienta', 80);
    const complejo_id = req.body.complejo_id;
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
      pausarBot: typeof respuesta === 'object' ? respuesta.pausarBot : undefined,
      esDerivacionAsesor: typeof respuesta === 'object' ? respuesta.esDerivacionAsesor : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==============================================================================
// 4. GESTIÓN MULTI-TENANT DE EMPRESAS (COMPLEJOS)
// ==============================================================================

// Listar todos los complejos deportivos (sin exponer tokens privados)
app.get('/api/complejos', async (req: Request, res: Response) => {
  try {
    const complejos = await BookingService.getComplejos();
    res.json((complejos || []).map(sanitizarComplejoPublico));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar un nuevo complejo deportivo en la plataforma (solo administración)
app.post('/api/complejos', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const nuevoComplejo = await BookingService.crearComplejo(req.body);
    res.status(201).json(sanitizarComplejoPublico(nuevoComplejo));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar configuración de un complejo (solo administración, respuesta sanitizada)
app.patch('/api/complejos/:id', requireAdminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) {
    return res.status(400).json({ error: 'ID de complejo inválido' });
  }
  try {
    const { data, error } = await supabase
      .from('complejos')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    spaBootstrapCache = null;
    spaConfigCache = null;
    res.json(sanitizarComplejoPublico(data));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Consultar configuración actual de anticipos, cuentas y horario del spa (con caché 15s)
app.get('/api/spa/config', async (req: Request, res: Response) => {
  try {
    if (spaConfigCache && Date.now() - spaConfigCache.ts < CACHE_BOOTSTRAP_TTL_MS) {
      return res.json(spaConfigCache.data);
    }

    const { data: complejo, error } = await supabase
      .from('complejos')
      .select('*')
      .eq('slug', 'mimate-nails')
      .maybeSingle();

    if (error) throw error;
    if (!complejo) return res.status(404).json({ error: 'Spa no encontrado' });

    const porcentajeMin = Number(complejo.porcentaje_anticipo_minimo) || 0;
    const exigeAnticipo = porcentajeMin > 0;
    const montoFijo = getMontoAnticipoFijo(complejo);

    const payload = {
      exigeAnticipo,
      montoAnticipoFijo: montoFijo,
      porcentajeAnticipo: montoFijo, // Compatibilidad
      nequiNumero: complejo.nequi_numero || '321 961 0896',
      bancolombiaNumero: complejo.daviplata_numero || 'Ahorros 245-000123-88',
      llaveNumero: getLlaveNumero(complejo) || '',
      titularCuenta: getTitularLimpio(complejo.titular_cuenta),
      horaApertura: complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '08:00',
      horaCierre: complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '19:00',
    };

    spaConfigCache = { data: payload, ts: Date.now() };
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar configuración de anticipos, cuentas y horario del spa desde el Dashboard (solo administración)
app.patch('/api/spa/config', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const {
      exigeAnticipo,
      montoAnticipoFijo,
      porcentajeAnticipo,
      nequiNumero,
      bancolombiaNumero,
      llaveNumero,
      titularCuenta,
      horaApertura,
      horaCierre,
    } = req.body;

    const montoFijo = Number(montoAnticipoFijo ?? porcentajeAnticipo);
    const montoFijoValido = !isNaN(montoFijo) && montoFijo > 0 ? montoFijo : 20000;

    const updateData: any = {};
    if (exigeAnticipo !== undefined) {
      if (!exigeAnticipo) {
        updateData.porcentaje_anticipo_minimo = 0;
      } else {
        // Marcamos como 1.00 en la base de datos (seguro para NUMERIC(5,2) sin desbordamiento)
        updateData.porcentaje_anticipo_minimo = 1;
      }
    }

    if (nequiNumero !== undefined) updateData.nequi_numero = String(nequiNumero).trim();
    if (bancolombiaNumero !== undefined) updateData.daviplata_numero = String(bancolombiaNumero).trim();
    if (titularCuenta !== undefined) updateData.titular_cuenta = getTitularLimpio(String(titularCuenta).trim());

    // Obtener complejo actual para preservar llave o monto si no vienen
    const { data: compActual } = await supabase.from('complejos').select('*').eq('slug', 'mimate-nails').maybeSingle();
    const llaveVal = llaveNumero !== undefined ? String(llaveNumero).trim() : (getLlaveNumero(compActual) || '');

    // Persistir monto y llave en whatsapp_phone_number_id (VARCHAR(100) que NO es sobreescrito por Baileys)
    updateData.whatsapp_phone_number_id = JSON.stringify({
      monto: montoFijoValido,
      llave: llaveVal,
    });

    if (horaApertura !== undefined) {
      const hAper = String(horaApertura).trim().slice(0, 5);
      if (/^\d{2}:\d{2}$/.test(hAper)) {
        updateData.hora_apertura = `${hAper}:00`;
      }
    }
    if (horaCierre !== undefined) {
      const hCier = String(horaCierre).trim().slice(0, 5);
      if (/^\d{2}:\d{2}$/.test(hCier)) {
        updateData.hora_cierre = `${hCier}:00`;
      }
    }

    const { data, error } = await supabase
      .from('complejos')
      .update(updateData)
      .eq('slug', 'mimate-nails')
      .select()
      .single();

    if (error) throw error;

    // Invalidar caché en memoria tras guardar cambios
    spaBootstrapCache = null;
    spaConfigCache = null;

    const porcResult = Number(data.porcentaje_anticipo_minimo) || 0;
    const finalMontoFijo = getMontoAnticipoFijo(data);

    res.json({
      success: true,
      config: {
        exigeAnticipo: porcResult > 0,
        montoAnticipoFijo: finalMontoFijo,
        porcentajeAnticipo: finalMontoFijo,
        nequiNumero: data.nequi_numero || '321 961 0896',
        bancolombiaNumero: data.daviplata_numero || 'Ahorros 245-000123-88',
        llaveNumero: getLlaveNumero(data) || '',
        titularCuenta: getTitularLimpio(data.titular_cuenta),
        horaApertura: data.hora_apertura ? data.hora_apertura.slice(0, 5) : '08:00',
        horaCierre: data.hora_cierre ? data.hora_cierre.slice(0, 5) : '19:00',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Consultar base de conocimiento / FAQ personalizada de un complejo
app.get('/api/complejos/:id/faq', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) {
    return res.status(400).json({ error: 'ID de complejo inválido' });
  }
  try {
    const complejo = await BookingService.getComplejo(id);
    if (!complejo) return res.status(404).json({ error: 'Complejo no encontrado' });
    const info = AIReceptionistService.getConocimientoComplejo(complejo);
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar base de conocimiento / FAQ personalizada de un complejo (solo administración)
app.post('/api/complejos/:id/faq', requireAdminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) {
    return res.status(400).json({ error: 'ID de complejo inválido' });
  }
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

const REGEX_HORARIO_REAL = /\[HORARIO_REAL:([^|\]]+)\|([^\]]+)\]/i;
const REGEX_HORARIO_REAL_CLEAN = /\s*\|?\s*\[HORARIO_REAL:[^\]]+\]/gi;
const MIN_NO_TRASLAPE_MS = 15 * 60 * 1000;
const ESTADOS_EXCLUSION_DB = new Set(['pendiente_pago', 'pendiente_anticipo', 'confirmada', 'bloqueada']);

function hidratarHorarioRealReserva<T extends { fecha_inicio?: string; fecha_fin?: string; notas?: string | null }>(
  r: T
): T & { db_fecha_inicio?: string; db_fecha_fin?: string } {
  if (!r) return r;
  const base = {
    ...r,
    db_fecha_inicio: r.fecha_inicio,
    db_fecha_fin: r.fecha_fin,
  };
  const match = (r.notas || '').match(REGEX_HORARIO_REAL);
  if (match && match[1] && match[2]) {
    const iniMs = new Date(match[1].trim()).getTime();
    const finMs = new Date(match[2].trim()).getTime();
    if (!isNaN(iniMs) && !isNaN(finMs) && finMs > iniMs) {
      return {
        ...base,
        fecha_inicio: new Date(iniMs).toISOString(),
        fecha_fin: new Date(finMs).toISOString(),
      };
    }
  }
  return base;
}

function validarYCalcularPersistenciaTraslape(params: {
  idReserva: string;
  dInicio: Date;
  dFin: Date;
  notasActuales?: string | null;
  otrasReservas: any[];
}):
  | { valido: true; dbFechaInicio: string; dbFechaFin: string; notasFinal: string; esTraslapeParcial: boolean }
  | { valido: false; error: string } {
  const { idReserva, dInicio, dFin, notasActuales, otrasReservas } = params;
  const slotStart = dInicio.getTime();
  const slotEnd = dFin.getTime();

  const hidratadas = (otrasReservas || [])
    .filter((o) => o && o.id !== idReserva && o.estado !== 'cancelada' && o.fecha_inicio)
    .map(hidratarHorarioRealReserva);

  const solapadas = hidratadas.filter((o) => {
    const oStart = new Date(o.fecha_inicio).getTime();
    const oEnd = o.fecha_fin ? new Date(o.fecha_fin).getTime() : oStart + 45 * 60 * 1000;
    return oStart < slotEnd && oEnd > slotStart;
  });

  if (solapadas.some((o) => o.estado === 'bloqueada')) {
    return { valido: false, error: 'No se puede traslapar con un horario bloqueado.' };
  }

  if (solapadas.length > 1) {
    return {
      valido: false,
      error: 'Solo se permite traslapar parcialmente con una cita a la vez sin afectar otras citas.',
    };
  }

  let esTraslapeParcial = false;
  if (solapadas.length === 1) {
    const otra = solapadas[0];
    const oStart = new Date(otra.fecha_inicio).getTime();
    const oEnd = otra.fecha_fin ? new Date(otra.fecha_fin).getTime() : oStart + 45 * 60 * 1000;

    if (
      slotStart === oStart ||
      slotEnd === oEnd ||
      (slotStart >= oStart && slotEnd <= oEnd) ||
      (oStart >= slotStart && oEnd <= slotEnd)
    ) {
      return {
        valido: false,
        error: 'No se permite traslapar una cita por completo sobre otra.',
      };
    }

    const overlapMs = Math.min(slotEnd, oEnd) - Math.max(slotStart, oStart);
    const restanteMovidaMs = slotEnd - slotStart - overlapMs;
    const restanteOtraMs = oEnd - oStart - overlapMs;

    if (restanteMovidaMs < MIN_NO_TRASLAPE_MS || restanteOtraMs < MIN_NO_TRASLAPE_MS) {
      return {
        valido: false,
        error: 'El traslape parcial debe dejar al menos 15 minutos libres en cada cita.',
      };
    }

    esTraslapeParcial = true;
  }

  // Sub-intervalo de BD libre que respeta la restricción GiST `no_doble_reserva`
  const dbOcupados = hidratadas
    .filter((o) => ESTADOS_EXCLUSION_DB.has(String(o.estado || '')))
    .map((o) => {
      const s = new Date(o.db_fecha_inicio || o.fecha_inicio).getTime();
      const e = new Date(o.db_fecha_fin || o.fecha_fin || s + 45 * 60 * 1000).getTime();
      return { start: s, end: e };
    })
    .filter((iv) => iv.start < slotEnd && iv.end > slotStart)
    .sort((a, b) => a.start - b.start);

  let segmentosLibres: Array<{ start: number; end: number }> = [{ start: slotStart, end: slotEnd }];
  for (const occ of dbOcupados) {
    const siguientes: Array<{ start: number; end: number }> = [];
    for (const seg of segmentosLibres) {
      if (occ.end <= seg.start || occ.start >= seg.end) {
        siguientes.push(seg);
      } else {
        if (occ.start > seg.start) {
          siguientes.push({ start: seg.start, end: occ.start });
        }
        if (occ.end < seg.end) {
          siguientes.push({ start: occ.end, end: seg.end });
        }
      }
    }
    segmentosLibres = siguientes;
  }

  if (segmentosLibres.length === 0) {
    return {
      valido: false,
      error: 'No queda espacio disponible para ubicar este traslape sin afectar otra cita.',
    };
  }

  segmentosLibres.sort((a, b) => b.end - b.start - (a.end - a.start));
  const mejorSegmento = segmentosLibres[0];
  if (mejorSegmento.end <= mejorSegmento.start) {
    return {
      valido: false,
      error: 'El intervalo resultante de traslape es inválido.',
    };
  }

  const notasLimpias = String(notasActuales || '')
    .replace(REGEX_HORARIO_REAL_CLEAN, '')
    .trim();
  const realStartIso = dInicio.toISOString();
  const realEndIso = dFin.toISOString();
  const requiereTagReal = mejorSegmento.start !== slotStart || mejorSegmento.end !== slotEnd;

  const notasFinal = requiereTagReal
    ? `${notasLimpias ? `${notasLimpias} | ` : ''}[HORARIO_REAL:${realStartIso}|${realEndIso}]`
    : notasLimpias;

  return {
    valido: true,
    dbFechaInicio: new Date(mejorSegmento.start).toISOString(),
    dbFechaFin: new Date(mejorSegmento.end).toISOString(),
    notasFinal,
    esTraslapeParcial,
  };
}

// Lista de Reservas para el Calendario (solo personal autorizado, ventana acotada y límite de filas)
app.get('/api/reservas', requireStaffAuth, async (req: Request, res: Response) => {
  const { desde, hasta, complejo_id } = req.query;

  if (complejo_id && !esUUIDValido(String(complejo_id))) {
    return res.status(400).json({ error: 'ID de complejo inválido' });
  }

  let query = supabase
    .from('reservas')
    .select('*, canchas!inner(id, nombre, deporte, complejo_id), clientes(nombre, telefono_wa), pagos_anticipos(*)');

  if (complejo_id) {
    query = query.eq('canchas.complejo_id', complejo_id as string);
  }
  if (desde || hasta) {
    if (desde) query = query.gte('fecha_inicio', String(desde));
    if (hasta) query = query.lte('fecha_fin', String(hasta));
  } else {
    // Ventana por defecto: 60 días atrás hasta 120 días adelante para evitar volcados históricos masivos
    const ahoraMs = Date.now();
    const desdeDef = new Date(ahoraMs - 60 * 24 * 60 * 60 * 1000).toISOString();
    const hastaDef = new Date(ahoraMs + 120 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('fecha_inicio', desdeDef).lte('fecha_inicio', hastaDef);
  }

  query = query.order('fecha_inicio', { ascending: true }).limit(600);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const hidratadas = (data || [])
    .map((r: any) => {
      const hid = hidratarHorarioRealReserva(r);
      return {
        ...hid,
        canchas: hid.canchas ? enriquecerCancha(hid.canchas) : hid.canchas,
      };
    })
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
  res.json(hidratadas);
});

// Bloquear Horarios (1 hora o varias horas, solo personal del spa)
app.post('/api/bloqueos', requireStaffAuth, async (req: Request, res: Response) => {
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
      // Si viene fecha YYYY-MM-DD y lista de horas ['09:00', '10:00', ...]
      const durPaso = Number(duracion_minutos) || 60; // Cada ranura es de 1 hora (60 minutos) por defecto

      // Agrupar horas contiguas en rangos continuos para evitar solapamientos y exclusiones de BD
      const minutos = Array.from(new Set(horas))
        .map((h) => {
          const [hh, mm] = h.split(':').map(Number);
          return (isNaN(hh) ? 0 : hh) * 60 + (isNaN(mm) ? 0 : mm);
        })
        .sort((a, b) => a - b);

      const rangos: { hInicio: string; hFin: string }[] = [];
      if (minutos.length > 0) {
        let actualInicio = minutos[0];
        let actualFin = minutos[0] + durPaso;

        for (let i = 1; i < minutos.length; i++) {
          const m = minutos[i];
          if (m === actualFin) {
            actualFin = m + durPaso;
          } else {
            const hI = `${String(Math.floor(actualInicio / 60)).padStart(2, '0')}:${String(actualInicio % 60).padStart(2, '0')}`;
            const hF = `${String(Math.floor(actualFin / 60)).padStart(2, '0')}:${String(actualFin % 60).padStart(2, '0')}`;
            rangos.push({ hInicio: hI, hFin: hF });
            actualInicio = m;
            actualFin = m + durPaso;
          }
        }
        const hI = `${String(Math.floor(actualInicio / 60)).padStart(2, '0')}:${String(actualInicio % 60).padStart(2, '0')}`;
        const hF = `${String(Math.floor(actualFin / 60)).padStart(2, '0')}:${String(actualFin % 60).padStart(2, '0')}`;
        rangos.push({ hInicio: hI, hFin: hF });
      }

      for (const r of rangos) {
        const dInicio = new Date(`${fecha}T${r.hInicio}:00-05:00`);
        const dFin = new Date(`${fecha}T${r.hFin}:00-05:00`);

        for (const cid of idsCanchas) {
          registrosAInsertar.push({
            cancha_id: cid,
            cliente_id: null,
            fecha_inicio: dInicio.toISOString(),
            fecha_fin: dFin.toISOString(),
            estado: 'bloqueada',
            valor_total: 0,
            valor_anticipo_requerido: 0,
            notas: `🔒 BLOQUEO: ${motivo} | Horario: ${r.hInicio} - ${r.hFin} | Por: ${bloqueado_por}`,
          });
        }
      }
    } else if (fecha && req.body.hora) {
      // Si viene una sola hora
      const h = req.body.hora;
      const durMin = Number(duracion_minutos) || 60; // ranura de 1 hora (60 min) por defecto
      const dInicio = new Date(`${fecha}T${h}:00-05:00`);
      const dFin = new Date(dInicio.getTime() + durMin * 60 * 1000);

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

    const ahoraMs = Date.now();
    const hayHorariosPasados = registrosAInsertar.some(
      (r) => new Date(r.fecha_inicio).getTime() <= ahoraMs
    );
    if (hayHorariosPasados) {
      return res.status(400).json({
        error: 'No es posible bloquear un horario que ya pasó.',
      });
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

// Desbloquear Horario (Eliminar bloqueo específico - solo personal del spa)
app.delete('/api/bloqueos/:id', requireStaffAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de bloqueo inválido' });
  const { error } = await supabase
    .from('reservas')
    .delete()
    .eq('id', id)
    .eq('estado', 'bloqueada');

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, message: 'Horario desbloqueado con éxito' });
});

// Actualizar estado de una reserva (solo personal del spa)
app.patch('/api/reservas/:id/estado', requireStaffAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
  const { estado } = req.body;

  const { data, error } = await supabase
    .from('reservas')
    .update({ estado: sanitizeInput(estado, 30) })
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  notificarCambioReservas('UPDATE', { id });
  res.json(data);
});

// Mover / reprogramar fecha y hora de una cita desde el planificador (solo personal del spa)
app.patch('/api/reservas/:id/horario', requireStaffAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de reserva inválido' });

  const { fecha_inicio, fecha_fin } = req.body || {};
  if (!fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Se requieren fecha_inicio y fecha_fin válidas' });
  }

  try {
    const { data: reservaRaw, error: fetchError } = await supabase
      .from('reservas')
      .select('id, cancha_id, fecha_inicio, fecha_fin, estado, valor_total, valor_anticipo_requerido, notas')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) return res.status(500).json({ error: fetchError.message });
    if (!reservaRaw) return res.status(404).json({ error: 'Reserva no encontrada' });

    const reserva = hidratarHorarioRealReserva(reservaRaw);

    if (reserva.estado === 'completada' || reserva.estado === 'cancelada' || reserva.estado === 'bloqueada') {
      return res.status(400).json({ error: 'No se puede mover una cita completada, cancelada o un bloqueo' });
    }

    const finOriginalMs = reserva.fecha_fin ? new Date(reserva.fecha_fin).getTime() : new Date(reserva.fecha_inicio).getTime();
    if (!isNaN(finOriginalMs) && finOriginalMs <= Date.now()) {
      return res.status(400).json({ error: 'No se pueden mover citas que ya han pasado' });
    }

    const dInicio = new Date(fecha_inicio);
    const dFin = new Date(fecha_fin);
    if (isNaN(dInicio.getTime()) || isNaN(dFin.getTime()) || dFin.getTime() <= dInicio.getTime()) {
      return res.status(400).json({ error: 'Rango de fecha y hora inválido' });
    }

    if (dInicio.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'No se puede mover la cita a un horario que ya pasó' });
    }

    const fechaBogotaIso = dInicio.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    if (esDiaCerradoPorDomingo(fechaBogotaIso)) {
      return res.status(400).json({ error: 'Los domingos regulares el spa está cerrado' });
    }

    const inicioVentana = new Date(dInicio.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const finVentana = new Date(dFin.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: otrasReservas, error: colError } = await supabase
      .from('reservas')
      .select('id, cancha_id, fecha_inicio, fecha_fin, estado, notas')
      .eq('cancha_id', reserva.cancha_id)
      .neq('id', id)
      .neq('estado', 'cancelada')
      .gte('fecha_inicio', inicioVentana)
      .lte('fecha_inicio', finVentana);

    if (colError) return res.status(500).json({ error: colError.message });

    const validacion = validarYCalcularPersistenciaTraslape({
      idReserva: id,
      dInicio,
      dFin,
      notasActuales: reserva.notas,
      otrasReservas: otrasReservas || [],
    });

    if (!validacion.valido) {
      return res.status(409).json({ error: validacion.error });
    }

    const fechaOrigenIso = new Date(reserva.fecha_inicio).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    let nuevoValorTotal = Number(reserva.valor_total || 0);
    let notasActualizadas = validacion.notasFinal || '';

    const cruzaCambioTarifa = esTarifaDesdeDiciembre(fechaOrigenIso) !== esTarifaDesdeDiciembre(fechaBogotaIso);
    const totalPreDic = recalcularValorTotalReservaParaFecha(notasActualizadas, '2026-11-01');
    const totalDestino = recalcularValorTotalReservaParaFecha(notasActualizadas, fechaBogotaIso);

    if (
      totalDestino !== null &&
      (cruzaCambioTarifa || (esTarifaDesdeDiciembre(fechaBogotaIso) && totalPreDic !== null && nuevoValorTotal === totalPreDic))
    ) {
      nuevoValorTotal = totalDestino;
      if (/Excedente en spa:\s*\$[\d.]+/i.test(notasActualizadas)) {
        const abono = Number((reserva as any).valor_anticipo_requerido || 0);
        const nuevoExcedente = Math.max(0, nuevoValorTotal - abono);
        notasActualizadas = notasActualizadas.replace(
          /Excedente en spa:\s*\$[\d.]+/gi,
          `Excedente en spa: ${nuevoExcedente.toLocaleString('es-CO')}`
        );
      }
    }

    const { data, error } = await supabase
      .from('reservas')
      .update({
        fecha_inicio: validacion.dbFechaInicio,
        fecha_fin: validacion.dbFechaFin,
        valor_total: nuevoValorTotal,
        notas: notasActualizadas,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, canchas(*), clientes(*)')
      .single();

    if (error) {
      if (error.code === '23P01') {
        return res.status(409).json({ error: 'Este horario ya está ocupado por otra cita o bloqueo' });
      }
      return res.status(500).json({ error: error.message });
    }

    notificarCambioReservas('UPDATE', { id });
    return res.json({ ok: true, reserva: hidratarHorarioRealReserva(data) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error interno al mover la cita' });
  }
});

// Obtener detalles mínimos de una reserva por ID (para reagendamiento público sin fuga de notas internas)
app.get('/api/reservas/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
  try {
    const { data: reservaRaw, error } = await supabase
      .from('reservas')
      .select('id, cancha_id, fecha_inicio, fecha_fin, estado, notas, valor_total, valor_anticipo_requerido, canchas(id, nombre), clientes(nombre, telefono_wa)')
      .eq('id', id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!reservaRaw) return res.status(404).json({ error: 'Reserva no encontrada' });

    const reserva: any = hidratarHorarioRealReserva(reservaRaw);

    let abonoPrevio = 0;
    try {
      const { data: pagos } = await supabase
        .from('pagos_anticipos')
        .select('monto')
        .eq('reserva_id', id)
        .eq('estado', 'aprobado');
      if (pagos && pagos.length > 0) {
        abonoPrevio = pagos.reduce((acc, p) => acc + Number(p.monto || 0), 0);
      }
    } catch {}

    // Si no hay registro en pagos_anticipos, solo reconocer abono si la reserva estaba confirmada con valor_anticipo_requerido > 0
    if (abonoPrevio === 0 && reserva.estado === 'confirmada' && Number(reserva.valor_anticipo_requerido) > 0) {
      abonoPrevio = Number(reserva.valor_anticipo_requerido);
    }

    const matchSvc = (reserva.notas || '').match(/Servicio:\s*([^|[\n]+)/i);
    const servicioNombre = matchSvc && matchSvc[1] ? matchSvc[1].trim() : undefined;

    const telCrudo = reserva.clientes?.telefono_wa;
    const lidDetectado = extraerDigitosLid(telCrudo);

    res.json({
      id: reserva.id,
      cancha_id: reserva.cancha_id,
      fecha_inicio: reserva.fecha_inicio,
      fecha_fin: reserva.fecha_fin,
      estado: reserva.estado,
      valor_total: reserva.valor_total,
      valor_anticipo_requerido: reserva.valor_anticipo_requerido,
      servicio_nombre: servicioNombre,
      abono_previo: abonoPrevio,
      whatsapp_lid: lidDetectado || undefined,
      canchas: reserva.canchas ? { id: reserva.canchas.id, nombre: obtenerNombreRealManicurista(reserva.canchas) } : null,
      clientes: reserva.clientes
        ? {
            nombre: reserva.clientes.nombre,
            telefono_wa: telCrudo && !esIdentificadorLid(telCrudo) ? telCrudo : '',
          }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar una reserva (Cancelar y remover del sistema - solo personal del spa)
app.delete('/api/reservas/:id', requireStaffAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de reserva inválido' });

  // Primero eliminamos pagos asociados si los hubiese
  await supabase.from('pagos_anticipos').delete().eq('reserva_id', id);

  const { error } = await supabase
    .from('reservas')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  notificarCambioReservas('DELETE', { id });
  res.json({ success: true, message: 'Reserva eliminada con éxito' });
});

// ==============================================================================
// OPCIÓN A: APROBACIÓN ASISTIDA DESDE EL VISOR WEB (CON NOTIFICACIÓN WHATSAPP)
// ==============================================================================

// 1. Aprobar Anticipo manualmente desde el Visor Web (solo administración)
app.patch('/api/reservas/:id/aprobar-anticipo', requireAdminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
  const notas_admin = sanitizeInput(req.body.notas_admin, 255);

  try {
    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('id', id)
      .single();

    if (errRes || !reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const notasPrevias = (reserva.notas || '').trim();
    const notasActualizadas = notasPrevias
      ? `${notasPrevias} | [ANTICIPO_APROBADO_MANUAL: ${notas_admin || 'Aprobado desde Visor Web'}]`
      : (notas_admin || 'Anticipo aprobado manualmente por administrador en Visor Web');

    const { data: reservaActualizada, error: errUpd } = await supabase
      .from('reservas')
      .update({
        estado: 'confirmada',
        expiracion_reserva: null,
        notas: notasActualizadas,
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

    const reservaHidratada = hidratarHorarioRealReserva(reserva);
    const cliente = reserva.clientes as any;
    const cancha = reserva.canchas as any;
    const complejo = cancha?.complejos as any;

    if (cliente?.telefono_wa) {
      const fechaFmt = new Date(reservaHidratada.fecha_inicio).toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Bogota',
      });
      const horaInicio = new Date(reservaHidratada.fecha_inicio).toLocaleTimeString('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Bogota',
      });
      const horaFin = new Date(reservaHidratada.fecha_fin).toLocaleTimeString('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Bogota',
      });

      const saldoPendiente = (Number(reserva.valor_total) - Number(reserva.valor_anticipo_requerido)).toLocaleString('es-CO');
      const nombreEspecialista = obtenerNombreRealManicurista(cancha, 'Especialista');

      const mensajeConfirmacion =
        `🌸✨ *¡ANTICIPO APROBADO CON ÉXITO!* ✨🌸\n\n` +
        `Hola *${cliente.nombre || 'Reina'}*, tu comprobante de pago ha sido verificado y aprobado por la administración de *${complejo?.nombre || 'JL Mímate Nails Spa'}*.\n\n` +
        `💅 Especialista: *${nombreEspecialista}*\n` +
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

    notificarCambioReservas('UPDATE', { id });
    res.json({ success: true, reserva: hidratarHorarioRealReserva(reservaActualizada) });
  } catch (error: any) {
    console.error('Error aprobando anticipo:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Rechazar Comprobante de Anticipo desde el Visor Web (solo administración)
app.patch('/api/reservas/:id/rechazar-anticipo', requireAdminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!esUUIDValido(id)) return res.status(400).json({ error: 'ID de reserva inválido' });
  const motivo = sanitizeInput(req.body.motivo, 255);

  try {
    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
      .eq('id', id)
      .single();

    if (errRes || !reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const notasPrevias = (reserva.notas || '').trim();
    const notasActualizadas = notasPrevias
      ? `${notasPrevias} | [RECHAZADO_ADMIN: ${motivo || 'Comprobante no válido o pago no recibido'}]`
      : `Rechazado por admin: ${motivo || 'Comprobante no válido o pago no recibido'}`;

    const { data: reservaActualizada, error: errUpd } = await supabase
      .from('reservas')
      .update({
        estado: 'cancelada',
        notas: notasActualizadas,
      })
      .eq('id', id)
      .select()
      .single();

    if (errUpd) throw errUpd;

    const cliente = reserva.clientes as any;
    const cancha = reserva.canchas as any;
    const complejo = cancha?.complejos as any;

    if (cliente?.telefono_wa) {
      const nombreEspecialista = obtenerNombreRealManicurista(cancha, 'nuestra especialista');
      const mensajeRechazo =
        `❌ *Comprobante no aprobado:*\n\n` +
        `Hola *${cliente.nombre || 'Reina'}*, la administración de *${complejo?.nombre || 'JL Mímate Nails'}* no pudo validar tu comprobante de pago (${motivo || 'pago no recibido en la cuenta bancaria'}).\n\n` +
        `El turno con *${nombreEspecialista}* ha sido liberado. Si consideras que se trata de un error, por favor comunícate directamente con nosotras. 💕`;

      await enviarMensajeWhatsApp(
        cliente.telefono_wa,
        mensajeRechazo,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id
      );
    }

    notificarCambioReservas('UPDATE', { id });
    res.json({ success: true, reserva: hidratarHorarioRealReserva(reservaActualizada) });
  } catch (error: any) {
    console.error('Error rechazando anticipo:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================================================================
// 4. ENDPOINTS RESERVAS WEB SPA DE UÑAS (JL MÍMATE NAILS) - SIN ANTICIPO
// ==============================================================================

const FECHA_CAMBIO_TARIFAS = '2026-12-01';

function esTarifaDesdeDiciembre(fechaIso?: string | null): boolean {
  const ref = fechaIso
    ? fechaIso.trim().slice(0, 10)
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return ref >= FECHA_CAMBIO_TARIFAS;
}

const SERVICIOS_MIMATE_NAILS = [
  // --- TRADICIONAL ---
  {
    id: 1,
    nombre: 'Pies hombre',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 14000,
    precioDiciembre: 17000,
    descripcion: 'Cuidado completo para pies masculinos, limpieza profunda, recorte, limado y exfoliación.'
  },
  {
    id: 2,
    nombre: 'Manos hombre',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 14000,
    precioDiciembre: 15000,
    descripcion: 'Cuidado para manos masculinas, limpieza de cutícula, limado, exfoliación e hidratación.'
  },
  {
    id: 3,
    nombre: 'Manos y pies',
    categoria: 'Tradicional',
    duracion: 120,
    precio: 35000,
    precioDiciembre: 40000,
    descripcion: 'Combo completo tradicional de manicure y pedicure con exfoliación, hidratación y esmaltado clásico.'
  },
  {
    id: 4,
    nombre: 'Pies',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 20000,
    precioDiciembre: 22000,
    descripcion: 'Pedicure tradicional con limpieza profunda, exfoliación, masaje relajante y esmaltado clásico.'
  },
  {
    id: 5,
    nombre: 'Manos',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 16000,
    precioDiciembre: 18000,
    descripcion: 'Manicure tradicional con limpieza de cutícula, limado, hidratación y esmaltado clásico.'
  },

  // --- RUBBER ---
  {
    id: 6,
    nombre: 'Retoque press',
    categoria: 'Rubber',
    duracion: 90,
    precio: 50000,
    precioDiciembre: 55000,
    descripcion: 'Mantenimiento y retoque profesional para tus uñas press on, dejándolas como nuevas.'
  },
  {
    id: 7,
    nombre: 'Press on',
    categoria: 'Rubber',
    duracion: 120,
    precio: 65000,
    precioDiciembre: 70000,
    descripcion: 'Aplicación completa de tips preformados de gel de alta calidad para largo y forma al instante.'
  },
  {
    id: 8,
    nombre: 'Dipping',
    categoria: 'Rubber',
    duracion: 90,
    precio: 55000,
    precioDiciembre: 55000,
    descripcion: 'Técnica de polvo de inmersión sin lámpara, extra resistente y con acabado ultra natural.'
  },
  {
    id: 9,
    nombre: 'Base Rubber',
    categoria: 'Rubber',
    duracion: 90,
    precio: 55000,
    precioDiciembre: 60000,
    descripcion: 'Nivelación y refuerzo estructural con base elástica de alta densidad para uñas frágiles.'
  },

  // --- SEMIPERMANENTE ---
  {
    id: 10,
    nombre: 'Retiro semi',
    categoria: 'Semipermanente',
    duracion: 15,
    precio: 6000,
    precioDiciembre: 8000,
    descripcion: 'Retiro seguro, cuidadoso y profesional de esmalte semipermanente sin maltratar la uña natural.'
  },
  {
    id: 11,
    nombre: 'Semi hombre',
    categoria: 'Semipermanente',
    duracion: 60,
    precio: 25000,
    precioDiciembre: 25000,
    descripcion: 'Esmaltado o tratamiento semipermanente protector y prolijo para caballeros.'
  },
  {
    id: 12,
    nombre: 'Semi Manos y Pies',
    categoria: 'Semipermanente',
    duracion: 150,
    precio: 75000,
    precioDiciembre: 80000,
    descripcion: 'Combo completo de manos y pies con esmaltado semipermanente de larga duración y secado LED.'
  },
  {
    id: 13,
    nombre: 'Semi pies',
    categoria: 'Semipermanente',
    duracion: 80,
    precio: 38000,
    precioDiciembre: 43000,
    descripcion: 'Pedicure spa con esmaltado semipermanente de alto brillo y secado inmediato en lámpara LED.'
  },
  {
    id: 14,
    nombre: 'Semipermanente',
    categoria: 'Semipermanente',
    duracion: 90,
    precio: 43000,
    precioDiciembre: 48000,
    descripcion: 'Esmaltado en gel curado en lámpara LED con brillo espejo y duración de hasta 21 días intacto.'
  },

  // --- ACRÍLICO ESCULPIDO ---
  {
    id: 15,
    nombre: 'Uña',
    categoria: 'Acrílico esculpido',
    duracion: 20,
    precio: 6000,
    precioDiciembre: 7000,
    descripcion: 'Reparación o montaje individual de una uña en acrílico o sistema esculpido.'
  },
  {
    id: 16,
    nombre: 'Retiro acrilico',
    categoria: 'Acrílico esculpido',
    duracion: 60,
    precio: 10000,
    precioDiciembre: 10000,
    descripcion: 'Retiro profesional y delicado de sistema acrílico cuidando la salud de tu uña natural.'
  },
  {
    id: 17,
    nombre: 'Retiro',
    categoria: 'Acrílico esculpido',
    duracion: 60,
    precio: 15000,
    precioDiciembre: 10000,
    descripcion: 'Retiro completo y seguro de sistemas artificiales con nutrición e hidratación profunda.'
  },
  {
    id: 18,
    nombre: 'Retoque',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 65000,
    precioDiciembre: 70000,
    descripcion: 'Mantenimiento y relleno de crecimiento para sistema acrílico esculpido.'
  },
  {
    id: 19,
    nombre: 'Barrido',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 65000,
    precioDiciembre: 75000,
    descripcion: 'Capa protectora de acrílico sobre el largo natural para aportar máxima firmeza y resistencia.'
  },
  {
    id: 20,
    nombre: 'Acrilico',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 90000,
    precioDiciembre: 95000,
    descripcion: 'Extensión completa artesanal de uñas acrílicas esculpidas con monómero y polímero para estructura perfecta.'
  },
  {
    id: 21,
    nombre: 'Polygel',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 90000,
    precioDiciembre: 95000,
    descripcion: 'Extensión y moldeado profesional en Polygel ligero, flexible y de alta durabilidad.'
  },
];

const ALIAS_SERVICIOS_TARIFA: Record<string, string> = {
  'semi myp': 'semi manos y pies',
  'semi m y p': 'semi manos y pies',
  'myp': 'manos y pies',
  'm y p': 'manos y pies',
  'dippign': 'dipping',
  'diping': 'dipping',
  'rubber': 'base rubber',
};

function normalizarNombreServicio(txt: string): string {
  const limpio = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return ALIAS_SERVICIOS_TARIFA[limpio] || limpio;
}

function calcularPrecioServiciosParaFecha(servicioNombre?: string, fechaIso?: string): number | null {
  if (!servicioNombre || !servicioNombre.trim()) return null;
  const partes = servicioNombre.split('+').map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return null;

  const aplicarDic = esTarifaDesdeDiciembre(fechaIso);
  let total = 0;
  for (const parte of partes) {
    const pNorm = normalizarNombreServicio(parte);
    const svc = SERVICIOS_MIMATE_NAILS.find((s) => normalizarNombreServicio(s.nombre) === pNorm);
    if (!svc) return null;
    total += aplicarDic ? svc.precioDiciembre : svc.precio;
  }
  return total > 0 ? total : null;
}

function sumarAdicionalesEnNotas(notas?: string | null): number {
  if (!notas) return 0;
  let total = 0;
  for (const m of String(notas).matchAll(/\[ADICIONAL:(\d+)\]/g)) {
    const val = parseInt(m[1], 10);
    if (!isNaN(val) && val > 0) total += val;
  }
  return total;
}

function recalcularValorTotalReservaParaFecha(notas?: string | null, fechaIso?: string): number | null {
  if (!notas) return null;
  const matchSvc = String(notas).match(/Servicio:\s*([^|[\n]+)/i);
  if (!matchSvc || !matchSvc[1]) return null;
  const base = calcularPrecioServiciosParaFecha(matchSvc[1], fechaIso);
  if (base === null) return null;
  return base + sumarAdicionalesEnNotas(notas);
}

async function sincronizarPreciosCitasDiciembre(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('reservas')
      .select('id, fecha_inicio, estado, valor_total, valor_anticipo_requerido, notas')
      .neq('estado', 'bloqueada')
      .gte('fecha_inicio', '2026-11-30T00:00:00Z');

    if (error || !data) return;

    let actualizadas = 0;
    for (const r of data) {
      const fCol = new Date(r.fecha_inicio).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      if (!esTarifaDesdeDiciembre(fCol)) continue;

      const totalDic = recalcularValorTotalReservaParaFecha(r.notas, fCol);
      const totalNov = recalcularValorTotalReservaParaFecha(r.notas, '2026-11-01');
      const actual = Number(r.valor_total || 0);

      if (totalDic !== null && actual !== totalDic && (actual === 0 || actual === totalNov)) {
        let nuevasNotas = r.notas || '';
        if (/Excedente en spa:\s*\$[\d.]+/i.test(nuevasNotas)) {
          const abono = Number(r.valor_anticipo_requerido || 0);
          const nuevoExcedente = Math.max(0, totalDic - abono);
          nuevasNotas = nuevasNotas.replace(
            /Excedente en spa:\s*\$[\d.]+/gi,
            `Excedente en spa: ${nuevoExcedente.toLocaleString('es-CO')}`
          );
        }
        const payload: Record<string, any> = { valor_total: totalDic };
        if (nuevasNotas !== (r.notas || '')) payload.notas = nuevasNotas;
        const { error: updErr } = await supabase.from('reservas').update(payload).eq('id', r.id);
        if (!updErr) actualizadas++;
      }
    }
    if (actualizadas > 0) {
      spaBootstrapCache = null;
      console.log(`🎄 Tarifa Diciembre sincronizada automáticamente en ${actualizadas} cita(s).`);
    }
  } catch (err) {
    console.warn('⚠️ Error verificando tarifas de diciembre al iniciar:', err);
  }
}

// Obtener info del spa, empleadas y catálogo de servicios (con caché de 15s y sin exponer credenciales)
app.get('/api/spa/info', async (req: Request, res: Response) => {
  try {
    if (spaBootstrapCache && Date.now() - spaBootstrapCache.ts < CACHE_BOOTSTRAP_TTL_MS) {
      return res.json(spaBootstrapCache.data);
    }

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
      .select('id, nombre, deporte, activa, precio_estandar, precio_pico')
      .eq('complejo_id', complejo.id)
      .eq('activa', true)
      .order('nombre');

    const montoFijo = getMontoAnticipoFijo(complejo);
    const config = {
      exigeAnticipo: (complejo.porcentaje_anticipo_minimo || 0) > 0,
      montoAnticipoFijo: montoFijo,
      porcentajeAnticipo: montoFijo,
      nequiNumero: complejo.nequi_numero || '321 961 0896',
      bancolombiaNumero: complejo.daviplata_numero || 'Ahorros 245-000123-88',
      llaveNumero: getLlaveNumero(complejo) || '',
      titularCuenta: getTitularLimpio(complejo.titular_cuenta),
      horaApertura: complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '08:00',
      horaCierre: complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '19:00',
    };

    const equipoEnriquecido = (canchas || [])
      .filter((c) => {
        const nLower = (c.nombre || '').toLowerCase();
        return !nLower.includes('manicurista 4') && nLower !== '4';
      })
      .map(enriquecerCancha);
    const aplicarDicHoy = esTarifaDesdeDiciembre();
    const serviciosVigentes = SERVICIOS_MIMATE_NAILS.map((s) => ({
      ...s,
      precio: aplicarDicHoy ? s.precioDiciembre : s.precio,
    }));
    const bootstrapData = {
      complejo: sanitizarComplejoPublico(complejo),
      equipo: equipoEnriquecido,
      config,
      servicios: serviciosVigentes,
      categorias: ['Todos', 'Tradicional', 'Rubber', 'Semipermanente', 'Acrílico esculpido']
    };

    spaBootstrapCache = { data: bootstrapData, ts: Date.now() };
    res.json(bootstrapData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint alias bootstrap para inicialización ultrarrápida de la web en 1 solo viaje de red
app.get('/api/spa/bootstrap', (req: Request, res: Response) => {
  // Redirigir limpiamente a /api/spa/info que contiene todo el bootstrap paquetizado
  res.redirect(307, '/api/spa/info');
});

// Franja fija de almuerzo: 12:00 PM a 1:00 PM (hora Colombia)
function solapaHorarioAlmuerzo(inicioMs: number, finMs: number, fechaBogotaIso?: string): boolean {
  const fechaRef =
    fechaBogotaIso ||
    new Date(inicioMs).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const almuerzoStartMs = new Date(`${fechaRef}T12:00:00-05:00`).getTime();
  const almuerzoEndMs = new Date(`${fechaRef}T13:00:00-05:00`).getTime();
  return inicioMs < almuerzoEndMs && finMs > almuerzoStartMs;
}

// Horarios base iniciales para clientas (se adaptan dinámicamente según el fin de citas agendadas por especialista)
const HORAS_ANCLA_CLIENTAS = ['09:30', '13:00', '15:00', '17:00'] as const;

function obtenerFechaYHoraBogota(epochMs: number): { fechaIso: string; hhmm: string } {
  // Colombia (America/Bogota) opera en UTC-5 fijo todo el año
  const d = new Date(epochMs - 5 * 60 * 60 * 1000);
  const iso = d.toISOString();
  return {
    fechaIso: iso.slice(0, 10),
    hhmm: iso.slice(11, 16),
  };
}

function calcularSlotsClientaManicurista(params: {
  fechaIso: string;
  canchaId: string;
  duracionMinutos: number;
  reservasActivas: Array<{ cancha_id?: string; fecha_inicio?: string; fecha_fin?: string }>;
  horaAperturaMs: number;
  horaCierreMs: number;
  ahoraMs: number;
}): string[] {
  const { fechaIso, canchaId, duracionMinutos, reservasActivas, horaAperturaMs, horaCierreMs, ahoraMs } = params;
  const reservasMani = reservasActivas.filter((r) => r.cancha_id === canchaId && r.fecha_inicio);

  // Solo las 4 horas base + puntos exactos donde terminan citas o bloqueos de ESTA especialista en la fecha
  const candidatosSet = new Set<string>(HORAS_ANCLA_CLIENTAS);

  for (const r of reservasMani) {
    const rStart = new Date(r.fecha_inicio!).getTime();
    const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60 * 1000;
    if (!isNaN(rEnd)) {
      const { fechaIso: finFecha, hhmm: finHHMM } = obtenerFechaYHoraBogota(rEnd);
      if (finFecha === fechaIso && rEnd >= horaAperturaMs && rEnd < horaCierreMs) {
        candidatosSet.add(finHHMM);
      }
    }
  }

  const candidatosOrdenados = Array.from(candidatosSet).sort();
  const libres: string[] = [];

  for (const h of candidatosOrdenados) {
    const slotStartMs = new Date(`${fechaIso}T${h}:00-05:00`).getTime();
    const slotEndMs = slotStartMs + duracionMinutos * 60 * 1000;

    // 1. Si es hoy y la hora ya pasó, descartar
    if (slotStartMs <= ahoraMs) continue;

    // 2. Respetar estrictamente apertura y hora de cierre del spa para clientas
    if (!isNaN(horaAperturaMs) && slotStartMs < horaAperturaMs) continue;
    if (!isNaN(horaCierreMs) && slotEndMs > horaCierreMs) continue;

    // 3. Bloquear siempre la hora de almuerzo (12:00 PM - 1:00 PM) para clientas
    if (solapaHorarioAlmuerzo(slotStartMs, slotEndMs, fechaIso)) continue;

    // 4. Sin solapamiento con reservas activas ni bloqueos de horario de esta especialista
    const solapa = reservasMani.some((r) => {
      const rStart = new Date(r.fecha_inicio!).getTime();
      const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60 * 1000;
      return rStart < slotEndMs && rEnd > slotStartMs;
    });

    if (!solapa) {
      libres.push(h);
    }
  }

  return libres;
}

// Obtener horarios (slots) disponibles para una fecha y duración específica (Lunes a Sábado, 9:30 am a 5:30 pm)
app.get('/api/spa/slots', async (req: Request, res: Response) => {
  const { date, cancha_id, duracion_minutos, reagendar_id } = req.query;
  const cleanDate = sanitizeInput(date, 10);
  if (!cleanDate || !esFormatoFechaValido(cleanDate)) {
    return res.status(400).json({ error: 'Parámetro date inválido o ausente (se espera YYYY-MM-DD)' });
  }

  if (cancha_id && !esUUIDValido(String(cancha_id))) {
    return res.status(400).json({ error: 'ID de especialista inválido' });
  }

  if (reagendar_id && !esUUIDValido(String(reagendar_id))) {
    return res.status(400).json({ error: 'ID de reserva a reagendar inválido' });
  }

  try {
    const duracion = Math.max(15, Math.min(360, parseInt(String(duracion_minutos || 45), 10)));
    if (esDiaCerradoPorDomingo(cleanDate)) {
      return res.json({
        date: cleanDate,
        slots: [],
        aviso: 'Los domingos regulares estamos cerrados. Atendemos con amor de Lunes a Sábado de 9:30 am a 5:30 pm (en Diciembre sí trabajamos domingos) 💕',
      });
    }

    const { data: complejo } = await supabase
      .from('complejos')
      .select('id, hora_apertura, hora_cierre')
      .eq('slug', 'mimate-nails')
      .maybeSingle();

    if (!complejo) return res.status(404).json({ error: 'Spa no configurado' });

    const { data: empleadas } = await supabase
      .from('canchas')
      .select('id, nombre')
      .eq('complejo_id', complejo.id)
      .eq('activa', true);

    const listaEmpleadas = (empleadas || [])
      .filter((c) => {
        const nLower = (c.nombre || '').toLowerCase();
        return !nLower.includes('manicurista 4') && nLower !== '4';
      })
      .map(enriquecerCancha);
    if (listaEmpleadas.length === 0) return res.json({ date: cleanDate, slots: [] });

    const aperturaStr = complejo.hora_apertura ? complejo.hora_apertura.slice(0, 5) : '08:00';
    const cierreStr = complejo.hora_cierre ? complejo.hora_cierre.slice(0, 5) : '19:00';

    const inicioBuffer = new Date(new Date(`${cleanDate}T00:00:00-05:00`).getTime() - 6 * 60 * 60 * 1000).toISOString();
    const finBuffer = new Date(new Date(`${cleanDate}T23:59:59-05:00`).getTime() + 6 * 60 * 60 * 1000).toISOString();

    const { data: reservasOcupadas } = await supabase
      .from('reservas')
      .select('id, cancha_id, fecha_inicio, fecha_fin, estado, notas')
      .in('cancha_id', listaEmpleadas.map(e => e.id))
      .neq('estado', 'cancelada')
      .gte('fecha_inicio', inicioBuffer)
      .lte('fecha_inicio', finBuffer);

    const ocupadas = (reservasOcupadas || [])
      .filter(r => !reagendar_id || r.id !== String(reagendar_id))
      .map(hidratarHorarioRealReserva);

    const ahoraMs = Date.now();
    const horaCierreMs = new Date(`${cleanDate}T${cierreStr}:00-05:00`).getTime();
    const horaAperturaMs = new Date(`${cleanDate}T${aperturaStr}:00-05:00`).getTime();

    let slotsDisponibles: string[] = [];
    if (cancha_id) {
      slotsDisponibles = calcularSlotsClientaManicurista({
        fechaIso: cleanDate,
        canchaId: String(cancha_id),
        duracionMinutos: duracion,
        reservasActivas: ocupadas,
        horaAperturaMs,
        horaCierreMs,
        ahoraMs,
      });
    } else {
      const unionSlots = new Set<string>();
      for (const emp of listaEmpleadas) {
        const slotsEmp = calcularSlotsClientaManicurista({
          fechaIso: cleanDate,
          canchaId: emp.id,
          duracionMinutos: duracion,
          reservasActivas: ocupadas,
          horaAperturaMs,
          horaCierreMs,
          ahoraMs,
        });
        for (const s of slotsEmp) unionSlots.add(s);
      }
      slotsDisponibles = Array.from(unionSlots).sort();
    }

    res.json({
      date: cleanDate,
      duracion_minutos: duracion,
      slots: slotsDisponibles,
      aviso: slotsDisponibles.length === 0 ? 'No hay horarios disponibles para esta fecha con la duración de este servicio. Prueba con otro día 💕' : undefined
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Consultar únicamente el nombre guardado por teléfono para autorrellenar el formulario web sin duplicar clientas
app.get('/api/spa/cliente-por-telefono', phoneLookupLimiter, async (req: Request, res: Response) => {
  const rawTel = String(req.query.telefono || '');
  const digits = rawTel.replace(/\D/g, '');
  if (!digits || esIdentificadorLid(rawTel) || digits.length < 10 || digits.length > 13) {
    return res.json({ encontrado: false });
  }

  try {
    const cleanPhone = digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
    const sinPais = cleanPhone.replace(/^57/, '');
    const { data, error } = await supabase
      .from('clientes')
      .select('nombre, telefono_wa, creado_en')
      .or(`telefono_wa.eq.${cleanPhone},telefono_wa.eq.${sinPais}`)
      .order('creado_en', { ascending: true })
      .limit(5);

    if (error) return res.status(500).json({ error: error.message });

    const genericos = new Set(['usuario whatsapp', 'cliente', 'clienta']);
    const encontrado = (data || []).find((c) => {
      const nom = String(c.nombre || '').trim();
      return Boolean(nom && !genericos.has(nom.toLowerCase()));
    });

    if (encontrado?.nombre) {
      return res.json({ encontrado: true, nombre: String(encontrado.nombre).trim() });
    }
    return res.json({ encontrado: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Confirmar reserva web (100% directa o con anticipo según fecha/config) con Voucher y prevención de duplicados
app.post('/api/spa/reservar', bookingLimiter, async (req: Request, res: Response) => {
  let {
    servicio_nombre,
    precio,
    duracion_minutos = 60,
    fecha,
    hora,
    cancha_id,
    cliente_nombre,
    cliente_telefono,
    reagendar_reserva_id,
    origen,
    agendado_por,
    whatsapp_lid
  } = req.body;

  // Sanitización y normalización defensiva contra XSS y desbordamientos
  cliente_nombre = sanitizeInput(cliente_nombre, 80);
  servicio_nombre = sanitizeInput(servicio_nombre, 250);
  fecha = sanitizeInput(fecha, 10);
  hora = sanitizeInput(hora, 5);
  const rawTelBody = String(cliente_telefono || '');
  cliente_telefono = rawTelBody.replace(/\D/g, '').slice(0, 15);
  const cleanLid = extraerDigitosLid(whatsapp_lid);

  if (!fecha || !hora || !cliente_telefono || !cliente_nombre) {
    return res.status(400).json({ error: 'Faltan datos requeridos (fecha, hora, nombre, teléfono)' });
  }

  if (esIdentificadorLid(rawTelBody) || cliente_telefono.length < 10 || cliente_telefono.length > 13) {
    return res.status(400).json({
      error: 'Por favor ingresa un número real de celular de WhatsApp (10 dígitos, ej. 300 123 4567).',
    });
  }

  if (!esFormatoFechaValido(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Se espera YYYY-MM-DD.' });
  }

  if (!esFormatoHoraValido(hora)) {
    return res.status(400).json({ error: 'Formato de hora inválido. Se espera HH:MM.' });
  }

  if (cancha_id && !esUUIDValido(cancha_id)) {
    return res.status(400).json({ error: 'ID de manicurista inválido.' });
  }

  if (reagendar_reserva_id && !esUUIDValido(reagendar_reserva_id)) {
    return res.status(400).json({ error: 'ID de reserva a reagendar inválido.' });
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

    const listaEmpleadas = (empleadas || [])
      .filter((c) => {
        const nLower = (c.nombre || '').toLowerCase();
        return !nLower.includes('manicurista 4') && nLower !== '4';
      })
      .map(enriquecerCancha);
    if (listaEmpleadas.length === 0) {
      return res.status(400).json({ error: 'No hay personal registrado en el spa' });
    }

    const duracionReservaMin = Number(duracion_minutos) || 60;
    const dInicio = new Date(`${fecha}T${hora}:00-05:00`);
    const dFin = new Date(dInicio.getTime() + duracionReservaMin * 60 * 1000);

    // 1. Validar que la hora no esté en el pasado
    if (dInicio.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'No puedes reservar un horario que ya pasó.' });
    }

    // 1B. Validar horario de atención según origen verificado con autenticación del equipo:
    // - Clientas (origenReal !== 'panel'): solo pueden agendar estrictamente dentro del horario y días configurados del spa.
    // - Admin / Especialistas autenticadas (origenReal === 'panel'): pueden agendar libremente en cualquier horario.
    const origenReal = origen === 'panel' && esStaffAutenticado(req) ? 'panel' : 'web';
    const aperturaStr = complejo.hora_apertura ? String(complejo.hora_apertura).slice(0, 5) : '08:00';
    const cierreStr = complejo.hora_cierre ? String(complejo.hora_cierre).slice(0, 5) : '19:00';
    const horaAperturaMs = new Date(`${fecha}T${aperturaStr}:00-05:00`).getTime();
    const horaCierreMs = new Date(`${fecha}T${cierreStr}:00-05:00`).getTime();

    if (origenReal !== 'panel') {
      if (esDiaCerradoPorDomingo(fecha)) {
        return res.status(400).json({
          error: 'Los domingos regulares el spa está cerrado (en diciembre sí trabajamos domingos).',
        });
      }
      if (!isNaN(horaAperturaMs) && !isNaN(horaCierreMs)) {
        if (dInicio.getTime() < horaAperturaMs || dFin.getTime() > horaCierreMs) {
          return res.status(400).json({
            error: 'El horario seleccionado está fuera del horario de atención del spa. Por favor elige un turno disponible.',
          });
        }
      }
    }

    if (origenReal !== 'panel' && solapaHorarioAlmuerzo(dInicio.getTime(), dFin.getTime(), fecha)) {
      return res.status(400).json({
        error: 'El horario de 12:00 PM a 1:00 PM está bloqueado por hora de almuerzo.',
      });
    }

    // 2. Buscar reservas activas del día/ventana usando horario real (excluyendo cita anterior si es reagendamiento)
    const inicioDiaBufferMs = new Date(`${fecha}T00:00:00-05:00`).getTime() - 6 * 60 * 60 * 1000;
    const finDiaBufferMs = new Date(`${fecha}T23:59:59-05:00`).getTime() + 6 * 60 * 60 * 1000;
    const inicioVentanaRes = new Date(Math.min(dInicio.getTime() - 12 * 60 * 60 * 1000, inicioDiaBufferMs)).toISOString();
    const finVentanaRes = new Date(Math.max(dFin.getTime() + 12 * 60 * 60 * 1000, finDiaBufferMs)).toISOString();
    const { data: reservasVentana } = await supabase
      .from('reservas')
      .select('id, cancha_id, fecha_inicio, fecha_fin, estado, notas')
      .in('cancha_id', listaEmpleadas.map(e => e.id))
      .neq('estado', 'cancelada')
      .gte('fecha_inicio', inicioVentanaRes)
      .lte('fecha_inicio', finVentanaRes);

    const reservasDiaHidratadas = (reservasVentana || [])
      .filter(r => !reagendar_reserva_id || r.id !== reagendar_reserva_id)
      .map(hidratarHorarioRealReserva);

    const inicioReqMs = dInicio.getTime();
    const finReqMs = dFin.getTime();
    const ocupadasIds = reservasDiaHidratadas
      .filter(r => {
        const rStart = new Date(r.fecha_inicio).getTime();
        const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60 * 1000;
        return rStart < finReqMs && rEnd > inicioReqMs;
      })
      .map(r => r.cancha_id);

    const ahoraReservaMs = Date.now();
    const tieneSlotClientaHabilitado = (maniId: string): boolean => {
      const slotsMani = calcularSlotsClientaManicurista({
        fechaIso: fecha,
        canchaId: maniId,
        duracionMinutos: duracionReservaMin,
        reservasActivas: reservasDiaHidratadas,
        horaAperturaMs,
        horaCierreMs,
        ahoraMs: ahoraReservaMs,
      });
      return slotsMani.includes(hora);
    };

    let empleadaAsignada: any;
    let dbFechaInicioInsert = dInicio.toISOString();
    let dbFechaFinInsert = dFin.toISOString();
    let requiereTagHorarioReal = false;
    let esTraslapeParcial = false;

    if (cancha_id) {
      if (ocupadasIds.includes(cancha_id)) {
        // Solo personal autenticado del panel (admin / especialistas) puede agendar con traslape parcial.
        // Para clientas normales (origenReal !== 'panel') queda estrictamente prohibido cualquier solapamiento.
        if (origenReal !== 'panel') {
          return res.status(409).json({
            error: 'La manicurista seleccionada ya tiene una cita agendada en este horario. Por favor elige otra hora o especialista.',
          });
        }

        const otrasCancha = (reservasVentana || []).filter(
          (r) => r.cancha_id === cancha_id && (!reagendar_reserva_id || r.id !== reagendar_reserva_id)
        );
        const validacionTraslape = validarYCalcularPersistenciaTraslape({
          idReserva: reagendar_reserva_id || '__nueva_reserva__',
          dInicio,
          dFin,
          notasActuales: '',
          otrasReservas: otrasCancha,
        });

        if (!validacionTraslape.valido) {
          return res.status(409).json({
            error: validacionTraslape.error,
          });
        }

        dbFechaInicioInsert = validacionTraslape.dbFechaInicio;
        dbFechaFinInsert = validacionTraslape.dbFechaFin;
        esTraslapeParcial = validacionTraslape.esTraslapeParcial;
        requiereTagHorarioReal =
          dbFechaInicioInsert !== dInicio.toISOString() || dbFechaFinInsert !== dFin.toISOString();
      }
      if (origenReal !== 'panel' && !tieneSlotClientaHabilitado(cancha_id)) {
        return res.status(400).json({
          error: 'Este horario no está habilitado para reserva en línea con la especialista seleccionada. Por favor elige uno de los horarios disponibles.',
        });
      }
      empleadaAsignada = enriquecerCancha(listaEmpleadas.find(e => e.id === cancha_id));
      if (!empleadaAsignada) {
        return res.status(404).json({ error: 'Especialista no encontrada' });
      }
    } else {
      // Asignar automáticamente una manicurista libre (para clientas, solo entre las que tengan ese turno dinámico habilitado)
      const disponibles = listaEmpleadas.filter(
        e => !ocupadasIds.includes(e.id) && (origenReal === 'panel' || tieneSlotClientaHabilitado(e.id))
      );
      if (disponibles.length === 0) {
        return res.status(409).json({
          error: 'Lo sentimos, todos los turnos para este horario ya fueron reservados o no están habilitados. Por favor selecciona otro horario.',
        });
      }
      empleadaAsignada = enriquecerCancha(disponibles[0]);
    }

    // Normalizar teléfono celular (formato Colombia: 573...)
    let cleanPhone = String(cliente_telefono).replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
      cleanPhone = `57${cleanPhone}`;
    }

    const cliente = await BookingService.getOrCreateCliente(cleanPhone, cliente_nombre.trim(), cleanLid || undefined);

    // Determinar si el spa exige abono/anticipo para reservar (o si la cita es en diciembre, donde SIEMPRE se exige abono)
    const exigeAnticipo = requiereAnticipoParaFecha(complejo, fecha);
    const montoFijoConfigurado = getMontoAnticipoFijo(complejo);

    // Si es reagendamiento, buscar cita previa para extraer abono ya pagado y servicio anterior
    let reservaPrevia: any = null;
    let abonoPrevioReconocido = 0;
    let servicioPrevioNombre = '';

    if (reagendar_reserva_id) {
      try {
        const { data: prev } = await supabase
          .from('reservas')
          .select('*, canchas(*), clientes(*)')
          .eq('id', reagendar_reserva_id)
          .maybeSingle();

        if (prev) {
          reservaPrevia = prev;
          const matchSvc = (prev.notas || '').match(/Servicio:\s*([^|[\n]+)/i);
          if (matchSvc && matchSvc[1]) servicioPrevioNombre = matchSvc[1].trim();

          // 1. Consultar pagos_anticipos si ya tenía pago aprobado
          const { data: pagos } = await supabase
            .from('pagos_anticipos')
            .select('monto')
            .eq('reserva_id', reagendar_reserva_id)
            .eq('estado', 'aprobado');

          if (pagos && pagos.length > 0) {
            abonoPrevioReconocido = pagos.reduce((acc, p) => acc + Number(p.monto || 0), 0);
          }

          // 2. Si no hay registro en pagos_anticipos, solo reconocer abono si la reserva estaba confirmada con valor_anticipo_requerido > 0
          if (!abonoPrevioReconocido && prev.estado === 'confirmada' && Number(prev.valor_anticipo_requerido) > 0) {
            abonoPrevioReconocido = Number(prev.valor_anticipo_requerido);
          }

          if (!abonoPrevioReconocido) {
            const matchAbono = (prev.notas || '').match(/Abono previo transferido:\s*\$?([\d\.]+)/i) || (prev.notas || '').match(/ANTICIPO:\s*\$?([\d\.]+)/i);
            if (matchAbono && matchAbono[1]) {
              abonoPrevioReconocido = Number(matchAbono[1].replace(/\./g, '')) || 0;
            }
          }
          // IMPORTANTE: Si la cita previa no pagó abono, abonoPrevioReconocido se mantiene en 0.
        }
      } catch (errPrev) {
        console.warn('[REAGENDAMIENTO] Error consultando reserva previa:', errPrev);
      }
    }

    const esReagendamiento = Boolean(reagendar_reserva_id && reservaPrevia);
    const precioCatalogoFecha = calcularPrecioServiciosParaFecha(servicio_nombre, fecha);
    const numPrecio = precioCatalogoFecha ?? Number(precio || 35000);

    // Calcular el anticipo total requerido para el servicio y fecha seleccionada
    const anticipoTotalParaEsteTurno = exigeAnticipo ? Math.min(numPrecio, montoFijoConfigurado) : 0;

    let anticipoCalculado = 0;
    let saldoRestante = numPrecio;
    let estadoInicial = 'confirmada';
    let expiracionReserva: string | null = null;
    let esPreReserva = false;

    if (esReagendamiento) {
      // Calcular si falta pagar anticipo (ejemplo: cita previa en noviembre sin abono y reagendada a diciembre)
      const anticipoFaltante = Math.max(0, anticipoTotalParaEsteTurno - abonoPrevioReconocido);

      if (anticipoFaltante > 0) {
        // La nueva cita exige anticipo que no está cubierto: queda pendiente de pago
        // Solo expira automáticamente (30 min) si la agendó una clienta; las del panel no expiran solas
        anticipoCalculado = anticipoFaltante;
        saldoRestante = Math.max(0, numPrecio - abonoPrevioReconocido - anticipoFaltante);
        estadoInicial = 'pendiente_pago';
        expiracionReserva = origenReal === 'panel' ? null : new Date(Date.now() + 30 * 60 * 1000).toISOString();
        esPreReserva = true;
      } else {
        // No hay anticipo faltante: se confirma de inmediato
        anticipoCalculado = 0;
        saldoRestante = Math.max(0, numPrecio - abonoPrevioReconocido);
        estadoInicial = 'confirmada';
        expiracionReserva = null;
        esPreReserva = false;
      }
    } else {
      // Cita nueva directa (no reagendamiento)
      // Si la agenda una administradora o especialista (origenReal === 'panel'), NO tiene expiración automática:
      // el espacio se mantiene ocupado hasta que la aprueben o la cancelen manualmente.
      anticipoCalculado = anticipoTotalParaEsteTurno;
      saldoRestante = Math.max(0, numPrecio - anticipoCalculado);
      estadoInicial = exigeAnticipo ? 'pendiente_pago' : 'confirmada';
      expiracionReserva =
        exigeAnticipo && origenReal !== 'panel'
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : null;
      esPreReserva = exigeAnticipo;
    }

    const precioFmt = '$' + numPrecio.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const anticipoFmt = '$' + anticipoCalculado.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const saldoRestanteFmt = '$' + saldoRestante.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    let notas = '';
    if (esReagendamiento) {
      const detalleServicio = servicioPrevioNombre && servicioPrevioNombre.toLowerCase() !== String(servicio_nombre).toLowerCase()
        ? `Cambio de servicio: "${servicioPrevioNombre}" -> "${servicio_nombre}"`
        : `Mismo servicio: "${servicio_nombre}"`;

      if (esPreReserva) {
        notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | [CITA_REAGENDADA_PENDIENTE_ANTICIPO: ${anticipoFmt}] | ${detalleServicio}${abonoPrevioReconocido > 0 ? ` | Abono anterior: $${abonoPrevioReconocido.toLocaleString('es-CO')}` : ''} | Excedente en spa: $${saldoRestante.toLocaleString('es-CO')}${origenReal === 'panel' ? ` | Agendado en cabina por: ${sanitizeInput(agendado_por, 60) || 'Personal'} | [SIN_EXPIRACION_PANEL]` : ''}`;
      } else {
        notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | [CITA_REAGENDADA_CONFIRMADA] | ${detalleServicio}${abonoPrevioReconocido > 0 ? ` | Abono previo transferido: $${abonoPrevioReconocido.toLocaleString('es-CO')}` : ''} | Excedente en spa: $${saldoRestante.toLocaleString('es-CO')} | [CONFIRMADA_POR_CLIENTA]`;
      }
    } else if (origenReal === 'panel') {
      // Cita agendada desde el panel (admin / especialista): nunca se cancela automáticamente por vencimiento de abono
      const autorPanel = sanitizeInput(agendado_por, 60) || 'Personal';
      if (exigeAnticipo) {
        notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | Agendado en cabina por: ${autorPanel} | [PENDIENTE_ANTICIPO: ${anticipoFmt}] | [SIN_EXPIRACION_PANEL]`;
      } else {
        const hoyCol = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
        const esCitaCercana = fecha === hoyCol || dInicio.getTime() - Date.now() < 24 * 60 * 60 * 1000;
        notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | Agendado en cabina por: ${autorPanel} | Pago en el spa (Sin cobro anticipado)${esCitaCercana ? '' : ' [POR_CONFIRMAR_CLIENTA]'}`;
      }
    } else if (exigeAnticipo) {
      notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | Pre-Reserva Web JL Mímate Nails | [PENDIENTE_ANTICIPO: ${anticipoFmt}]`;
    } else {
      notas = `💅 Servicio: ${servicio_nombre || 'Uñas'} | Clienta: ${cliente_nombre.trim()} | Reserva Web JL Mímate Nails | Pago en el spa (Sin cobro anticipado)`;
    }

    if (req.body.acepta_politicas) {
      notas += ' | [Datos Ley 1581 Aceptados]';
    }

    if (requiereTagHorarioReal) {
      notas += ` | [HORARIO_REAL:${dInicio.toISOString()}|${dFin.toISOString()}]`;
    }

    const { data: reserva, error: errRes } = await supabase
      .from('reservas')
      .insert({
        cancha_id: empleadaAsignada.id,
        cliente_id: cliente.id,
        fecha_inicio: dbFechaInicioInsert,
        fecha_fin: dbFechaFinInsert,
        valor_total: numPrecio,
        valor_anticipo_requerido: anticipoCalculado,
        estado: estadoInicial,
        expiracion_reserva: expiracionReserva,
        notas,
      })
      .select('*, canchas(*), clientes(*)')
      .single();

    if (errRes) throw errRes;

    // Si la reserva proviene de un flujo de reagendamiento, transferir auditoría de pagos y eliminar la anterior
    if (esReagendamiento && reserva) {
      try {
        await supabase
          .from('pagos_anticipos')
          .update({ reserva_id: reserva.id })
          .eq('reserva_id', reagendar_reserva_id);

        console.log(`[REAGENDAMIENTO] Eliminando cita anterior ID: ${reagendar_reserva_id} tras procesar reagendamiento`);
        await supabase
          .from('reservas')
          .delete()
          .eq('id', reagendar_reserva_id);
      } catch (delErr: any) {
        console.warn(`[REAGENDAMIENTO] Error procesando limpieza de cita previa ${reagendar_reserva_id}:`, delErr.message);
      }
    }

    const fechaLegible = dInicio.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const horaInicioFmt = dInicio.toLocaleTimeString('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    });

    const horaFinFmt = dFin.toLocaleTimeString('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    });

    // Formulación del comprobante oficial / voucher de WhatsApp
    let voucherWhatsApp = '';

    if (esReagendamiento && esPreReserva) {
      const detalleServicioInfo = servicioPrevioNombre && servicioPrevioNombre.toLowerCase() !== String(servicio_nombre).toLowerCase()
        ? `✨ _(Cambiaste de ${servicioPrevioNombre} a ${servicio_nombre})_\n`
        : '';

      voucherWhatsApp =
        `🌸 *JL MÍMATE NAILS* 🌸\n` +
        `_Pre-Reserva de Cita Reagendada (Temporada Diciembre)_\n` +
        `───────────────\n\n` +
        `¡Hola *${cliente_nombre.trim()}*! 💅 Tu solicitud de cambio de horario ha sido *pre-apartada temporalmente*:\n\n` +
        `💅 *Servicio:* ${servicio_nombre}\n` +
        detalleServicioInfo +
        `👩‍🎨 *Especialista:* ${empleadaAsignada.nombre}\n` +
        `📅 *Nueva Fecha:* ${fechaLegible}\n` +
        `⏰ *Nuevo Horario:* ${horaInicioFmt} a ${horaFinFmt}\n` +
        `⏱️ *Duración aprox:* ${duracion_minutos} min\n\n` +
        `💰 *Valor del servicio:* ${precioFmt}\n` +
        (abonoPrevioReconocido > 0
          ? `💳 *Abono anterior reconocido:* $${abonoPrevioReconocido.toLocaleString('es-CO')}\n`
          : '') +
        `💳 *Anticipo a transferir:* *${anticipoFmt}*\n` +
        `🏠 *Saldo restante en el spa:* ${saldoRestanteFmt}\n\n` +
        `───────────────\n` +
        `*CUENTAS OFICIALES PARA TRANSFERIR:*\n` +
        `${formatearCuentasRecaudoMensaje(complejo)}\n\n` +
        `⏳ *TIEMPO LÍMITE (30 MINUTOS):*\n` +
        `Para asegurar tu cupo en temporada de diciembre, por favor transfiere el abono de *${anticipoFmt}* y *envía el comprobante por este chat* dentro de los próximos 30 minutos.\n\n` +
        `¡Quedamos atentas a tu comprobante reina! 💕🌸`;
    } else if (esReagendamiento) {
      const detalleServicioInfo = servicioPrevioNombre && servicioPrevioNombre.toLowerCase() !== String(servicio_nombre).toLowerCase()
        ? `✨ _(Cambiaste de ${servicioPrevioNombre} a ${servicio_nombre})_\n`
        : '';

      const lineaAbono = abonoPrevioReconocido > 0
        ? `💳 *Abono anterior reconocido:* $${abonoPrevioReconocido.toLocaleString('es-CO')}\n🏠 *Excedente a pagar en el spa:* $${saldoRestante.toLocaleString('es-CO')}\n\n`
        : `🏠 *Total a pagar en el spa:* ${precioFmt}\n\n`;

      const lineaConfirmacion = abonoPrevioReconocido > 0
        ? `✅ *Tu cupo está 100% CONFIRMADO.* Tu cita anterior fue cancelada y tu abono ya quedó aplicado.\n\n`
        : `✅ *Tu cupo está 100% CONFIRMADO.* Tu cita anterior fue cancelada y tu nuevo horario quedó reservado.\n\n`;

      voucherWhatsApp =
        `🌸 *JL MÍMATE NAILS* 🌸\n` +
        `_Confirmación de Cita Reagendada_\n` +
        `───────────────\n\n` +
        `¡Hola *${cliente_nombre.trim()}*! 💅 Tu cita ha sido *reagendada y confirmada exitosamente*:\n\n` +
        `💅 *Servicio:* ${servicio_nombre}\n` +
        detalleServicioInfo +
        `👩‍🎨 *Especialista:* ${empleadaAsignada.nombre}\n` +
        `📅 *Nueva Fecha:* ${fechaLegible}\n` +
        `⏰ *Nuevo Horario:* ${horaInicioFmt} a ${horaFinFmt}\n` +
        `⏱️ *Duración aprox:* ${duracion_minutos} min\n\n` +
        `💰 *Valor del servicio:* ${precioFmt}\n` +
        lineaAbono +
        `───────────────\n` +
        `📍 *Dirección:* Pereira, Cuba (Calle 66 bis #26-57)\n` +
        `🗺️ *Ubicación Maps:* https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8\n` +
        `🏢 *Lugar:* JL Mímate Nails - Spa de Uñas\n\n` +
        lineaConfirmacion +
        `¡Te esperamos con todo el amor para consentirte reina! 💕🌸`;
    } else if (exigeAnticipo) {
      voucherWhatsApp =
        `🌸 *JL MÍMATE NAILS* 🌸\n` +
        `_Pre-Reserva de Turno_\n` +
        `───────────────\n\n` +
        `¡Hola *${cliente_nombre.trim()}*! 💅 Tu turno ha sido *pre-apartado temporalmente*:\n\n` +
        `💅 *Servicio:* ${servicio_nombre}\n` +
        `👩‍🎨 *Especialista:* ${empleadaAsignada.nombre}\n` +
        `📅 *Fecha:* ${fechaLegible}\n` +
        `⏰ *Horario:* ${horaInicioFmt} a ${horaFinFmt}\n` +
        `⏱️ *Duración aprox:* ${duracion_minutos} min\n\n` +
        `💰 *Total del servicio:* ${precioFmt}\n` +
        (saldoRestante === 0
          ? `💳 *Valor a transferir (100% del servicio):* *${anticipoFmt}*\n` +
            `🏠 *Saldo restante en el spa:* *$0* (¡Servicio cubierto!)\n\n`
          : `💳 *Abono requerido:* *${anticipoFmt}*\n` +
            `🏠 *Saldo restante en el spa:* ${saldoRestanteFmt}\n\n`) +
        `───────────────\n` +
        `*CUENTAS OFICIALES PARA TRANSFERIR:*\n` +
        `${formatearCuentasRecaudoMensaje(complejo)}\n\n` +
        (origenReal === 'panel'
          ? `📸 *COMPROBANTE DE ABONO:*\n` +
            `Para confirmar tu abono, por favor transfiere ${saldoRestante === 0 ? `el valor total de *${anticipoFmt}*` : `el abono de *${anticipoFmt}*`} y *envía la foto del comprobante por este mismo chat*.\n\n` +
            `¡Quedamos atentas a tu comprobante reina! 💕🌸`
          : `⏳ *TIEMPO LÍMITE (30 MINUTOS):*\n` +
            `Para asegurar tu cupo definitivo, por favor transfiere ${saldoRestante === 0 ? `el valor total de *${anticipoFmt}*` : `el abono de *${anticipoFmt}*`} y *envía la foto del comprobante por este mismo chat* dentro de los próximos 30 minutos.\n\n` +
            `Pasado este tiempo, el espacio se liberará automáticamente para otra clienta.\n\n` +
            `¡Quedamos atentas a tu comprobante reina! 💕🌸`);
    } else {
      voucherWhatsApp =
        `🌸 *JL MÍMATE NAILS* 🌸\n` +
        `_Comprobante de Cita_\n` +
        `───────────────\n\n` +
        `¡Hola *${cliente_nombre.trim()}*! 💅 Tu cita ha sido agendada con éxito:\n\n` +
        `💅 *Servicio:* ${servicio_nombre}\n` +
        `👩‍🎨 *Especialista:* ${empleadaAsignada.nombre}\n` +
        `📅 *Fecha:* ${fechaLegible}\n` +
        `⏰ *Horario:* ${horaInicioFmt} a ${horaFinFmt}\n` +
        `⏱️ *Duración aprox:* ${duracion_minutos} min\n` +
        `💰 *Valor a pagar:* ${precioFmt}\n\n` +
        `📍 *Dirección:* Pereira, Cuba (Calle 66 bis #26-57)\n` +
        `🗺️ *Ubicación Maps:* https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8\n` +
        `🏢 *Lugar:* JL Mímate Nails - Spa de Uñas\n\n` +
        `───────────────\n` +
        `Si necesitas reprogramar o tienes alguna duda, puedes responder directamente a este mensaje.\n` +
        `¡Nos vemos pronto para consentirte reina! 💕🌸`;
    }

    // Enviar confirmación / solicitud de abono sin bloquear el HTTP response (evita timeouts en Vercel -> fallback sin WhatsApp).
    // Esperamos hasta 3.5 s para reportar resultado inmediato; si tarda o está reconectando, sigue en segundo plano con reintentos deduplicados.
    let waEnviado = false;
    try {
      const envioPromise = enviarMensajeWhatsApp(
        cleanPhone,
        voucherWhatsApp,
        complejo?.whatsapp_token,
        complejo?.whatsapp_phone_number_id
      ).catch((e: any) => {
        console.warn('No se pudo enviar WhatsApp inmediato:', e?.message || e);
        return false;
      });
      waEnviado = await Promise.race([
        envioPromise,
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
      ]);
    } catch (e: any) {
      console.warn('No se pudo enviar WhatsApp inmediato:', e.message);
    }

    notificarCambioReservas('INSERT', { id: reserva.id });

    res.status(201).json({
      success: true,
      reserva: hidratarHorarioRealReserva(reserva),
      esTraslapeParcial,
      empleada: empleadaAsignada.nombre,
      waEnviado,
      voucher: voucherWhatsApp,
      esPreReserva,
      esReagendamiento,
      abonoPrevio: abonoPrevioReconocido,
      montoAnticipoFijo: montoFijoConfigurado,
      anticipoRequerido: anticipoCalculado,
      saldoRestante,
      porcentajeAnticipo: montoFijoConfigurado,
      nequiNumero: complejo.nequi_numero || '321 961 0896',
      bancolombiaNumero: complejo.daviplata_numero || 'Ahorros 245-000123-88',
      titularCuenta: complejo.titular_cuenta || 'JL Mímate Nails Spa',
    });
  } catch (error: any) {
    console.error('Error creando reserva web en spa:', error);
    res.status(500).json({ error: error.message });
  }
});

// Métricas y Resumen Financiero filtradas por complejo (solo personal autorizado, con límite de filas)
app.get('/api/metricas', requireStaffAuth, async (req: Request, res: Response) => {
  try {
    const { complejo_id } = req.query;
    if (complejo_id && !esUUIDValido(String(complejo_id))) {
      return res.status(400).json({ error: 'ID de complejo inválido' });
    }
    let query = supabase
      .from('reservas')
      .select('estado, valor_total, valor_anticipo_requerido, canchas!inner(complejo_id)')
      .order('fecha_inicio', { ascending: false })
      .limit(2500);

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

// Tarea de recordatorios automáticos con cooldown anti-sobrecarga (admite GET y POST para cron jobs y keep-alive)
app.all('/api/cron/recordatorios', async (req: Request, res: Response) => {
  try {
    const ahoraMs = Date.now();
    if (ahoraMs - ultimoCronRecordatoriosMs < 30 * 1000) {
      return res.json({ status: 'ok', keep_alive: true, cached: true, timestamp: new Date().toISOString() });
    }
    ultimoCronRecordatoriosMs = ahoraMs;
    const resultado = await ReminderService.procesarRecordatoriosProximos();
    await BookingService.liberarReservasExpiradas();
    res.json({ status: 'ok', keep_alive: true, timestamp: new Date().toISOString(), ...resultado });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware defensivo de captura de errores HTTP (evita fuga de stack traces en producción)
app.use((err: any, req: Request, res: Response, _next: any) => {
  console.error('⚠️ Error capturado por el middleware de seguridad:', err?.message || err);
  if (!res.headersSent) {
    const statusCode = typeof err.status === 'number' ? err.status : (typeof err.statusCode === 'number' ? err.statusCode : 500);
    const mensaje = statusCode < 500 ? (err.message || 'Petición inválida') : 'Ha ocurrido un error interno controlado en el servidor.';
    res.status(statusCode).json({ error: mensaje });
  }
});

// Iniciar Servidor
app.listen(PORT, async () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📲 Vinculación de WhatsApp (QR) disponible en: http://localhost:${PORT}/qr`);
  console.log(`💬 Simulador del Bot listo en: POST http://localhost:${PORT}/api/bot/simulate`);
  console.log(`⏰ Cron Recordatorios listo en: POST http://localhost:${PORT}/api/cron/recordatorios`);

  await sincronizarPreciosCitasDiciembre();

  // Inicializar Baileys como proveedor único y exclusivo de WhatsApp
  try {
    await BaileysService.iniciar();
  } catch (baileysErr) {
    console.error('❌ Error iniciando servicio de Baileys:', baileysErr);
  }

  // Tarea periódica de recordatorios y limpieza de reservas expiradas
  setInterval(async () => {
    try {
      await ReminderService.procesarRecordatoriosProximos();
      await BookingService.liberarReservasExpiradas();
    } catch (e) {
      console.error('Error en tarea programada:', e);
    }
  }, 5 * 60 * 1000);

  // Keep-alive anti-suspensión para Render (ping externo cada 4 minutos)
  setInterval(() => {
    fetch('https://mimate-nails-api.onrender.com/api/baileys/diagnostico').catch(() => {});
  }, 4 * 60 * 1000);
});

// Manejo seguro de excepciones no controladas para evitar caídas del proceso
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Advertencia: Unhandled Rejection detectada:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado (uncaughtException):', error);
});
