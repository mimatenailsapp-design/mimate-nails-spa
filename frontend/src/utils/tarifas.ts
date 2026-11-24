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

export const ALIAS_SERVICIOS_TARIFA: Record<string, string> = {
  'semi myp': 'semi manos y pies',
  'semi m y p': 'semi manos y pies',
  'myp': 'manos y pies',
  'm y p': 'manos y pies',
  'dippign': 'dipping',
  'diping': 'dipping',
  'rubber': 'base rubber',
};

export function normalizarNombreServicioTarifa(texto?: string | null): string {
  const limpio = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return ALIAS_SERVICIOS_TARIFA[limpio] || limpio;
}

export function obtenerFechaBogotaIso(fechaIso?: string | null): string {
  if (!fechaIso) return obtenerHoyColombiaIso();
  const limpio = fechaIso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;
  const d = new Date(limpio);
  if (isNaN(d.getTime())) return limpio.slice(0, 10);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export function obtenerPrecioServicioParaFecha(
  servicio: { precio: number; precioDiciembre?: number } | null | undefined,
  fechaIso?: string | null
): number {
  if (!servicio) return 0;
  const isoBogota = fechaIso ? obtenerFechaBogotaIso(fechaIso) : obtenerHoyColombiaIso();
  if (esTarifaDesdeDiciembre(isoBogota) && typeof servicio.precioDiciembre === 'number') {
    return servicio.precioDiciembre;
  }
  return servicio.precio;
}
