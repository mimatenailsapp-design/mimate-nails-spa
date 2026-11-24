import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconClock, IconCheck, IconX, IconLoader2, IconChevronDown } from '@tabler/icons-react';
import { formatearHora12 } from '../../utils/formatoHora';

export interface ConfigAnticipoData {
  exigeAnticipo: boolean;
  montoAnticipoFijo?: number;
  porcentajeAnticipo?: number;
  nequiNumero: string;
  bancolombiaNumero: string;
  llaveNumero?: string;
  titularCuenta: string;
  horaApertura: string;
  horaCierre: string;
}

interface ConfigAnticipoModalProps {
  abierto: boolean;
  onClose: () => void;
  configAnticipo: ConfigAnticipoData;
  setConfigAnticipo: React.Dispatch<React.SetStateAction<ConfigAnticipoData>>;
  onSubmit: (e: React.FormEvent) => void;
  guardando: boolean;
}

const HORAS_BASE_CONFIG: string[] = (() => {
  const lista: string[] = [];
  for (let m = 5 * 60; m <= 23 * 60; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    lista.push(`${hh}:${mm}`);
  }
  return lista;
})();

export const ConfigAnticipoModal: React.FC<ConfigAnticipoModalProps> = ({
  abierto,
  onClose,
  configAnticipo,
  setConfigAnticipo,
  onSubmit,
  guardando,
}) => {
  const [menuAbierto, setMenuAbierto] = useState<'apertura' | 'cierre' | null>(null);
  const selectorHorarioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) {
      setMenuAbierto(null);
    }
  }, [abierto]);

  useEffect(() => {
    if (!menuAbierto) return;
    const handleClickAfuera = (event: MouseEvent | TouchEvent) => {
      if (
        selectorHorarioRef.current &&
        !selectorHorarioRef.current.contains(event.target as Node)
      ) {
        setMenuAbierto(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAbierto(null);
    };
    document.addEventListener('mousedown', handleClickAfuera);
    document.addEventListener('touchstart', handleClickAfuera);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAfuera);
      document.removeEventListener('touchstart', handleClickAfuera);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [menuAbierto]);

  const horaAperturaVal = (configAnticipo.horaApertura || '08:00').slice(0, 5);
  const horaCierreVal = (configAnticipo.horaCierre || '19:00').slice(0, 5);

  const opcionesApertura = useMemo(() => {
    const set = new Set(HORAS_BASE_CONFIG);
    if (horaAperturaVal) set.add(horaAperturaVal);
    return Array.from(set).sort();
  }, [horaAperturaVal]);

  const opcionesCierre = useMemo(() => {
    const set = new Set(HORAS_BASE_CONFIG);
    if (horaCierreVal) set.add(horaCierreVal);
    return Array.from(set).sort();
  }, [horaCierreVal]);

  return (
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 border border-[#F2C4D2] shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto overflow-x-hidden"
          >
            <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-2xl shrink-0">⚙️</span>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-[#2D2529] font-serif truncate">
                    Configuración del Spa
                  </h3>
                  <p className="text-[11px] text-[#7D6870] truncate">
                    Horario de trabajo por temporada y anticipos web
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full text-[#7D6870] hover:text-[#2D2529] cursor-pointer shrink-0"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 text-xs min-w-0">
              {/* 1. SECCIÓN: HORARIO DE TRABAJO (EXTENSIÓN POR TEMPORADA) */}
              <div
                ref={selectorHorarioRef}
                className="p-3.5 rounded-2xl bg-[#FFF5F7] border border-[#F2C4D2] space-y-2.5 min-w-0"
              >
                <div className="flex items-center justify-between min-w-0">
                  <div className="min-w-0">
                    <p className="font-bold text-[#8C243B] text-xs flex items-center gap-1.5">
                      <IconClock className="w-3.5 h-3.5 text-[#C74B66] shrink-0" />
                      <span>Horario de Trabajo (Temporada)</span>
                    </p>
                    <p className="text-[11px] text-[#7D6870] leading-snug">
                      Modifica las horas de apertura y cierre para habilitar turnos más tempranos o tardíos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 min-w-0">
                  {/* HORA APERTURA */}
                  <div className="bg-white p-2.5 rounded-xl border border-[#F2C4D2]/80 shadow-2xs min-w-0 relative">
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <label className="font-bold text-[#7D6870] text-xs truncate">
                        Hora Apertura
                      </label>
                      <span className="text-[11px] font-extrabold text-[#8C243B] bg-[#FFF5F7] px-2 py-0.5 rounded-md border border-[#F2C4D2] shrink-0">
                        {formatearHora12(horaAperturaVal)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setMenuAbierto((prev) => (prev === 'apertura' ? null : 'apertura'))
                      }
                      className={`w-full min-w-0 max-w-full box-border px-3 py-2 bg-[#FFF5F7]/50 hover:bg-[#FFF5F7] border rounded-xl font-bold text-[#2D2529] flex items-center justify-between gap-2 transition cursor-pointer text-sm ${
                        menuAbierto === 'apertura'
                          ? 'border-[#8C243B] bg-white ring-2 ring-[#C74B66]/20'
                          : 'border-[#F2C4D2] hover:border-[#8C243B]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate text-[#2D2529]">
                        <IconClock className="w-4 h-4 text-[#C74B66] shrink-0" />
                        <span className="truncate">{formatearHora12(horaAperturaVal)}</span>
                      </span>
                      <IconChevronDown
                        className={`w-4 h-4 text-[#8C243B] shrink-0 transition-transform duration-150 ${
                          menuAbierto === 'apertura' ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {menuAbierto === 'apertura' && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 max-h-48 overflow-y-auto space-y-0.5"
                        >
                          {opcionesApertura.map((h) => {
                            const seleccionada = h === horaAperturaVal;
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => {
                                  setConfigAnticipo((prev) => ({
                                    ...prev,
                                    horaApertura: h,
                                  }));
                                  setMenuAbierto(null);
                                }}
                                className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs cursor-pointer transition ${
                                  seleccionada
                                    ? 'bg-[#FCE8EF] text-[#8C243B] font-extrabold'
                                    : 'hover:bg-[#FFF5F7] text-[#2D2529] font-semibold'
                                }`}
                              >
                                <span>{formatearHora12(h)}</span>
                                {seleccionada && <IconCheck className="w-4 h-4 text-[#8C243B] shrink-0" />}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* HORA CIERRE */}
                  <div className="bg-white p-2.5 rounded-xl border border-[#F2C4D2]/80 shadow-2xs min-w-0 relative">
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <label className="font-bold text-[#7D6870] text-xs truncate">
                        Hora Cierre
                      </label>
                      <span className="text-[11px] font-extrabold text-[#8C243B] bg-[#FFF5F7] px-2 py-0.5 rounded-md border border-[#F2C4D2] shrink-0">
                        {formatearHora12(horaCierreVal)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setMenuAbierto((prev) => (prev === 'cierre' ? null : 'cierre'))
                      }
                      className={`w-full min-w-0 max-w-full box-border px-3 py-2 bg-[#FFF5F7]/50 hover:bg-[#FFF5F7] border rounded-xl font-bold text-[#2D2529] flex items-center justify-between gap-2 transition cursor-pointer text-sm ${
                        menuAbierto === 'cierre'
                          ? 'border-[#8C243B] bg-white ring-2 ring-[#C74B66]/20'
                          : 'border-[#F2C4D2] hover:border-[#8C243B]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate text-[#2D2529]">
                        <IconClock className="w-4 h-4 text-[#C74B66] shrink-0" />
                        <span className="truncate">{formatearHora12(horaCierreVal)}</span>
                      </span>
                      <IconChevronDown
                        className={`w-4 h-4 text-[#8C243B] shrink-0 transition-transform duration-150 ${
                          menuAbierto === 'cierre' ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {menuAbierto === 'cierre' && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 max-h-48 overflow-y-auto space-y-0.5"
                        >
                          {opcionesCierre.map((h) => {
                            const seleccionada = h === horaCierreVal;
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => {
                                  setConfigAnticipo((prev) => ({
                                    ...prev,
                                    horaCierre: h,
                                  }));
                                  setMenuAbierto(null);
                                }}
                                className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs cursor-pointer transition ${
                                  seleccionada
                                    ? 'bg-[#FCE8EF] text-[#8C243B] font-extrabold'
                                    : 'hover:bg-[#FFF5F7] text-[#2D2529] font-semibold'
                                }`}
                              >
                                <span>{formatearHora12(h)}</span>
                                {seleccionada && <IconCheck className="w-4 h-4 text-[#8C243B] shrink-0" />}
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <p className="text-[10px] text-[#7D6870]">
                  💡 <em>Los turnos ya reservados previamente se mantienen intactos. Las nuevas horas disponibles se recalculan al instante.</em>
                </p>
              </div>

              {/* 2. SWITCH PRINCIPAL ACTIVAR / DESACTIVAR ANTICIPO */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-bold text-[#8C243B] text-xs">
                    ¿Exigir anticipo para reservas?
                  </p>
                  <p className="text-[11px] text-[#7D6870] leading-snug">
                    {configAnticipo.exigeAnticipo
                      ? `Activado: Se pedirá abono fijo de $${(configAnticipo.montoAnticipoFijo || configAnticipo.porcentajeAnticipo || 20000).toLocaleString('es-CO')} y ventana de 30 min.`
                      : `Desactivado: Citas directas pagaderas en el spa (excepto citas para Diciembre, que siempre exigen el abono de $${(configAnticipo.montoAnticipoFijo || configAnticipo.porcentajeAnticipo || 20000).toLocaleString('es-CO')}).`}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={configAnticipo.exigeAnticipo}
                    onChange={(e) =>
                      setConfigAnticipo((prev) => ({
                        ...prev,
                        exigeAnticipo: e.target.checked,
                        montoAnticipoFijo: prev.montoAnticipoFijo || prev.porcentajeAnticipo || 20000,
                        porcentajeAnticipo: prev.montoAnticipoFijo || prev.porcentajeAnticipo || 20000,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8C243B]"></div>
                </label>
              </div>

              {/* CAMPOS EDITABLES DE MONTO Y CUENTAS (SIEMPRE VISIBLES POR REGLA DE DICIEMBRE) */}
              <div className="space-y-3 pt-1 border-t border-[#FCE8EF] min-w-0">
                {!configAnticipo.exigeAnticipo && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
                    🎄 <strong>Regla automática de Diciembre:</strong> Aunque el switch general esté desactivado, cualquier cita agendada para el mes de <strong>diciembre</strong> exigirá automáticamente el abono y las cuentas configuradas aquí abajo.
                  </div>
                )}

                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Tarifa fija de abono ($ COP por reserva)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-[#8C243B] text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      value={configAnticipo.montoAnticipoFijo || configAnticipo.porcentajeAnticipo || 20000}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setConfigAnticipo((prev) => ({
                          ...prev,
                          montoAnticipoFijo: val,
                          porcentajeAnticipo: val,
                        }));
                      }}
                      className="w-full min-w-0 pl-7 pr-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-bold text-[#2D2529] outline-none focus:border-[#8C243B]"
                      placeholder="20000"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-[#7D6870] mt-1">
                    💡 <em>Valor fijo que cada clienta debe transferir para pre-confirmar su turno (cuando el switch está activo o la cita es para diciembre). El saldo restante se cancela en el spa.</em>
                  </p>
                </div>

                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Número Nequi / Daviplata
                  </label>
                  <input
                    type="text"
                    value={configAnticipo.nequiNumero}
                    onChange={(e) =>
                      setConfigAnticipo((prev) => ({
                        ...prev,
                        nequiNumero: e.target.value,
                      }))
                    }
                    placeholder="321 961 0896"
                    className="w-full min-w-0 px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Cuenta Bancolombia
                  </label>
                  <input
                    type="text"
                    value={configAnticipo.bancolombiaNumero}
                    onChange={(e) =>
                      setConfigAnticipo((prev) => ({
                        ...prev,
                        bancolombiaNumero: e.target.value,
                      }))
                    }
                    placeholder="Ahorros 245-000123-88"
                    className="w-full min-w-0 px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Llave
                  </label>
                  <input
                    type="text"
                    value={configAnticipo.llaveNumero || ''}
                    onChange={(e) =>
                      setConfigAnticipo((prev) => ({
                        ...prev,
                        llaveNumero: e.target.value,
                      }))
                    }
                    placeholder="Número o identificador de llave"
                    className="w-full min-w-0 px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Titular de la cuenta
                  </label>
                  <input
                    type="text"
                    value={configAnticipo.titularCuenta}
                    onChange={(e) =>
                      setConfigAnticipo((prev) => ({
                        ...prev,
                        titularCuenta: e.target.value,
                      }))
                    }
                    placeholder="Nombre y apellido del titular"
                    className="w-full min-w-0 px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] text-[#7D6870] leading-snug bg-slate-50 p-3 rounded-xl border border-slate-200">
                ℹ️ <strong>Cómo funciona:</strong> Cuando aplica anticipo (switch activado o cita en el mes de <strong>Diciembre</strong>), las clientas verán el abono fijo de ${(configAnticipo.montoAnticipoFijo || configAnticipo.porcentajeAnticipo || 20000).toLocaleString('es-CO')} (o el total del servicio si este cuesta menos que el abono) y tendrán 30 minutos para transferir y enviar el soporte por WhatsApp.
              </p>

              {/* BOTONES */}
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
                  disabled={guardando}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#8C243B] to-[#C74B66] hover:from-[#731D30] hover:to-[#B03C54] text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {guardando ? (
                    <>
                      <IconLoader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <IconCheck className="w-4 h-4 stroke-[3]" />
                      <span>Guardar cambios</span>
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
