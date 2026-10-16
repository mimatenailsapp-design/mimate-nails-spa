import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconClock, IconCheck, IconX, IconLoader2 } from '@tabler/icons-react';

export interface ConfigAnticipoData {
  exigeAnticipo: boolean;
  montoAnticipoFijo: number;
  porcentajeAnticipo?: number;
  nequiNumero: string;
  bancolombiaNumero: string;
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

export const ConfigAnticipoModal: React.FC<ConfigAnticipoModalProps> = ({
  abierto,
  onClose,
  configAnticipo,
  setConfigAnticipo,
  onSubmit,
  guardando,
}) => {
  return (
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚙️</span>
                <div>
                  <h3 className="font-bold text-base text-[#2D2529] font-serif">
                    Configuración del Spa
                  </h3>
                  <p className="text-[11px] text-[#7D6870]">
                    Horario de trabajo por temporada y anticipos web
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full text-[#7D6870] hover:text-[#2D2529] cursor-pointer"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 text-xs">
              {/* 1. SECCIÓN: HORARIO DE TRABAJO (EXTENSIÓN POR TEMPORADA) */}
              <div className="p-3.5 rounded-2xl bg-[#FFF5F7] border border-[#F2C4D2] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-[#8C243B] text-xs flex items-center gap-1.5">
                      <IconClock className="w-3.5 h-3.5 text-[#C74B66]" />
                      <span>Horario de Trabajo (Temporada)</span>
                    </p>
                    <p className="text-[11px] text-[#7D6870] leading-snug">
                      Modifica las horas de apertura y cierre para habilitar turnos más tempranos o tardíos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="font-bold text-[#7D6870] block mb-1">
                      Hora Apertura
                    </label>
                    <input
                      type="time"
                      value={configAnticipo.horaApertura || '08:00'}
                      onChange={(e) =>
                        setConfigAnticipo((prev) => ({
                          ...prev,
                          horaApertura: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white border border-[#F2C4D2] rounded-xl font-bold text-[#2D2529] outline-none focus:border-[#8C243B]"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[#7D6870] block mb-1">
                      Hora Cierre
                    </label>
                    <input
                      type="time"
                      value={configAnticipo.horaCierre || '19:00'}
                      onChange={(e) =>
                        setConfigAnticipo((prev) => ({
                          ...prev,
                          horaCierre: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white border border-[#F2C4D2] rounded-xl font-bold text-[#2D2529] outline-none focus:border-[#8C243B]"
                      required
                    />
                  </div>
                </div>
                <p className="text-[10px] text-[#7D6870]">
                  💡 <em>Los turnos ya reservados previamente se mantienen intactos. Las nuevas horas disponibles se recalculan al instante.</em>
                </p>
              </div>

              {/* 2. SWITCH PRINCIPAL ACTIVAR / DESACTIVAR ANTICIPO */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-bold text-[#8C243B] text-xs">
                    ¿Exigir anticipo para reservas?
                  </p>
                  <p className="text-[11px] text-[#7D6870] leading-snug">
                    {configAnticipo.exigeAnticipo
                      ? `Activado: Se pedirá abono fijo de $${(configAnticipo.montoAnticipoFijo || configAnticipo.porcentajeAnticipo || 20000).toLocaleString('es-CO')} y ventana de 60 min.`
                      : 'Desactivado: Citas 100% directas pagaderas en el spa.'}
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

              {/* SI ESTÁ ACTIVADO, MOSTRAR CAMPOS EDITABLES */}
              {configAnticipo.exigeAnticipo && (
                <div className="space-y-3 pt-1 border-t border-[#FCE8EF]">
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
                        className="w-full pl-7 pr-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-bold text-[#2D2529] outline-none focus:border-[#8C243B]"
                        placeholder="20000"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-[#7D6870] mt-1">
                      💡 <em>Valor fijo que cada clienta debe transferir para pre-confirmar su turno. El saldo restante se cancela en el spa.</em>
                    </p>
                  </div>

                  <div>
                    <label className="font-bold text-[#7D6870] block mb-1">
                      Número Nequi de recaudo
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
                      className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                      required
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[#7D6870] block mb-1">
                      Cuenta Bancolombia / Daviplata
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
                      className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                      required
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
                      placeholder="JL Mímate Nails Spa"
                      className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-medium text-[#2D2529] outline-none focus:border-[#8C243B]"
                      required
                    />
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#7D6870] leading-snug bg-slate-50 p-3 rounded-xl border border-slate-200">
                ℹ️ <strong>Cómo funciona:</strong> Al activar el anticipo, las clientas que reserven en la web verán el botón <em>"Confirmar pre-reserva"</em> con el abono fijo de ${(configAnticipo.montoAnticipoFijo || configAnticipo.porcentajeAnticipo || 20000).toLocaleString('es-CO')} y tendrán 60 minutos para transferir y enviar el soporte por WhatsApp. La IA auditará el comprobante y podrás aprobarlo o rechazarlo con 1 clic.
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
