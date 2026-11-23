/**
 * Utilidades para formatear horas en formato estándar de 12 horas (ej. "6:30 pm", "9:00 am")
 * Reemplaza el horario militar de 24 horas en todas las vistas de clientas y administradoras/manicuristas.
 */

export function formatearHora12(hora?: number | string | null): string {
  if (hora === undefined || hora === null || hora === '') return '';

  // Caso 1: número entero de hora (ej: 8 -> "8 a.m.", 12 -> "Mediodía", 13 -> "1 p.m.")
  if (typeof hora === 'number') {
    if (hora === 12) return 'Mediodía';
    const periodo = hora < 12 ? 'a.m.' : 'p.m.';
    const h12 = hora % 12 === 0 ? 12 : hora % 12;
    return `${h12} ${periodo}`;
  }

  const str = String(hora).trim();

  // Caso 2: Fecha/Hora ISO completa (ej: "2026-11-22T18:30:00-05:00" o "2026-11-22 18:30:00")
  if (str.includes('T') || str.includes('Z')) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const hhmm = d.toLocaleTimeString('es-CO', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        return formatearHora12(hhmm);
      }
    } catch {}
  }

  // Caso 3: String HH:mm o HH:mm:ss (ej: "18:30", "09:00", "9:00", "18:30:00")
  const partes = str.split(':');
  if (partes.length >= 2) {
    const h = parseInt(partes[0], 10);
    const m = parseInt(partes[1], 10);
    if (!isNaN(h)) {
      const periodo = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const mm = isNaN(m) ? '00' : String(m).padStart(2, '0');
      return `${h12}:${mm} ${periodo}`;
    }
  }

  return str;
}

/**
 * Formatea un rango de horas (inicio y fin) en formato 12 horas.
 * Ejemplos:
 *   formatearRangoHoras12("18:30", "19:50") -> "6:30 pm - 7:50 pm"
 *   formatearRangoHoras12("09:00", "10:30") -> "9:00 am - 10:30 am"
 *   formatearRangoHoras12("18:30", "19:50", true) -> "6:30 - 7:50 pm"
 */
export function formatearRangoHoras12(
  inicio?: string | null,
  fin?: string | null,
  compacto: boolean = false
): string {
  if (!inicio) return '';
  const inicio12 = formatearHora12(inicio);
  if (!fin) return inicio12;
  const fin12 = formatearHora12(fin);

  if (compacto) {
    const partesIni = inicio12.split(' ');
    const partesFin = fin12.split(' ');
    if (partesIni.length === 2 && partesFin.length === 2 && partesIni[1] === partesFin[1]) {
      return `${partesIni[0]} - ${partesFin[0]} ${partesFin[1]}`;
    }
  }

  return `${inicio12} - ${fin12}`;
}
