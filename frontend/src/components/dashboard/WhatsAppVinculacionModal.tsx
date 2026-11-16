import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconBrandWhatsapp,
  IconX,
  IconRefresh,
  IconExternalLink,
  IconDeviceMobile,
  IconCheck,
  IconAlertCircle,
  IconUnlink,
} from '@tabler/icons-react';

interface WhatsAppStatusData {
  status: 'CONECTADO' | 'ESPERANDO_QR' | 'DESCONECTADO' | 'CONECTANDO' | string;
  qr?: string | null;
  usuarioConectado?: string | null;
  tieneQr?: boolean;
  baileys?: {
    status?: string;
    qr?: string | null;
    usuarioConectado?: string | null;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (conectado: boolean) => void;
}

export const WhatsAppVinculacionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onStatusChange,
}) => {
  const [data, setData] = useState<WhatsAppStatusData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [procesandoRelink, setProcesandoRelink] = useState(false);
  const [errorFetch, setErrorFetch] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const consultarEstado = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setErrorFetch(null);
    try {
      const res = await fetch(`/api/baileys/status?_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error de conexión con el servidor');
      const json: WhatsAppStatusData = await res.json();
      setData(json);

      const statusActual = json.status || json.baileys?.status;
      const estaConectado = statusActual === 'CONECTADO';
      if (onStatusChange) onStatusChange(estaConectado);
    } catch (err: any) {
      if (!silencioso) setErrorFetch(err.message || 'No se pudo consultar el estado');
    } finally {
      if (!silencioso) setCargando(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      consultarEstado(false);
      // Auto-actualizar cada 3.5 segundos mientras el modal esté visible
      pollingRef.current = setInterval(() => {
        consultarEstado(true);
      }, 3500);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen]);

  const handleDesvincular = async () => {
    if (!window.confirm('¿Estás segura de desvincular la sesión actual de WhatsApp? El bot dejará de responder hasta que escanees un nuevo código QR.')) {
      return;
    }

    setProcesandoRelink(true);
    try {
      await fetch('/api/baileys/relink');
      setTimeout(() => {
        consultarEstado(false);
      }, 1500);
    } catch (e) {
      console.error('Error desvinculando WhatsApp:', e);
    } finally {
      setProcesandoRelink(false);
    }
  };

  if (!isOpen) return null;

  const statusActual = data?.status || data?.baileys?.status || 'CONSULTANDO';
  const qrActual = data?.qr || data?.baileys?.qr || null;
  const usuarioActual = data?.usuarioConectado || data?.baileys?.usuarioConectado || null;

  const estaConectado = statusActual === 'CONECTADO';
  const esperandoQr = statusActual === 'ESPERANDO_QR' && !!qrActual;

  const qrImageUrl = qrActual
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrActual)}`
    : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-[#F2C4D2] overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Encabezado */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border-b border-[#F2C4D2] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs">
                <IconBrandWhatsapp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-[#2D2529] font-serif text-base sm:text-lg flex items-center gap-2">
                  <span>WhatsApp del Spa</span>
                </h3>
                <p className="text-xs text-[#7D6870]">
                  Bot de agendamiento y confirmaciones 24/7
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/80 text-[#7D6870] hover:text-[#2D2529] transition cursor-pointer"
              title="Cerrar ventana"
            >
              <IconX className="w-5 h-5" />
            </button>
          </div>

          {/* Cuerpo */}
          <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
            {/* Badge de Estado Principal */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      estaConectado ? 'bg-emerald-400' : esperandoQr ? 'bg-amber-400' : 'bg-slate-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      estaConectado ? 'bg-emerald-500' : esperandoQr ? 'bg-amber-500' : 'bg-slate-500'
                    }`}
                  />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-[#7D6870] uppercase tracking-wider">
                    Estado de Conexión
                  </p>
                  <p className="text-sm font-bold text-[#2D2529]">
                    {estaConectado
                      ? 'Conectado y Operativo'
                      : esperandoQr
                      ? 'Esperando Escaneo del QR'
                      : cargando
                      ? 'Consultando servidor...'
                      : statusActual}
                  </p>
                </div>
              </div>

              <button
                onClick={() => consultarEstado(false)}
                disabled={cargando}
                className="p-2 rounded-xl bg-white hover:bg-slate-100 text-[#7D6870] border border-slate-200 transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                title="Actualizar estado ahora"
              >
                <IconRefresh className={`w-4 h-4 ${cargando ? 'animate-spin text-[#8C243B]' : ''}`} />
              </button>
            </div>

            {/* Error si no responde la API */}
            {errorFetch && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <IconAlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorFetch}</span>
              </div>
            )}

            {/* Caso 1: CONECTADO */}
            {estaConectado && (
              <div className="py-4 text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center border-2 border-emerald-300 shadow-xs">
                  <IconCheck className="w-9 h-9 stroke-[2.5]" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-base text-[#2D2529]">
                    ¡El bot está activo y conectado!
                  </h4>
                  <p className="text-xs text-[#7D6870] max-w-xs mx-auto">
                    El número vinculado está respondiendo mensajes entrantes, confirmando citas y enviando recordatorios.
                  </p>
                  {usuarioActual && (
                    <div className="inline-block mt-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-xs rounded-full font-bold">
                      📱 {usuarioActual.split(':')[0]}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Caso 2: ESPERANDO_QR */}
            {esperandoQr && qrImageUrl && (
              <div className="space-y-3 text-center">
                <div className="bg-[#FAF9F6] p-3 rounded-2xl border-2 border-dashed border-[#F2C4D2] flex flex-col items-center justify-center min-h-[260px] relative">
                  <img
                    src={qrImageUrl}
                    alt="Código QR WhatsApp"
                    className="w-56 h-56 rounded-xl shadow-xs object-contain"
                  />
                  <span className="text-[10px] text-[#7D6870] mt-2 font-medium">
                    🔄 Se actualiza automáticamente cada 3.5 segundos
                  </span>
                </div>

                {/* Pasos para escanear */}
                <div className="bg-[#FFF5F7] p-3.5 rounded-2xl border border-[#F2C4D2] text-left text-xs text-[#8C243B] space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5 text-xs text-[#731D30]">
                    <IconDeviceMobile className="w-4 h-4" />
                    Cómo vincular tu WhatsApp:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#7D6870]">
                    <li>Abre <strong>WhatsApp</strong> en tu teléfono.</li>
                    <li>Ve a <strong>Ajustes</strong> o <strong>Menú (⋮)</strong>.</li>
                    <li>Toca <strong>Dispositivos vinculados</strong>.</li>
                    <li>Toca <strong>Vincular un dispositivo</strong> y apunta la cámara al QR.</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Caso 3: CONECTANDO O GENERANDO QR */}
            {!estaConectado && !esperandoQr && (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-[#FFF5F7] text-[#8C243B] flex items-center justify-center border border-[#F2C4D2]">
                  <IconRefresh className="w-6 h-6 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-[#2D2529]">
                    Iniciando canal de comunicación...
                  </h4>
                  <p className="text-xs text-[#7D6870] max-w-xs mx-auto">
                    Preparando el código QR de WhatsApp con el servidor en Render. Por favor espera unos segundos.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pie de Acciones */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
            {/* Abrir en pestaña externa (de respaldo) */}
            <a
              href="/qr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8C243B] hover:text-[#731D30] hover:underline"
              title="Abrir página dedicada del QR"
            >
              <IconExternalLink className="w-3.5 h-3.5" />
              <span>Ver en pantalla completa</span>
            </a>

            <div className="flex items-center gap-2">
              {/* Botón de desvincular */}
              <button
                type="button"
                onClick={handleDesvincular}
                disabled={procesandoRelink}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                title="Desvincular sesión actual para escanear con otro teléfono"
              >
                <IconUnlink className="w-3.5 h-3.5" />
                <span>{procesandoRelink ? 'Desvinculando...' : 'Cambiar / Nuevo QR'}</span>
              </button>

              {/* Botón Cerrar */}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-[#2D2529] text-xs font-bold rounded-xl border border-slate-200 transition shadow-2xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
