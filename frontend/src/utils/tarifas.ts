/**
 * Utilidades de tarifas con cambio programado a partir del 1 de diciembre de 2026.
 * Cualquier cita agendada para el 1 de diciembre de 2026 en adelante aplica automáticamente
 * la nueva lista de precios, incluso si se reserva antes de esa fecha.
 */
export const FECHA_CAMBIO_TARIFAS = '2026-12-01';

export function obtenerHoyColombiaIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export function esTarifaDesdeDiciembre(fechaIso?: string | null): boolean {
  const ref = fechaIso ? fechaIso.trim().slice(0, 10) : obtenerHoyColombiaIso();
  return ref >= FECHA_CAMBIO_TARIFAS;
}

export function obtenerPrecioServicioParaFecha(
  servicio: { precio: number; precioDiciembre?: number } | null | undefined,
  fechaIso?: string | null
): number {
  if (!servicio) return 0;
  if (esTarifaDesdeDiciembre(fechaIso) && typeof servicio.precioDiciembre === 'number') {
    return servicio.precioDiciembre;
  }
  return servicio.precio;
}
