import React from 'react';
import {
  IconClock,
  IconBrandWhatsapp,
  IconCheck,
  IconX,
  IconLockOpen,
} from '@tabler/icons-react';

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
}) => {
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

  const anchoPopover = 320;
  const altoAprox = 320;
  let posX = rect.right + 12;
  if (typeof window !== 'undefined' && posX + anchoPopover > window.innerWidth - 12) {
    posX = Math.max(12, rect.left - anchoPopover - 12);
  }
  let posY = rect.top;
  if (typeof window !== 'undefined' && posY + altoAprox > window.innerHeight - 12) {
    posY = Math.max(12, window.innerHeight - altoAprox - 12);
  }

  const ahoraMs = ahora.getTime();
  const inicioMs = new Date(cita.fecha_inicio).getTime();
  const finMs = cita.fecha_fin ? new Date(cita.fecha_fin).getTime() : inicioMs + 45 * 60000;
  const estaEnAtencion =
    !esBloqueada &&
    cita.estado !== 'completada' &&
    cita.estado !== 'cancelada' &&
    ahoraMs >= inicioMs &&
    ahoraMs < finMs;

  return (
    <div
      className="fixed z-50 pointer-events-auto transition-all duration-150"
      style={{ left: `${posX}px`, top: `${posY}px`, width: `${anchoPopover}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-white rounded-2xl border-2 border-[#8C243B]/25 shadow-2xl overflow-hidden p-4 space-y-3 backdrop-blur-md ring-8 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
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
                    : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                }`}
              >
                {esBloqueada ? 'BLOQUEADO' : cita.estado.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Horario y Duración */}
        <div className="bg-[#FFF5F7] rounded-xl p-2.5 border border-[#F2C4D2]/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <IconClock className="w-4 h-4 text-[#C74B66]" />
            <span className="font-mono font-bold text-[#8C243B]">
              {horaInicio} - {horaFin}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-[#7D6870] bg-white px-2 py-0.5 rounded-lg border border-[#F2C4D2]">
            {durMin} minutos
          </span>
        </div>

        {/* Detalle del Servicio y Valor */}
        {!esBloqueada && (
          <div className="space-y-1.5 text-xs bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[#7D6870]">Servicio:</span>
              <span className="font-bold text-[#2D2529] text-right truncate max-w-[180px]">
                {servicioNombre}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#7D6870]">Valor Total:</span>
              <span className="font-black font-mono text-[#8C243B] text-sm">
                ${Number(cita.valor_total || 25000).toLocaleString('es-CO')}
              </span>
            </div>
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
                  )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20al%20abono%20de%20tu%20cita%20de%20las%20${horaInicio}.`}
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
                  )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20las%20${horaInicio}.`}
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
