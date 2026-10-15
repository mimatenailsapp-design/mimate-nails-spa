import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconLock,
  IconX,
  IconClock,
  IconCheck,
  IconChevronDown,
  IconAlertCircle,
  IconLoader2,
} from '@tabler/icons-react';

interface BloquearHorarioModalProps {
  abierto: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  esAdmin: boolean;
  perfilActual: { id: string; nombre: string; rol: string; canchaId?: string } | null;
  canchas: Array<{ id: string; nombre: string }>;
  bloquearManicuristaId: string;
  setBloquearManicuristaId: (id: string) => void;
  menuBloquearManiAbierto: boolean;
  setMenuBloquearManiAbierto: (open: boolean) => void;
  bloquearFecha: string;
  setBloquearFecha: (f: string) => void;
  hoyStr: string;
  bloquearHorasSeleccionadas: string[];
  setBloquearHorasSeleccionadas: React.Dispatch<React.SetStateAction<string[]>>;
  horasOpcionesBloqueoDinamicas: string[];
  horasYaPasadasBloqueo: Set<string>;
  horasYaOcupadasBloqueo: Set<string>;
  toggleHoraBloqueo: (hora: string) => void;
  bloquearMotivo: string;
  setBloquearMotivo: (m: string) => void;
  bloquearMotivoPersonalizado: string;
  setBloquearMotivoPersonalizado: (m: string) => void;
  errorBloquear: string | null;
  guardandoBloqueo: boolean;
}

export const BloquearHorarioModal: React.FC<BloquearHorarioModalProps> = ({
  abierto,
  onClose,
  onSubmit,
  esAdmin,
  perfilActual,
  canchas,
  bloquearManicuristaId,
  setBloquearManicuristaId,
  menuBloquearManiAbierto,
  setMenuBloquearManiAbierto,
  bloquearFecha,
  setBloquearFecha,
  hoyStr,
  bloquearHorasSeleccionadas,
  setBloquearHorasSeleccionadas,
  horasOpcionesBloqueoDinamicas,
  horasYaPasadasBloqueo,
  horasYaOcupadasBloqueo,
  toggleHoraBloqueo,
  bloquearMotivo,
  setBloquearMotivo,
  bloquearMotivoPersonalizado,
  setBloquearMotivoPersonalizado,
  errorBloquear,
  guardandoBloqueo,
}) => {
  return (
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-lg w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Encabezado del Modal */}
            <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-base shadow-2xs">
                  <IconLock className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#2D2529] font-serif">
                    Bloquear Horario de Citas
                  </h3>
                  <p className="text-[11px] text-[#7D6870]">
                    Las clientas no podrán agendar turnos en las horas seleccionadas
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

            <form onSubmit={onSubmit} className="space-y-4 text-xs">
              {/* 1. SELECCIÓN DE ESPECIALISTA */}
              {esAdmin ? (
                <div className="relative">
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Especialista a Bloquear
                  </label>
                  <button
                    type="button"
                    onClick={() => setMenuBloquearManiAbierto(!menuBloquearManiAbierto)}
                    className="w-full px-3.5 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center text-[10px]">
                        {bloquearManicuristaId === 'todas' ? '👑' : '💅'}
                      </span>
                      <span>
                        {bloquearManicuristaId === 'todas'
                          ? '👑 Todas las Especialistas (Cierre Spa)'
                          : canchas.find((c) => c.id === bloquearManicuristaId)?.nombre ||
                            'Seleccionar Especialista'}
                      </span>
                    </span>
                    <IconChevronDown
                      className={`w-4 h-4 text-[#8C243B] transition-transform ${
                        menuBloquearManiAbierto ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {menuBloquearManiAbierto && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 space-y-1"
                      >
                        <div
                          onClick={() => {
                            setBloquearManicuristaId('todas');
                            setMenuBloquearManiAbierto(false);
                          }}
                          className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition ${
                            bloquearManicuristaId === 'todas'
                              ? 'bg-amber-100 text-amber-900 font-bold'
                              : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                          }`}
                        >
                          <span className="flex items-center gap-2 font-bold">
                            <span>👑</span>
                            <span>Todas las Especialistas (Cierre Spa)</span>
                          </span>
                          {bloquearManicuristaId === 'todas' && (
                            <IconCheck className="w-4 h-4 text-amber-800" />
                          )}
                        </div>

                        {canchas.map((c, i) => {
                          const estaSel = c.id === bloquearManicuristaId;
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                setBloquearManicuristaId(c.id);
                                setMenuBloquearManiAbierto(false);
                              }}
                              className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition ${
                                estaSel
                                  ? 'bg-[#FCE8EF] text-[#8C243B] font-bold'
                                  : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-white border border-[#F2C4D2] flex items-center justify-center text-[10px]">
                                  {i === 0 ? '👑' : `M${i + 1}`}
                                </span>
                                <span>{c.nombre}</span>
                              </div>
                              {estaSel && <IconCheck className="w-4 h-4 text-[#8C243B]" />}
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="p-3 bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-[#7D6870]">Tu Puesto de Trabajo</p>
                    <p className="font-bold text-sm text-[#2D2529] font-serif flex items-center gap-1.5 mt-0.5">
                      <span>💅</span>
                      <span>{perfilActual?.nombre}</span>
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#8C243B] border border-[#F2C4D2]">
                    Bloqueo Personal
                  </span>
                </div>
              )}

              {/* 2. FECHA DEL BLOQUEO */}
              <div>
                <label className="font-bold text-[#7D6870] block mb-1">Fecha</label>
                <input
                  type="date"
                  min={hoyStr}
                  value={bloquearFecha}
                  onChange={(e) => {
                    const nuevaFecha = e.target.value;
                    if (nuevaFecha < hoyStr) return;
                    setBloquearFecha(nuevaFecha);
                    setBloquearHorasSeleccionadas((prev) => {
                      const ahoraMs = Date.now();
                      return prev.filter((h) => {
                        if (nuevaFecha === hoyStr) {
                          const slotMs = new Date(`${nuevaFecha}T${h}:00-05:00`).getTime();
                          return slotMs > ahoraMs;
                        }
                        return true;
                      });
                    });
                  }}
                  className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-bold text-[#2D2529] outline-none cursor-pointer hover:border-[#8C243B]"
                  required
                />
              </div>

              {/* 3. SELECCIÓN DE HORAS (PÍLDORAS MÚLTIPLES O 1 HORA) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-[#7D6870]">
                    Horas a Bloquear ({bloquearHorasSeleccionadas.length} marcadas)
                  </label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        setBloquearHorasSeleccionadas(
                          horasOpcionesBloqueoDinamicas.filter(
                            (h) => !horasYaOcupadasBloqueo.has(h) && !horasYaPasadasBloqueo.has(h)
                          )
                        )
                      }
                      className="text-[#8C243B] font-bold hover:underline cursor-pointer"
                    >
                      Todo el día
                    </button>
                    <span className="text-[#7D6870] opacity-40">|</span>
                    <button
                      type="button"
                      onClick={() => setBloquearHorasSeleccionadas([])}
                      className="text-[#7D6870] hover:underline cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-[#7D6870] mb-2">
                  Toca las horas del día que deseas apartar o dejar libres de reservas:
                </p>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {horasOpcionesBloqueoDinamicas.map((h) => {
                    const yaPasada = horasYaPasadasBloqueo.has(h);
                    const yaOcupada = horasYaOcupadasBloqueo.has(h);
                    const deshabilitada = yaPasada || yaOcupada;
                    const estaMarcada = bloquearHorasSeleccionadas.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        disabled={deshabilitada}
                        onClick={() => !deshabilitada && toggleHoraBloqueo(h)}
                        className={`py-2 px-2 rounded-xl font-mono text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border ${
                          deshabilitada
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            : estaMarcada
                            ? 'bg-amber-500 text-white border-amber-600 shadow-2xs scale-102 ring-2 ring-amber-300 cursor-pointer'
                            : 'bg-[#FFF5F7] hover:bg-[#FCE8EF] text-[#2D2529] border-[#F2C4D2] cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <IconClock className="w-3 h-3 opacity-75" />
                          <span>{h}</span>
                        </div>
                        {yaPasada ? (
                          <span className="text-[9px] font-sans font-bold text-slate-400 uppercase tracking-tighter">
                            Ya pasó
                          </span>
                        ) : yaOcupada ? (
                          <span className="text-[9px] font-sans font-bold text-slate-500 uppercase tracking-tighter">
                            Ocupada
                          </span>
                        ) : estaMarcada ? (
                          <IconCheck className="w-3.5 h-3.5 stroke-[3]" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. MOTIVO DEL BLOQUEO */}
              <div>
                <label className="font-bold text-[#7D6870] block mb-1.5">
                  Motivo o Razón
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    '🍱 Almuerzo',
                    '🏃‍♀️ Diligencia personal',
                    '☕ Descanso / Pausa',
                    '📚 Capacitación',
                    '🏥 Cita médica',
                    '🛠️ Mantenimiento puesto',
                  ].map((mot) => {
                    const estaSel = bloquearMotivo === mot && !bloquearMotivoPersonalizado;
                    return (
                      <button
                        key={mot}
                        type="button"
                        onClick={() => {
                          setBloquearMotivo(mot);
                          setBloquearMotivoPersonalizado('');
                        }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
                          estaSel
                            ? 'bg-[#8C243B] text-white border-[#8C243B] shadow-2xs'
                            : 'bg-white text-[#7D6870] border-[#F2C4D2] hover:border-[#8C243B]'
                        }`}
                      >
                        {mot}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="text"
                  placeholder="O escribe otro motivo personalizado..."
                  value={bloquearMotivoPersonalizado}
                  onChange={(e) => setBloquearMotivoPersonalizado(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[#2D2529] font-medium outline-none focus:border-[#8C243B]"
                />
              </div>

              {/* ERROR SI LO HUBIERE */}
              {errorBloquear && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5 font-medium">
                  <IconAlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorBloquear}</span>
                </div>
              )}

              {/* BOTONES DE ACCIÓN */}
              <div className="flex gap-2 pt-2 border-t border-[#FCE8EF]">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoBloqueo || bloquearHorasSeleccionadas.length === 0}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {guardandoBloqueo ? (
                    <>
                      <IconLoader2 className="w-4 h-4 animate-spin" />
                      <span>Bloqueando...</span>
                    </>
                  ) : (
                    <>
                      <IconLock className="w-4 h-4 stroke-[2.5]" />
                      <span>
                        Bloquear {bloquearHorasSeleccionadas.length}{' '}
                        {bloquearHorasSeleccionadas.length === 1 ? 'hora' : 'horas'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
