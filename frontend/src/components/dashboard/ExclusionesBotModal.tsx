import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconLock,
  IconX,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconAlertCircle,
  IconLoader2,
  IconBrandWhatsapp,
  IconCheck,
} from '@tabler/icons-react';

export interface ExclusionBotItem {
  telefono: string;
  nombre?: string;
}

export interface ExclusionesBotModalProps {
  abierto: boolean;
  onClose: () => void;
  nuevoTelExclusion: string;
  setNuevoTelExclusion: (t: string) => void;
  nuevoNombreExclusion: string;
  setNuevoNombreExclusion: (n: string) => void;
  errorExclusion: string | null;
  guardandoExclusion: boolean;
  handleAgregarExclusion: (e: React.FormEvent) => void;
  busquedaExclusion: string;
  setBusquedaExclusion: (b: string) => void;
  exclusionesBot: ExclusionBotItem[];
  cargandoExclusiones: boolean;
  solicitarReactivarBot: (tel: string, nombre?: string) => void;
  exclusionAReactivar: ExclusionBotItem | null;
  setExclusionAReactivar: (item: ExclusionBotItem | null) => void;
  reactivandoBot: boolean;
  handleConfirmarReactivarBot: () => void;
}

export const ExclusionesBotModal: React.FC<ExclusionesBotModalProps> = ({
  abierto,
  onClose,
  nuevoTelExclusion,
  setNuevoTelExclusion,
  nuevoNombreExclusion,
  setNuevoNombreExclusion,
  errorExclusion,
  guardandoExclusion,
  handleAgregarExclusion,
  busquedaExclusion,
  setBusquedaExclusion,
  exclusionesBot,
  cargandoExclusiones,
  solicitarReactivarBot,
  exclusionAReactivar,
  setExclusionAReactivar,
  reactivandoBot,
  handleConfirmarReactivarBot,
}) => {
  return (
    <>
      {/* MODAL PRINCIPAL: RESTRICCIÓN DE ACCESO AL BOT DE WHATSAPP */}
      <AnimatePresence>
        {abierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95"
            >
              {/* Encabezado del Modal */}
              <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-800 border border-amber-300 flex items-center justify-center font-bold text-lg shadow-2xs">
                    <IconLock className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-[#2D2529] font-serif">
                        Números Restringidos
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        Control de Acceso
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7D6870]">
                      El bot NO responderá ni enviará enlaces de reserva a estos números
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-full text-[#7D6870] hover:text-[#2D2529] hover:bg-[#FFF5F7] cursor-pointer transition"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              {/* Formulario para Agregar Nuevo Número Restringido */}
              <form onSubmit={handleAgregarExclusion} className="p-3.5 bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl space-y-2.5">
                <p className="text-xs font-bold text-[#8C243B] flex items-center gap-1.5">
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Restringir nuevo número</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-[#7D6870] block mb-1">
                      Teléfono WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej: 321 961 0896"
                      value={nuevoTelExclusion}
                      onChange={(e) => setNuevoTelExclusion(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#F2C4D2] rounded-xl font-mono text-xs text-[#2D2529] outline-none focus:border-[#8C243B] shadow-2xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#7D6870] block mb-1">
                      Motivo / Identificador (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Cancela seguido / No asiste"
                      value={nuevoNombreExclusion}
                      onChange={(e) => setNuevoNombreExclusion(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#F2C4D2] rounded-xl text-xs text-[#2D2529] outline-none focus:border-[#8C243B] shadow-2xs"
                    />
                  </div>
                </div>

                {errorExclusion && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <IconAlertCircle className="w-3.5 h-3.5" />
                    <span>{errorExclusion}</span>
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={guardandoExclusion}
                    className="px-4 py-2 bg-gradient-to-r from-[#8C243B] to-[#C74B66] hover:from-[#731D30] hover:to-[#B03C54] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                  >
                    {guardandoExclusion ? (
                      <>
                        <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <IconLock className="w-3.5 h-3.5" />
                        <span>Restringir Acceso al Bot</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Barra de Búsqueda y Contador */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="relative flex-1">
                  <IconSearch className="w-3.5 h-3.5 text-[#7D6870] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar en la lista..."
                    value={busquedaExclusion}
                    onChange={(e) => setBusquedaExclusion(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#FFF5F7]/70 border border-[#F2C4D2] rounded-xl text-xs text-[#2D2529] outline-none focus:border-[#8C243B]"
                  />
                </div>
                <span className="text-[11px] text-[#7D6870] font-semibold shrink-0">
                  {exclusionesBot.length} {exclusionesBot.length === 1 ? 'número restringido' : 'números restringidos'}
                </span>
              </div>

              {/* Lista de Números Restringidos */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px] max-h-[300px]">
                {cargandoExclusiones ? (
                  <div className="py-8 text-center text-[#7D6870] text-xs flex items-center justify-center gap-2">
                    <IconLoader2 className="w-4 h-4 animate-spin text-[#8C243B]" />
                    <span>Cargando lista...</span>
                  </div>
                ) : (() => {
                  const filtradas = exclusionesBot.filter((item) => {
                    const q = busquedaExclusion.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      item.telefono.includes(q) ||
                      (item.nombre && item.nombre.toLowerCase().includes(q))
                    );
                  });

                  if (filtradas.length === 0) {
                    return (
                      <div className="text-center py-8 text-[#7D6870] space-y-1 bg-[#FFF5F7]/40 rounded-2xl border border-dashed border-[#F2C4D2]">
                        <p className="text-xs font-bold text-[#8C243B]">
                          {busquedaExclusion ? 'Sin resultados para la búsqueda' : 'No hay números restringidos'}
                        </p>
                        <p className="text-[11px] opacity-75">
                          {busquedaExclusion ? 'Intenta con otro término' : 'El bot está atendiendo normalmente a los usuarios.'}
                        </p>
                      </div>
                    );
                  }

                  return filtradas.map((item) => {
                    const telLimpio = item.telefono.replace(/\D/g, '');
                    return (
                      <div
                        key={item.telefono}
                        className="p-3 bg-white border border-[#F2C4D2] rounded-2xl flex items-center justify-between gap-3 shadow-2xs hover:border-[#8C243B] transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                            🔒
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#2D2529] truncate font-serif">
                              {item.nombre || 'Número restringido'}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-[#7D6870]">
                              <span className="font-mono">{item.telefono}</span>
                              <a
                                href={`https://wa.me/${telLimpio}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-0.5"
                                title="Abrir chat en WhatsApp"
                              >
                                <IconBrandWhatsapp className="w-3 h-3" />
                                <span>Abrir</span>
                              </a>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => solicitarReactivarBot(item.telefono, item.nombre)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 active:scale-95 shadow-2xs"
                          title="Levantar la restricción y permitir que el bot vuelva a responder"
                        >
                          <IconRefresh className="w-3 h-3 text-emerald-700" />
                          <span>Reactivar Bot</span>
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Pie del Modal */}
              <div className="pt-2 border-t border-[#FCE8EF] flex items-center justify-between text-[11px] text-[#7D6870]">
                <span>💡 Los números en esta lista no podrán solicitar enlaces ni agendar por el bot.</span>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold rounded-xl transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL SECUNDARIO: CONFIRMAR REACTIVACIÓN DEL BOT */}
      <AnimatePresence>
        {exclusionAReactivar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
            >
              <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold text-lg shadow-2xs">
                    <IconRefresh className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#2D2529] font-serif">
                      ¿Reactivar el Bot para este Número?
                    </h3>
                    <p className="text-[11px] text-[#7D6870]">
                      Se levantará la restricción de agendamiento automático
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExclusionAReactivar(null)}
                  className="p-1.5 rounded-full text-[#7D6870] hover:text-[#2D2529] hover:bg-[#FFF5F7] cursor-pointer transition"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#7D6870]">Identificador / Motivo:</span>
                  <span className="font-bold text-sm text-[#2D2529] font-serif">
                    {exclusionAReactivar.nombre || 'Número restringido'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#7D6870]">Teléfono WhatsApp:</span>
                  <span className="font-mono font-bold text-[#8C243B] bg-white px-2 py-0.5 rounded-lg border border-[#F2C4D2]">
                    📱 {exclusionAReactivar.telefono}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2.5">
                <IconCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Al reactivar el bot, este número volverá a recibir respuestas automáticas y podrá agendar citas por WhatsApp.
                </span>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setExclusionAReactivar(null)}
                  disabled={reactivandoBot}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarReactivarBot}
                  disabled={reactivandoBot}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {reactivandoBot ? (
                    <>
                      <IconLoader2 className="w-4 h-4 animate-spin" />
                      <span>Reactivando...</span>
                    </>
                  ) : (
                    <>
                      <IconRefresh className="w-4 h-4" />
                      <span>Sí, Reactivar Bot</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
