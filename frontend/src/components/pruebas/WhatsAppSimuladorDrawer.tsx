import React, { useState, useRef, useEffect } from 'react';
import {
  ADMIN_MASTER_PIN_HASH,
  HASH_ACCESO_JHOANA,
  HASH_ACCESO_LILI,
  STAFF_DEFAULT_PIN_HASH,
  hashPin,
  obtenerHeadersStaff,
} from '../../utils/security';
import {
  IconBrandWhatsapp,
  IconX,
  IconSend,
  IconRefresh,
  IconAdjustmentsHorizontal,
  IconLock,
  IconFlask,
  IconCheck,
  IconChecks,
} from '@tabler/icons-react';

interface InteractiveOption {
  id: string;
  title: string;
  description?: string;
}

interface MensajeSimulado {
  id: string;
  remitente: 'clienta' | 'bot' | 'sistema';
  texto: string;
  hora: string;
  opciones?: InteractiveOption[];
  urlRedirect?: string;
}

const HASHES_ADMIN_SIM = new Set([
  ADMIN_MASTER_PIN_HASH,
  HASH_ACCESO_LILI,
  HASH_ACCESO_JHOANA,
  STAFF_DEFAULT_PIN_HASH,
]);

const COMPLEJO_MIMATE_ID = '3bd1708c-21de-42a8-a529-d7c91fd41ed2';
const ATAJOS_RAPIDOS = ['HOLA', 'Precios', 'Horarios', 'Ubicación', 'Confirmar', 'Reagendar', 'Cancelar'];
const STORAGE_KEY_TOKEN = 'mimate_preview_sim_token';

function horaActualCorta(): string {
  return new Date().toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function resolverUrlEnPreview(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('mimate-nails') && parsed.hostname.endsWith('.vercel.app')) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function renderTextoWhatsApp(texto: string): React.ReactNode {
  const lineas = texto.split('\n');
  const tokenRegex = /(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_)/g;

  return lineas.map((linea, idxLinea) => {
    const partes = linea.split(tokenRegex);
    return (
      <React.Fragment key={idxLinea}>
        {partes.map((parte, idxParte) => {
          if (!parte) return null;
          if (/^https?:\/\//i.test(parte)) {
            const href = resolverUrlEnPreview(parte);
            return (
              <a
                key={idxParte}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#027EB5] underline break-all hover:opacity-80"
              >
                {parte}
              </a>
            );
          }
          if (parte.startsWith('*') && parte.endsWith('*') && parte.length > 2) {
            return (
              <strong key={idxParte} className="font-semibold text-[#111B21]">
                {parte.slice(1, -1)}
              </strong>
            );
          }
          if (parte.startsWith('_') && parte.endsWith('_') && parte.length > 2) {
            return (
              <em key={idxParte} className="italic">
                {parte.slice(1, -1)}
              </em>
            );
          }
          return <React.Fragment key={idxParte}>{parte}</React.Fragment>;
        })}
        {idxLinea < lineas.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

interface Props {
  abiertoInicial?: boolean;
}

export const WhatsAppSimuladorDrawer: React.FC<Props> = ({ abiertoInicial = false }) => {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [nombreClienta, setNombreClienta] = useState('Clienta Prueba');
  const [telefonoSim, setTelefonoSim] = useState('573009999999');
  const [inputTexto, setInputTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [tokenAdmin, setTokenAdmin] = useState<string>(() => {
    const headersStaff = obtenerHeadersStaff();
    if (headersStaff['X-Spa-Auth'] && HASHES_ADMIN_SIM.has(headersStaff['X-Spa-Auth'])) {
      return headersStaff['X-Spa-Auth'];
    }
    try {
      const guardado = sessionStorage.getItem(STORAGE_KEY_TOKEN) || '';
      if (HASHES_ADMIN_SIM.has(guardado)) return guardado;
    } catch {}
    return '';
  });

  const [pinInput, setPinInput] = useState('');
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [verificandoPin, setVerificandoPin] = useState(false);

  const [mensajes, setMensajes] = useState<MensajeSimulado[]>([
    {
      id: 'welcome-sys',
      remitente: 'sistema',
      texto:
        'Modo WhatsApp Simulado activo. Los mensajes se procesan con el bot real sin enviar nada al número vinculado.',
      hora: horaActualCorta(),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tokenAdmin && abierto) {
      const headersStaff = obtenerHeadersStaff();
      if (headersStaff['X-Spa-Auth'] && HASHES_ADMIN_SIM.has(headersStaff['X-Spa-Auth'])) {
        setTokenAdmin(headersStaff['X-Spa-Auth']);
      }
    }
  }, [abierto, tokenAdmin]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensajes, enviando, abierto]);

  const handleDesbloquearPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setVerificandoPin(true);
    setErrorPin(null);
    try {
      const hashed = await hashPin(pinInput);
      if (HASHES_ADMIN_SIM.has(hashed)) {
        setTokenAdmin(hashed);
        try {
          sessionStorage.setItem(STORAGE_KEY_TOKEN, hashed);
        } catch {}
        setPinInput('');
      } else {
        setErrorPin('PIN administrativo incorrecto.');
      }
    } catch {
      setErrorPin('No fue posible validar el PIN.');
    } finally {
      setVerificandoPin(false);
    }
  };

  const enviarMensaje = async (textoAEnviar: string) => {
    const limpio = textoAEnviar.trim();
    if (!limpio || enviando) return;

    const telLimpio = telefonoSim.replace(/\D/g, '') || '573009999999';
    const nuevoMsgClienta: MensajeSimulado = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      remitente: 'clienta',
      texto: limpio,
      hora: horaActualCorta(),
    };

    setMensajes((prev) => [...prev, nuevoMsgClienta]);
    setInputTexto('');
    setEnviando(true);

    try {
      const headers = obtenerHeadersStaff({ 'Content-Type': 'application/json' });
      if (!headers['X-Spa-Auth'] && tokenAdmin) {
        headers['X-Spa-Auth'] = tokenAdmin;
      }

      const res = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          telefono: telLimpio,
          nombre: nombreClienta.trim() || 'Clienta Prueba',
          mensaje: limpio,
          complejo_id: COMPLEJO_MIMATE_ID,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setTokenAdmin('');
          try {
            sessionStorage.removeItem(STORAGE_KEY_TOKEN);
          } catch {}
        }
        setMensajes((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            remitente: 'sistema',
            texto: data.error || `Error ${res.status} al simular respuesta del bot.`,
            hora: horaActualCorta(),
          },
        ]);
        return;
      }

      const opciones: InteractiveOption[] = [];
      if (data.interactive?.buttons && Array.isArray(data.interactive.buttons)) {
        for (const b of data.interactive.buttons) {
          opciones.push({ id: b.id || b.title, title: b.title });
        }
      }
      if (data.interactive?.sections && Array.isArray(data.interactive.sections)) {
        for (const sec of data.interactive.sections) {
          for (const row of sec.rows || []) {
            opciones.push({ id: row.id || row.title, title: row.title, description: row.description });
          }
        }
      }

      setMensajes((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          remitente: 'bot',
          texto: data.respuesta_bot || '(El bot no devolvió texto para este mensaje)',
          hora: horaActualCorta(),
          opciones: opciones.length > 0 ? opciones : undefined,
          urlRedirect: data.urlRedirect || undefined,
        },
      ]);
    } catch (err: any) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `net-${Date.now()}`,
          remitente: 'sistema',
          texto: `No se pudo conectar con /api/bot/simulate (${err?.message || 'error de red'}).`,
          hora: horaActualCorta(),
        },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  const handleReiniciarChat = async () => {
    setMensajes([
      {
        id: `reset-${Date.now()}`,
        remitente: 'sistema',
        texto: 'Sesión simulada reiniciada. Ningún mensaje se envía a WhatsApp real.',
        hora: horaActualCorta(),
      },
    ]);
    if (tokenAdmin) {
      await enviarMensaje('reiniciar');
    }
  };

  return (
    <>
      {/* Banner superior discreto indicando ambiente de pruebas */}
      <div className="fixed top-0 left-0 right-0 z-[90] bg-[#075E54] text-white text-[11px] sm:text-xs font-semibold px-3 py-1.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 truncate">
          <IconFlask className="w-3.5 h-3.5 shrink-0 text-[#25D366]" />
          <span className="truncate">
            AMBIENTE DE PRUEBAS · WhatsApp Simulado disponible (sin envíos al número real)
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="ml-2 shrink-0 px-2.5 py-0.5 rounded-full bg-[#25D366] text-[#053B34] font-bold hover:bg-[#20BD5A] transition cursor-pointer"
        >
          {abierto ? 'Ocultar Chat' : 'Abrir WhatsApp Simulado'}
        </button>
      </div>

      {/* Espaciador para que el banner fijo no tape la cabecera */}
      <div className="h-7 sm:h-8" />

      {/* Botón flotante estilo WhatsApp (abajo a la derecha) */}
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="fixed bottom-5 right-5 z-[95] flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#25D366] text-white shadow-xl hover:bg-[#1EBE5D] active:scale-95 transition cursor-pointer border-2 border-white"
          title="Abrir WhatsApp Simulado de pruebas"
        >
          <IconBrandWhatsapp className="w-6 h-6" />
          <span className="text-xs font-bold tracking-wide hidden sm:inline">WhatsApp Simulado</span>
        </button>
      )}

      {/* Ventana tipo WhatsApp */}
      {abierto && (
        <div className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-[100] w-full sm:w-[400px] h-[85vh] sm:h-[620px] max-h-[90vh] bg-[#ECE5DD] sm:rounded-2xl shadow-2xl border border-[#075E54]/30 flex flex-col overflow-hidden">
          {/* Header verde WhatsApp */}
          <div className="bg-[#075E54] text-white px-3.5 py-3 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center text-[#053B34] font-bold shrink-0">
                <IconBrandWhatsapp className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight truncate">JL Mímate Nails · Bot</p>
                <p className="text-[11px] text-emerald-200 truncate">
                  {enviando ? 'escribiendo...' : `Simulado · ${nombreClienta} (${telefonoSim})`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setMostrarConfig((v) => !v)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="Cambiar nombre/teléfono simulado"
              >
                <IconAdjustmentsHorizontal className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleReiniciarChat}
                className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="Reiniciar conversación simulada"
              >
                <IconRefresh className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="Cerrar simulador"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Panel opcional de configuración de clienta simulada */}
          {mostrarConfig && (
            <div className="bg-[#F0F2F5] border-b border-gray-200 px-3.5 py-2.5 grid grid-cols-2 gap-2 text-xs shrink-0">
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Nombre simulado</label>
                <input
                  type="text"
                  value={nombreClienta}
                  onChange={(e) => setNombreClienta(e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs focus:outline-none focus:border-[#075E54]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Teléfono ficticio</label>
                <input
                  type="text"
                  value={telefonoSim}
                  onChange={(e) => setTelefonoSim(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  className="w-full px-2 py-1 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs focus:outline-none focus:border-[#075E54]"
                />
              </div>
            </div>
          )}

          {/* Bloqueo por PIN admin si aún no está autenticado */}
          {!tokenAdmin ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#EFEAE2]">
              <div className="w-12 h-12 rounded-full bg-[#075E54]/10 text-[#075E54] flex items-center justify-center mb-3">
                <IconLock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-[#111B21] mb-1">Acceso de Administradora</h4>
              <p className="text-xs text-[#54656F] mb-4 max-w-[280px]">
                Ingresa tu PIN de administradora para probar el bot en modo simulado sin usar WhatsApp real.
              </p>
              <form onSubmit={handleDesbloquearPin} className="w-full max-w-[260px] space-y-2.5">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="PIN administrativo"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-center tracking-widest focus:outline-none focus:border-[#075E54]"
                  autoFocus
                />
                {errorPin && <p className="text-xs text-red-600 font-medium">{errorPin}</p>}
                <button
                  type="submit"
                  disabled={verificandoPin || !pinInput.trim()}
                  className="w-full py-2 rounded-xl bg-[#075E54] text-white text-xs font-bold hover:bg-[#064C44] disabled:opacity-50 transition cursor-pointer"
                >
                  {verificandoPin ? 'Validando...' : 'Activar Simulador'}
                </button>
              </form>
            </div>
          ) : (
            <>
              {/* Área de mensajes */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5"
                style={{
                  backgroundImage:
                    'radial-gradient(rgba(7, 94, 84, 0.06) 1px, transparent 1px)',
                  backgroundSize: '18px 18px',
                }}
              >
                {mensajes.map((msg) => {
                  if (msg.remitente === 'sistema') {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="bg-[#FFF8C5] text-[#5C4B16] text-[11px] px-3 py-1.5 rounded-lg shadow-2xs max-w-[90%] text-center border border-amber-200/70">
                          {msg.texto}
                        </div>
                      </div>
                    );
                  }

                  const esClienta = msg.remitente === 'clienta';
                  return (
                    <div key={msg.id} className={`flex ${esClienta ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 shadow-xs text-[13px] leading-relaxed ${
                          esClienta
                            ? 'bg-[#DCF8C6] text-[#111B21] rounded-tr-none'
                            : 'bg-white text-[#111B21] rounded-tl-none'
                        }`}
                      >
                        <div className="break-words">{renderTextoWhatsApp(msg.texto)}</div>

                        {msg.urlRedirect && (
                          <a
                            href={resolverUrlEnPreview(msg.urlRedirect)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FCE8EF] text-[#8C243B] text-xs font-bold hover:bg-[#F9D5E2] transition"
                          >
                            Abrir enlace en Preview ↗
                          </a>
                        )}

                        {msg.opciones && msg.opciones.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
                            {msg.opciones.map((op) => (
                              <button
                                key={op.id}
                                type="button"
                                onClick={() => enviarMensaje(op.title)}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#F0F2F5] hover:bg-[#E2E8F0] text-[#075E54] text-xs font-semibold transition cursor-pointer"
                              >
                                <div>{op.title}</div>
                                {op.description && (
                                  <div className="text-[10px] font-normal text-gray-500">{op.description}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-[#667781]">
                          <span>{msg.hora}</span>
                          {esClienta && (
                            <IconChecks className="w-3.5 h-3.5 text-[#53BDEB]" />
                          )}
                          {!esClienta && <IconCheck className="w-3 h-3 opacity-0" />}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {enviando && (
                  <div className="flex justify-start">
                    <div className="bg-white text-[#667781] text-xs px-3 py-2 rounded-xl rounded-tl-none shadow-xs italic">
                      escribiendo...
                    </div>
                  </div>
                )}
              </div>

              {/* Atajos rápidos */}
              <div className="bg-[#F0F2F5] px-2.5 py-1.5 border-t border-gray-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {ATAJOS_RAPIDOS.map((atajo) => (
                  <button
                    key={atajo}
                    type="button"
                    disabled={enviando}
                    onClick={() => enviarMensaje(atajo)}
                    className="shrink-0 px-2.5 py-1 rounded-full bg-white border border-gray-300 text-[11px] font-semibold text-[#075E54] hover:bg-[#E7F8EF] disabled:opacity-50 transition cursor-pointer"
                  >
                    {atajo}
                  </button>
                ))}
              </div>

              {/* Input de escritura */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviarMensaje(inputTexto);
                }}
                className="bg-[#F0F2F5] px-2.5 py-2 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={inputTexto}
                  onChange={(e) => setInputTexto(e.target.value)}
                  placeholder="Escribe un mensaje simulado..."
                  disabled={enviando}
                  className="flex-1 px-3.5 py-2 rounded-full bg-white border border-gray-200 text-sm text-[#111B21] focus:outline-none focus:border-[#075E54]"
                />
                <button
                  type="submit"
                  disabled={enviando || !inputTexto.trim()}
                  className="w-10 h-10 rounded-full bg-[#075E54] text-white flex items-center justify-center hover:bg-[#064C44] disabled:opacity-50 transition cursor-pointer shrink-0"
                  title="Enviar mensaje simulado"
                >
                  <IconSend className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
};
