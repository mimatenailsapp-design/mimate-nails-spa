import React, { useState, useEffect, useRef } from 'react';
import { formatearHora12, formatearRangoHoras12 } from '../../utils/formatoHora';
import {
  IconClock,
  IconBrandWhatsapp,
  IconCheck,
  IconX,
  IconLockOpen,
  IconPlus,
  IconTrash,
  IconPencil,
  IconLoader2,
  IconChevronDown,
} from '@tabler/icons-react';

/** Cita agendada desde el panel que aún espera la confirmación de la clienta por el recordatorio de WhatsApp. */
export function esPorConfirmar(cita: { estado?: string; notas?: string | null }): boolean {
  const n = cita.notas || '';
  return cita.estado === 'confirmada' && n.includes('[POR_CONFIRMAR_CLIENTA]') && !n.includes('[CONFIRMADA_POR_CLIENTA]');
}

export interface OpcionHorarioCita {
  horaInicio: string;
  horaFin: string;
  esActual: boolean;
  esTraslapeParcial: boolean;
}

// Función auxiliar para extraer adicionales de las notas de la cita
export function extraerAdicionalesCita(notas?: string): number[] {
  if (!notas) return [];
  const matches = notas.matchAll(/\[ADICIONAL:(\d+)\]/g);
  const result: number[] = [];
  for (const m of matches) {
    const val = parseInt(m[1], 10);
    if (!isNaN(val) && val > 0) {
      result.push(val);
    }
  }
  return result;
}

export function sumarAdicionalesCita(notas?: string): number {
  return extraerAdicionalesCita(notas).reduce((acc, curr) => acc + curr, 0);
}

export interface PopoverCitaData {
  cita: {
    id: string;
    cancha_id: string;
    fecha_inicio: string;
    fecha_fin: string;
    estado: string;
    valor_total: number;
    valor_anticipo_requerido?: number;
    notas?: string;
    canchas?: {
      id?: string;
      nombre: string;
    };
    clientes?: {
      nombre: string;
      telefono_wa: string;
    };
  };
  rect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    x?: number;
    y?: number;
    toJSON?: () => any;
  } | DOMRect;
}

export interface DetalleCitaPopoverProps {
  popoverCita: PopoverCitaData | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  esAdmin: boolean;
  perfilActual: { id: string; nombre: string; rol: string; canchaId?: string } | null;
  canchas: Array<{ id: string; nombre: string }>;
  ahora: Date;
  obtenerHoraMinutosBogota: (iso: string) => string;
  obtenerDuracionMinutosCita: (inicio: string, fin?: string) => number;
  obtenerDetalleBloqueo: (cita: any) => { motivo: string; por: string };
  obtenerNombreClienta: (cita: any) => string;
  obtenerServicioCita: (cita: any) => string;
  handleDesbloquearHorario: (id: string, hora: string) => void;
  handleAprobarAnticipo: (id: string, nombre: string) => void;
  handleRechazarAnticipo: (id: string, nombre: string) => void;
  handleCambiarEstado: (id: string, estado: string) => void;
  procesandoAccionAnticipo: string | null;
  onClose: () => void;
  onAbrirModalAdicional?: (cita: any) => void;
  onEliminarAdicional?: (cita: any) => void;
  obtenerHorariosDisponiblesCita?: (cita: any) => OpcionHorarioCita[];
  onCambiarHoraCita?: (cita: any, nuevaHoraInicio: string) => Promise<void>;
  onCambioModoEdicionHora?: (activo: boolean) => void;
}

export const DetalleCitaPopover: React.FC<DetalleCitaPopoverProps> = ({
  popoverCita,
  onMouseEnter,
  onMouseLeave,
  esAdmin,
  perfilActual,
  canchas,
  ahora,
  obtenerHoraMinutosBogota,
  obtenerDuracionMinutosCita,
  obtenerDetalleBloqueo,
  obtenerNombreClienta,
  obtenerServicioCita,
  handleDesbloquearHorario,
  handleAprobarAnticipo,
  handleRechazarAnticipo,
  handleCambiarEstado,
  procesandoAccionAnticipo,
  onClose,
  onAbrirModalAdicional,
  onEliminarAdicional,
  obtenerHorariosDisponiblesCita,
  onCambiarHoraCita,
  onCambioModoEdicionHora,
}) => {
  const [editandoHora, setEditandoHora] = useState(false);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [guardandoHora, setGuardandoHora] = useState(false);

  useEffect(() => {
    onCambioModoEdicionHora?.(Boolean(popoverCita && (editandoHora || guardandoHora)));
    return () => {
      onCambioModoEdicionHora?.(false);
    };
  }, [popoverCita, editandoHora, guardandoHora]);
  const [errorHora, setErrorHora] = useState<string | null>(null);
  const listaHorasRef = useRef<HTMLDivElement | null>(null);

  const citaIdActual = popoverCita?.cita?.id || '';
  const citaInicioActual = popoverCita?.cita?.fecha_inicio || '';

  useEffect(() => {
    setEditandoHora(false);
    setGuardandoHora(false);
    setErrorHora(null);
    if (popoverCita?.cita?.fecha_inicio) {
      setHoraSeleccionada(obtenerHoraMinutosBogota(popoverCita.cita.fecha_inicio));
    }
  }, [citaIdActual]);

  useEffect(() => {
    if (!editandoHora && popoverCita?.cita?.fecha_inicio) {
      setHoraSeleccionada(obtenerHoraMinutosBogota(popoverCita.cita.fecha_inicio));
    }
  }, [citaInicioActual, editandoHora]);

  useEffect(() => {
    if (!editandoHora || !listaHorasRef.current) return;
    const timer = requestAnimationFrame(() => {
      const container = listaHorasRef.current;
      if (!container) return;
      const activo = container.querySelector('[data-hora-activa="true"]') as HTMLElement | null;
      if (activo) {
        container.scrollTop = Math.max(0, activo.offsetTop - container.clientHeight / 2 + activo.offsetHeight / 2);
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [editandoHora]);

  if (!popoverCita) return null;

  const { cita, rect } = popoverCita;
  const horaInicio = obtenerHoraMinutosBogota(cita.fecha_inicio);
  const horaFin = cita.fecha_fin ? obtenerHoraMinutosBogota(cita.fecha_fin) : '';
  const durMin = obtenerDuracionMinutosCita(cita.fecha_inicio, cita.fecha_fin);
  const esBloqueada = cita.estado === 'bloqueada';
  const { motivo: motivoBloqueo, por: bloqueadoPor } = obtenerDetalleBloqueo(cita);
  const nombreClienta = obtenerNombreClienta(cita);
  const servicioNombre = obtenerServicioCita(cita);
  const telLimpio = String(cita.clientes?.telefono_wa || '').replace(/\D/g, '');
  const canchaCita = canchas.find((c) => c.id === cita.cancha_id);
  const puedeDesbloquear = esAdmin || (perfilActual?.canchaId === cita.cancha_id);
  const totalAdicionales = sumarAdicionalesCita(cita.notas);

  const ahoraMs = ahora.getTime();
  const inicioMs = new Date(cita.fecha_inicio).getTime();
  const finMs = cita.fecha_fin ? new Date(cita.fecha_fin).getTime() : inicioMs + 45 * 60000;
  const puedeEditarHora =
    !esBloqueada &&
    cita.estado !== 'completada' &&
    cita.estado !== 'cancelada' &&
    finMs > ahoraMs &&
    Boolean(onCambiarHoraCita && obtenerHorariosDisponiblesCita);

  const opcionesHorario: OpcionHorarioCita[] =
    editandoHora && obtenerHorariosDisponiblesCita ? obtenerHorariosDisponiblesCita(cita) : [];

  const anchoPopover = 328;
  const altoAprox = editandoHora ? 470 : 330;
  let posX = rect.right + 12;
  if (typeof window !== 'undefined' && posX + anchoPopover > window.innerWidth - 12) {
    posX = Math.max(12, rect.left - anchoPopover - 12);
  }
  if (typeof window !== 'undefined' && window.innerWidth < 360) {
    posX = Math.max(8, (window.innerWidth - Math.min(anchoPopover, window.innerWidth - 16)) / 2);
  }
  let posY = rect.top;
  if (typeof window !== 'undefined' && posY + altoAprox > window.innerHeight - 12) {
    posY = Math.max(12, window.innerHeight - altoAprox - 12);
  }

  const estaEnAtencion =
    !esBloqueada &&
    cita.estado !== 'completada' &&
    cita.estado !== 'cancelada' &&
    ahoraMs >= inicioMs &&
    ahoraMs < finMs;

  const handleGuardarNuevaHora = async () => {
    if (!onCambiarHoraCita || !horaSeleccionada || horaSeleccionada === horaInicio) {
      setEditandoHora(false);
      return;
    }
    setGuardandoHora(true);
    setErrorHora(null);
    try {
      await onCambiarHoraCita(cita, horaSeleccionada);
      setEditandoHora(false);
    } catch (err: any) {
      setErrorHora(err?.message || 'No se pudo cambiar la hora de la cita.');
    } finally {
      setGuardandoHora(false);
    }
  };

  return (
    <div
      className="fixed z-50 pointer-events-auto transition-all duration-150 max-w-[calc(100vw-16px)]"
      style={{ left: `${posX}px`, top: `${posY}px`, width: `${anchoPopover}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => {
        if (!editandoHora && !guardandoHora) {
          onMouseLeave();
        }
      }}
    >
      <div className="bg-white rounded-2xl border-2 border-[#8C243B]/25 shadow-2xl overflow-y-auto max-h-[calc(100vh-24px)] p-4 space-y-3 backdrop-blur-md ring-8 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera del Popover */}
        <div className="flex items-start justify-between gap-2 border-b border-[#F2C4D2]/70 pb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shadow-2xs shrink-0 ${
                esBloqueada
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-[#FFF5F7] text-[#8C243B] border border-[#F2C4D2]'
              }`}
            >
              {esBloqueada ? '🔒' : '💅'}
            </div>
            <div className="min-w-0">
              <h4
                className="font-bold text-sm text-[#2D2529] font-serif truncate"
                title={esBloqueada ? motivoBloqueo : nombreClienta}
              >
                {esBloqueada ? motivoBloqueo : nombreClienta}
              </h4>
              <p className="text-[11px] text-[#7D6870] truncate">
                {esBloqueada
                  ? `Bloqueado por: ${bloqueadoPor}`
                  : canchaCita
                  ? `💅 ${canchaCita.nombre}`
                  : 'JL Mímate Nails'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            {estaEnAtencion ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300 shadow-2xs animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                EN ATENCIÓN
              </span>
            ) : (
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                  esBloqueada
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago'
                    ? cita.notas?.includes('[COMPROBANTE_DUDOSO_REVISION_MANUAL]') ||
                      cita.notas?.includes('[COMPROBANTE_VALIDO_IA]')
                      ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                    : cita.estado === 'completada'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : cita.estado === 'cancelada'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : esPorConfirmar(cita)
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                }`}
              >
                {esBloqueada ? 'BLOQUEADO' : esPorConfirmar(cita) ? 'POR CONFIRMAR' : cita.estado.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Horario y Duración (con edición directa de hora) */}
        <div
          className={`bg-[#FFF5F7] rounded-xl p-2.5 border transition-colors text-xs ${
            editandoHora
              ? 'border-[#8C243B]/60 ring-2 ring-[#FCE8EF]'
              : puedeEditarHora
              ? 'border-[#F2C4D2]/80 hover:border-[#C74B66] hover:bg-[#FCE8EF]/45'
              : 'border-[#F2C4D2]/80'
          }`}
        >
          <div
            role={puedeEditarHora ? 'button' : undefined}
            tabIndex={puedeEditarHora ? 0 : undefined}
            onClick={() => {
              if (!puedeEditarHora || guardandoHora) return;
              setErrorHora(null);
              setHoraSeleccionada(horaInicio);
              setEditandoHora((prev) => !prev);
            }}
            onKeyDown={(e) => {
              if (!puedeEditarHora || guardandoHora) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setErrorHora(null);
                setHoraSeleccionada(horaInicio);
                setEditandoHora((prev) => !prev);
              }
            }}
            className={`flex items-center justify-between gap-2 ${
              puedeEditarHora ? 'cursor-pointer select-none' : ''
            }`}
            title={puedeEditarHora ? 'Clic para cambiar la hora de esta cita' : undefined}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <IconClock className="w-4 h-4 text-[#C74B66] shrink-0" />
              <span className="font-mono font-bold text-[#8C243B] truncate">
                {formatearRangoHoras12(horaInicio, horaFin)}
              </span>
              {puedeEditarHora && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#8C243B] bg-white/90 border border-[#F2C4D2] px-1.5 py-0.5 rounded-md shrink-0">
                  {editandoHora ? (
                    <IconChevronDown className="w-3 h-3 rotate-180 transition-transform" />
                  ) : (
                    <IconPencil className="w-3 h-3 text-[#C74B66]" />
                  )}
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold text-[#7D6870] bg-white px-2 py-0.5 rounded-lg border border-[#F2C4D2] shrink-0">
              {durMin} minutos
            </span>
          </div>

          {editandoHora && puedeEditarHora && (
            <div className="mt-2.5 pt-2.5 border-t border-[#F2C4D2]/80 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-[#8C243B]">Selecciona nueva hora:</span>
                <span className="text-[10px] text-[#7D6870]">Misma duración ({durMin} min)</span>
              </div>

              {opcionesHorario.length === 0 ? (
                <div className="p-2 text-center text-[11px] text-[#8C243B] bg-white rounded-xl border border-[#F2C4D2]">
                  No hay otros horarios disponibles en este día.
                </div>
              ) : (
                <div
                  ref={listaHorasRef}
                  className="bg-white border border-[#F2C4D2] rounded-xl p-1 max-h-40 overflow-y-auto space-y-0.5 shadow-inner"
                >
                  {opcionesHorario.map((op) => {
                    const seleccionada = op.horaInicio === horaSeleccionada;
                    return (
                      <button
                        key={op.horaInicio}
                        type="button"
                        data-hora-activa={seleccionada ? 'true' : undefined}
                        disabled={guardandoHora}
                        onClick={() => {
                          setHoraSeleccionada(op.horaInicio);
                          setErrorHora(null);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                          seleccionada
                            ? 'bg-[#8C243B] text-white font-bold shadow-2xs'
                            : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                        }`}
                      >
                        <span className="font-mono text-[11px]">
                          {formatearRangoHoras12(op.horaInicio, op.horaFin)}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {op.esActual && (
                            <span
                              className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                                seleccionada
                                  ? 'bg-white/20 text-white'
                                  : 'bg-[#FCE8EF] text-[#8C243B]'
                              }`}
                            >
                              Actual
                            </span>
                          )}
                          {!op.esActual && op.esTraslapeParcial && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                seleccionada
                                  ? 'bg-amber-300/25 text-amber-100'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              Traslape
                            </span>
                          )}
                          {seleccionada && <IconCheck className="w-3.5 h-3.5 shrink-0" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {errorHora && (
                <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                  {errorHora}
                </p>
              )}

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  disabled={guardandoHora}
                  onClick={() => {
                    setEditandoHora(false);
                    setErrorHora(null);
                    setHoraSeleccionada(horaInicio);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-[#7D6870] border border-[#F2C4D2] text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={guardandoHora || !horaSeleccionada || horaSeleccionada === horaInicio}
                  onClick={handleGuardarNuevaHora}
                  className="flex-1 py-1.5 rounded-lg bg-[#8C243B] hover:bg-[#721C30] text-white text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {guardandoHora ? (
                    <>
                      <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <IconCheck className="w-3.5 h-3.5" />
                      <span>Guardar hora</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detalle del Servicio, Adicionales y Valor */}
        {!esBloqueada && (
          <div className="space-y-1.5 text-xs bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[#7D6870]">Servicio:</span>
              <span className="font-bold text-[#2D2529] text-right truncate max-w-[180px]">
                {servicioNombre}
              </span>
            </div>

            {/* Desglose de Adicional (Opción B) */}
            {totalAdicionales > 0 && (
              <div className="flex items-center justify-between bg-amber-50/80 px-2 py-1 rounded-lg border border-amber-200/80">
                <span className="text-amber-900 font-semibold flex items-center gap-1 text-[11px]">
                  <span>✨ Adicional</span>
                  {onEliminarAdicional && cita.estado !== 'cancelada' && (
                    <button
                      type="button"
                      onClick={() => onEliminarAdicional(cita)}
                      className="text-rose-500 hover:text-rose-700 ml-1 p-0.5 rounded hover:bg-rose-100 transition cursor-pointer"
                      title="Quitar adicional"
                    >
                      <IconTrash className="w-3 h-3" />
                    </button>
                  )}
                </span>
                <span className="font-black font-mono text-amber-900 text-xs">
                  +${totalAdicionales.toLocaleString('es-CO')}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-[#7D6870] font-medium">Valor Total:</span>
              <span className="font-black font-mono text-[#8C243B] text-sm">
                ${Number(cita.valor_total || 25000).toLocaleString('es-CO')}
              </span>
            </div>

            {/* Botón para Añadir Adicional (Habilitado para todos los perfiles) */}
            {onAbrirModalAdicional && cita.estado !== 'cancelada' && (
              <button
                type="button"
                onClick={() => onAbrirModalAdicional(cita)}
                className="w-full mt-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 hover:from-pink-100 hover:to-rose-100 text-[#8C243B] border border-[#F2C4D2] text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <IconPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Agregar Adicional</span>
              </button>
            )}

            {cita.clientes?.telefono_wa && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-[#7D6870]">Teléfono:</span>
                <span className="font-mono text-xs text-[#2D2529] font-medium">
                  {cita.clientes.telefono_wa}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Botones de Acción Inmediata */}
        <div className="pt-2 border-t border-[#F2C4D2]/70 flex items-center gap-2">
          {esBloqueada ? (
            puedeDesbloquear && (
              <button
                type="button"
                onClick={() => {
                  handleDesbloquearHorario(cita.id, horaInicio);
                  onClose();
                }}
                className="w-full py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <IconLockOpen className="w-3.5 h-3.5" />
                <span>Desbloquear Horario</span>
              </button>
            )
          ) : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago' ? (
            <>
              {telLimpio && (
                <a
                  href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                    nombreClienta
                  )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20al%20abono%20de%20tu%20cita%20de%20las%20${formatearHora12(horaInicio)}.`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs"
                  title="Escribir por WhatsApp"
                >
                  <IconBrandWhatsapp className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
              )}

              {esAdmin && (
                <>
                  <button
                    type="button"
                    disabled={procesandoAccionAnticipo === cita.id}
                    onClick={() => {
                      handleAprobarAnticipo(cita.id, nombreClienta);
                      onClose();
                    }}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Aprobar abono recibido y confirmar la cita"
                  >
                    <IconCheck className="w-3.5 h-3.5" />
                    <span>Aprobar Abono</span>
                  </button>

                  <button
                    type="button"
                    disabled={procesandoAccionAnticipo === cita.id}
                    onClick={() => {
                      handleRechazarAnticipo(cita.id, nombreClienta);
                      onClose();
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                    title="Rechazar y liberar cupo"
                  >
                    <IconX className="w-3.5 h-3.5" />
                    <span>Rechazar</span>
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              {telLimpio && (
                <a
                  href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                    nombreClienta
                  )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20las%20${formatearHora12(horaInicio)}.`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs"
                  title="Escribir por WhatsApp"
                >
                  <IconBrandWhatsapp className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
              )}

              {cita.estado !== 'completada' && cita.estado !== 'cancelada' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleCambiarEstado(cita.id, 'completada');
                      onClose();
                    }}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                  >
                    <IconCheck className="w-3.5 h-3.5" />
                    <span>Completada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCambiarEstado(cita.id, 'cancelada');
                      onClose();
                    }}
                    className="flex-1 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                    title="Cancelar cita y liberar el horario inmediatamente"
                  >
                    <IconX className="w-3.5 h-3.5" />
                    <span>Cancelar</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
