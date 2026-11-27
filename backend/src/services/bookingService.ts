import { supabase } from '../config/supabase.js';
import { BaileysService } from './baileysService.js';
import { notificarCambioReservas } from './realtimeService.js';

export interface Complejo {
  id: string;
  slug?: string;
  tipo_negocio?: 'deportes' | 'barberia' | 'belleza_unas' | 'salud' | string;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  telefono_whatsapp: string;
  whatsapp_phone_number_id?: string;
  whatsapp_token?: string;
  nequi_numero?: string;
  daviplata_numero?: string;
  hora_apertura?: string;
  hora_cierre?: string;
  titular_cuenta?: string;
  porcentaje_anticipo_minimo?: number;
  monto_anticipo_fijo?: number;
}

/**
 * Obtiene la tarifa fija del abono para el spa.
 * Extrae el valor de la columna monto_anticipo_fijo si existe,
 * o de whatsapp_phone_number_id (JSON o número), o retorna 20.000 COP por defecto.
 */
export function getMontoAnticipoFijo(complejo: any): number {
  if (complejo?.monto_anticipo_fijo !== undefined && complejo?.monto_anticipo_fijo !== null) {
    const val = Number(complejo.monto_anticipo_fijo);
    if (!isNaN(val) && val > 0) return val;
  }
  // Persistencia fija segura en Postgres: whatsapp_phone_number_id (nunca sobreescrito por Baileys)
  if (complejo?.whatsapp_phone_number_id) {
    const raw = String(complejo.whatsapp_phone_number_id).trim();
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.monto && !isNaN(Number(parsed.monto))) return Number(parsed.monto);
      } catch {}
    }
    const num = Number(raw.split('|')[0]);
    if (!isNaN(num) && num > 0) return num;
  }
  if (complejo?.whatsapp_token && typeof complejo.whatsapp_token === 'string') {
    try {
      if (complejo.whatsapp_token.startsWith('{')) {
        const parsed = JSON.parse(complejo.whatsapp_token);
        if (parsed?.monto_anticipo_fijo && !isNaN(Number(parsed.monto_anticipo_fijo))) {
          return Number(parsed.monto_anticipo_fijo);
        }
      } else {
        const num = Number(complejo.whatsapp_token);
        if (!isNaN(num) && num > 0) return num;
      }
    } catch {}
  }
  return 20000;
}

/**
 * Obtiene el número o código de Llave configurado en el spa (Bre-B / Transfiya / Llaves)
 */
export function getLlaveNumero(complejo: any): string {
  if (complejo?.whatsapp_phone_number_id) {
    const raw = String(complejo.whatsapp_phone_number_id).trim();
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.llave) return String(parsed.llave).trim();
      } catch {}
    }
    if (raw.includes('|')) {
      const parts = raw.split('|');
      if (parts.length > 1 && parts[1].trim()) return parts[1].trim();
    }
  }
  if (complejo?.titular_cuenta && complejo.titular_cuenta.includes('[LLAVE:')) {
    const match = complejo.titular_cuenta.match(/\[LLAVE:\s*([^\]]+)\]/i);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

/**
 * Obtiene el nombre del titular limpio de cualquier metadato
 */
export function getTitularLimpio(titular?: string | null): string {
  if (!titular) return 'JL Mímate Nails Spa';
  return titular.replace(/\[LLAVE:[^\]]+\]/gi, '').trim() || 'JL Mímate Nails Spa';
}

/**
 * Genera el bloque de texto con las cuentas oficiales configuradas para enviar a las clientas por WhatsApp
 */
export function formatearCuentasRecaudoMensaje(complejo: any): string {
  const nequi = (complejo?.nequi_numero || '').trim();
  const bancolombia = (complejo?.daviplata_numero || '').trim();
  const llave = getLlaveNumero(complejo);
  const titular = getTitularLimpio(complejo?.titular_cuenta);

  const lineas: string[] = [];
  if (nequi) lineas.push(`• *Número Nequi / Daviplata:* ${nequi}`);
  if (bancolombia) lineas.push(`• *Cuenta Bancolombia:* ${bancolombia}`);
  if (llave) lineas.push(`• *Llave:* ${llave}`);
  lineas.push(`• *Titular de la cuenta:* ${titular}`);

  return lineas.join('\n');
}

/**
 * Determina si una fecha (YYYY-MM-DD o timestamp ISO) corresponde al mes de diciembre (mes 12).
 * En temporada de diciembre SIEMPRE se exige anticipo aunque el switch general esté desactivado.
 */
export function esFechaDiciembre(fecha?: string | Date | null): boolean {
  if (!fecha) return false;
  if (typeof fecha === 'string') {
    const limpio = fecha.trim();
    const matchIso = limpio.match(/^\d{4}-(\d{2})-\d{2}/);
    if (matchIso) {
      return matchIso[1] === '12';
    }
    const d = new Date(limpio);
    if (!isNaN(d.getTime())) {
      const mesCol = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        month: '2-digit',
      }).format(d);
      return mesCol === '12';
    }
    return false;
  }
  if (fecha instanceof Date && !isNaN(fecha.getTime())) {
    const mesCol = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      month: '2-digit',
    }).format(fecha);
    return mesCol === '12';
  }
  return false;
}

/**
 * Determina si una fecha está cerrada por ser domingo regular.
 * REGLA DE TEMPORADA: Todos los domingos del mes de DICIEMBRE sí se trabaja y están habilitados.
 */
export function esDiaCerradoPorDomingo(fecha?: string | Date | null): boolean {
  if (!fecha) return false;
  let d: Date;
  if (typeof fecha === 'string') {
    const isoDate = fecha.trim().slice(0, 10);
    d = new Date(`${isoDate}T12:00:00-05:00`);
  } else {
    d = fecha;
  }
  if (isNaN(d.getTime())) return false;
  const diaSemana = d.getDay();
  if (diaSemana !== 0) return false; // No es domingo
  return !esFechaDiciembre(fecha); // Es domingo y NO es diciembre (cerrado)
}

/**
 * Determina si se debe exigir anticipo para una reserva según la configuración del spa
 * o si la fecha de la cita es en diciembre (en diciembre siempre es obligatorio).
 */
export function requiereAnticipoParaFecha(complejo: any, fecha?: string | Date | null): boolean {
  const checkActivo = (Number(complejo?.porcentaje_anticipo_minimo) || 0) > 0;
  return checkActivo || esFechaDiciembre(fecha);
}

export interface Cancha {
  id: string;
  complejo_id: string;
  nombre: string;
  deporte: string;
  precio_estandar: number;
  precio_pico: number;
  foto?: string | null;
}

export const MAPA_MANICURISTAS: Record<string, { nombre: string; foto: string | null }> = {
  '21233500-c4cf-4694-9532-1378eccf3709': { nombre: 'Lili', foto: '/equipo/lili.jpg' },
  '34f841b4-3aac-4770-83e4-e716426f7496': { nombre: 'Jhoana', foto: '/equipo/jhoana.jpg' },
  'c14f696e-e3fa-4e24-afd9-96727ec488e6': { nombre: 'Manuela', foto: '/equipo/manuela.jpg' },
  'e9d41347-1e33-499c-a044-480999497a84': { nombre: 'Manicurista 4', foto: null },
  'Manicurista 1': { nombre: 'Lili', foto: '/equipo/lili.jpg' },
  'Manicurista 2': { nombre: 'Jhoana', foto: '/equipo/jhoana.jpg' },
  'Manicurista 3': { nombre: 'Manuela', foto: '/equipo/manuela.jpg' },
  'Manicurista 4': { nombre: 'Manicurista 4', foto: null },
  'Lili': { nombre: 'Lili', foto: '/equipo/lili.jpg' },
  'Jhoana': { nombre: 'Jhoana', foto: '/equipo/jhoana.jpg' },
  'Manuela': { nombre: 'Manuela', foto: '/equipo/manuela.jpg' },
};

export function enriquecerCancha<T extends { id?: string; nombre?: string }>(cancha: T): T & { foto?: string | null } {
  if (!cancha) return cancha;
  const rawNombre = String(cancha.nombre || '').trim();
  const nLower = rawNombre.toLowerCase();
  const match =
    (cancha.id && MAPA_MANICURISTAS[cancha.id]) ||
    (rawNombre && MAPA_MANICURISTAS[rawNombre]) ||
    (nLower === '1' || nLower.includes('manicurista 1')
      ? MAPA_MANICURISTAS['Manicurista 1']
      : nLower === '2' || nLower.includes('manicurista 2')
      ? MAPA_MANICURISTAS['Manicurista 2']
      : nLower === '3' || nLower.includes('manicurista 3')
      ? MAPA_MANICURISTAS['Manicurista 3']
      : undefined);
  if (match) {
    return { ...cancha, nombre: match.nombre, foto: match.foto };
  }
  return cancha;
}

/**
 * Retorna siempre el nombre real configurado de la especialista (Lili, Jhoana, Manuela),
 * evitando mostrar etiquetas internas como "Manicurista 1/2/3".
 */
export function obtenerNombreRealManicurista(canchaOrNombre?: any, fallback: string = 'Especialista'): string {
  if (!canchaOrNombre) return fallback;
  const obj =
    typeof canchaOrNombre === 'string'
      ? { nombre: canchaOrNombre }
      : canchaOrNombre;
  const enr = enriquecerCancha(obj);
  const limpio = String(enr?.nombre || '').trim();
  return limpio || fallback;
}

export interface HorarioDisponible {
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
  precio: number;
}

const normalizarTextoComparacion = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Determina si un identificador corresponde a un LID interno de WhatsApp (y no a un teléfono celular real).
 */
export function esIdentificadorLid(valor?: string | null): boolean {
  if (!valor) return false;
  const raw = String(valor).trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith('lid:') || raw.endsWith('@lid')) return true;
  const digitos = raw.split('@')[0].replace(/\D/g, '');
  return digitos.length >= 14;
}

/**
 * Extrae únicamente los dígitos de un identificador LID si aplica; retorna '' si es un teléfono normal.
 */
export function extraerDigitosLid(valor?: string | null): string {
  if (!esIdentificadorLid(valor)) return '';
  return String(valor || '').split('@')[0].replace(/\D/g, '');
}

export class BookingService {
  /**
   * Obtiene todos los complejos registrados (Multi-empresa)
   */
  static async getComplejos(): Promise<Complejo[]> {
    const { data, error } = await supabase.from('complejos').select('*').order('nombre');
    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene un complejo por su ID o por su Slug
   */
  static async getComplejo(identificador: string): Promise<Complejo | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identificador);
    let query = supabase.from('complejos').select('*');
    if (isUuid) {
      query = query.eq('id', identificador);
    } else {
      query = query.eq('slug', identificador);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Identifica qué empresa recibió el mensaje de WhatsApp a partir del Phone ID de Meta o el número
   */
  static async getComplejoByPhone(phoneId?: string, displayPhone?: string): Promise<Complejo> {
    if (phoneId) {
      const { data } = await supabase
        .from('complejos')
        .select('*')
        .eq('whatsapp_phone_number_id', phoneId)
        .maybeSingle();
      if (data) return data;
    }

    if (displayPhone) {
      const limpio = displayPhone.replace(/\D/g, '');
      const { data } = await supabase
        .from('complejos')
        .select('*')
        .ilike('telefono_whatsapp', `%${limpio}%`)
        .maybeSingle();
      if (data) return data;
    }

    // Si no coincide o es demo, retornar el primer complejo registrado
    const complejos = await this.getComplejos();
    if (complejos.length > 0) return complejos[0];

    throw new Error('No hay complejos deportivos configurados en el sistema.');
  }

  /**
   * Crea una nueva empresa / complejo deportivo en la plataforma
   */
  static async crearComplejo(datos: Partial<Complejo>): Promise<Complejo> {
    try {
      const { data, error } = await supabase
        .from('complejos')
        .insert(datos)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err: any) {
      if (err.message?.includes('tipo_negocio')) {
        const { tipo_negocio, ...resto } = datos;
        const { data, error } = await supabase
          .from('complejos')
          .insert(resto)
          .select()
          .single();
        if (error) throw error;
        return { ...data, tipo_negocio: tipo_negocio || 'deportes' };
      }
      throw err;
    }
  }

  /**
   * Obtiene o crea un cliente en la base de datos asegurando que `telefono_wa`
   * guarde únicamente números telefónicos reales y que los LIDs se vinculen aparte en `email`.
   */
  static async getOrCreateCliente(telefono: string, nombre?: string, lidWhatsapp?: string) {
    const cleanLid = extraerDigitosLid(lidWhatsapp) || extraerDigitosLid(telefono);

    // Nunca registrar ni sobrescribir `telefono_wa` con un LID nuevo como si fuera un celular real
    if (esIdentificadorLid(telefono)) {
      if (!cleanLid) return null;
      const { data: existingLids, error: lidErr } = await supabase
        .from('clientes')
        .select('*')
        .or(`email.eq.lid:${cleanLid},telefono_wa.eq.${cleanLid}`)
        .limit(5);
      if (lidErr) throw lidErr;
      const existingLid = existingLids?.[0];
      if (existingLid) {
        if (nombre && nombre.trim() && nombre.trim() !== existingLid.nombre) {
          await supabase
            .from('clientes')
            .update({ nombre: nombre.trim() })
            .eq('id', existingLid.id);
          existingLid.nombre = nombre.trim();
        }
        return existingLid;
      }
      return null;
    }

    const digits = String(telefono || '').replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      throw new Error('Número de teléfono inválido.');
    }
    const cleanPhone = digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
    const sinPais = cleanPhone.replace(/^57/, '');
    const nombreLimpio = nombre?.trim() || '';

    const esNombreGenerico = (n?: string | null): boolean => {
      const clean = String(n || '').trim().toLowerCase();
      return !clean || clean === 'usuario whatsapp' || clean === 'cliente' || clean === 'clienta';
    };

    const { data: filasTel, error: findError } = await supabase
      .from('clientes')
      .select('*')
      .or(`telefono_wa.eq.${cleanPhone},telefono_wa.eq.${sinPais}`)
      .order('creado_en', { ascending: true })
      .limit(10);

    if (findError) throw findError;

    let existingPhone: any = null;
    if (filasTel && filasTel.length > 0) {
      existingPhone = filasTel.find((f) => f.telefono_wa === cleanPhone) || filasTel[0];
      const duplicadosTel = filasTel.filter((f) => f.id !== existingPhone.id);

      if (duplicadosTel.length > 0) {
        let mejorNombre = !esNombreGenerico(existingPhone.nombre) ? existingPhone.nombre : '';
        let lidRescatado = extraerDigitosLid(existingPhone.email);

        for (const dup of duplicadosTel) {
          if (!mejorNombre && !esNombreGenerico(dup.nombre)) {
            mejorNombre = dup.nombre;
          }
          if (!lidRescatado) {
            lidRescatado = extraerDigitosLid(dup.email);
          }
          await supabase
            .from('reservas')
            .update({ cliente_id: existingPhone.id })
            .eq('cliente_id', dup.id);
          await supabase.from('clientes').delete().eq('id', dup.id);
        }

        const updatesConsolidacion: any = {};
        if (existingPhone.telefono_wa !== cleanPhone) {
          updatesConsolidacion.telefono_wa = cleanPhone;
          existingPhone.telefono_wa = cleanPhone;
        }
        if (mejorNombre && mejorNombre !== existingPhone.nombre) {
          updatesConsolidacion.nombre = mejorNombre;
          existingPhone.nombre = mejorNombre;
        }
        if (lidRescatado && existingPhone.email !== `lid:${lidRescatado}`) {
          updatesConsolidacion.email = `lid:${lidRescatado}`;
          existingPhone.email = `lid:${lidRescatado}`;
        }
        if (Object.keys(updatesConsolidacion).length > 0) {
          await supabase.from('clientes').update(updatesConsolidacion).eq('id', existingPhone.id);
        }
      }
    }

    // Buscar si existe un registro previo que guardó un LID en `telefono_wa`
    let legacyLidRow: any = null;
    if (cleanLid) {
      const { data: byLids } = await supabase
        .from('clientes')
        .select('*')
        .or(`telefono_wa.eq.${cleanLid},email.eq.lid:${cleanLid}`)
        .limit(5);
      const candidatoLid = (byLids || []).find((r) => !existingPhone || r.id !== existingPhone.id);
      if (candidatoLid) legacyLidRow = candidatoLid;
    } else if (nombreLimpio) {
      const terminoSeguro = nombreLimpio.replace(/[%_]/g, '\\$&');
      const { data: candidatosPorNombre } = await supabase
        .from('clientes')
        .select('*')
        .ilike('nombre', terminoSeguro)
        .limit(10);
      const nombreNorm = normalizarTextoComparacion(nombreLimpio);
      legacyLidRow =
        (candidatosPorNombre || []).find(
          (c) =>
            esIdentificadorLid(c.telefono_wa) &&
            normalizarTextoComparacion(c.nombre || '') === nombreNorm
        ) || null;
    }

    // Caso 1: Existen ambas filas distintas (teléfono real y fila antigua con LID) -> fusionar reservas y eliminar duplicado LID
    if (existingPhone && legacyLidRow && legacyLidRow.id !== existingPhone.id) {
      const oldLid = cleanLid || extraerDigitosLid(legacyLidRow.telefono_wa) || extraerDigitosLid(legacyLidRow.email);
      await supabase
        .from('reservas')
        .update({ cliente_id: existingPhone.id })
        .eq('cliente_id', legacyLidRow.id);

      const updatesPhone: any = {};
      if (nombreLimpio && nombreLimpio !== existingPhone.nombre) {
        updatesPhone.nombre = nombreLimpio;
        existingPhone.nombre = nombreLimpio;
      }
      if (oldLid && existingPhone.email !== `lid:${oldLid}`) {
        updatesPhone.email = `lid:${oldLid}`;
        existingPhone.email = `lid:${oldLid}`;
      }
      if (Object.keys(updatesPhone).length > 0) {
        await supabase.from('clientes').update(updatesPhone).eq('id', existingPhone.id);
      }

      await supabase.from('clientes').delete().eq('id', legacyLidRow.id);
      if (oldLid) BaileysService.lidToPhoneMap.set(oldLid, cleanPhone);
      return existingPhone;
    }

    // Caso 2: Solo existe la fila antigua con LID -> reparar in-place pasando teléfono real a `telefono_wa` y LID a `email`
    if (!existingPhone && legacyLidRow) {
      const oldLid = cleanLid || extraerDigitosLid(legacyLidRow.telefono_wa) || extraerDigitosLid(legacyLidRow.email);
      const updatesLegacy: any = {
        telefono_wa: cleanPhone,
        nombre: nombreLimpio || legacyLidRow.nombre,
      };
      if (oldLid) updatesLegacy.email = `lid:${oldLid}`;

      const { data: repaired, error: repErr } = await supabase
        .from('clientes')
        .update(updatesLegacy)
        .eq('id', legacyLidRow.id)
        .select()
        .single();

      if (oldLid) BaileysService.lidToPhoneMap.set(oldLid, cleanPhone);
      if (!repErr && repaired) return repaired;
      return { ...legacyLidRow, ...updatesLegacy };
    }

    // Caso 3: Ya existe por teléfono real (normalizar siempre a cleanPhone 573...)
    if (existingPhone) {
      const updates: any = {};
      if (existingPhone.telefono_wa !== cleanPhone) {
        updates.telefono_wa = cleanPhone;
        existingPhone.telefono_wa = cleanPhone;
      }
      if (nombreLimpio && nombreLimpio !== existingPhone.nombre) {
        updates.nombre = nombreLimpio;
        existingPhone.nombre = nombreLimpio;
      }
      if (cleanLid && existingPhone.email !== `lid:${cleanLid}`) {
        updates.email = `lid:${cleanLid}`;
        existingPhone.email = `lid:${cleanLid}`;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('clientes').update(updates).eq('id', existingPhone.id);
      }
      if (cleanLid) BaileysService.lidToPhoneMap.set(cleanLid, cleanPhone);
      return existingPhone;
    }

    // Caso 4: Clienta nueva -> crear con teléfono real y guardar LID aparte en `email` si aplica
    const insertPayload: any = {
      telefono_wa: cleanPhone,
      nombre: nombreLimpio || 'Usuario WhatsApp',
    };
    if (cleanLid) {
      insertPayload.email = `lid:${cleanLid}`;
    }

    const { data: created, error: createError } = await supabase
      .from('clientes')
      .insert(insertPayload)
      .select()
      .single();

    if (createError) throw createError;
    if (cleanLid) BaileysService.lidToPhoneMap.set(cleanLid, cleanPhone);
    return created;
  }

  /**
   * Obtiene todas las canchas activas registradas en Supabase (filtradas por complejo)
   */
  static async getCanchas(complejoId?: string): Promise<Cancha[]> {
    let query = supabase.from('canchas').select('*').eq('activa', true).order('nombre');
    if (complejoId) {
      query = query.eq('complejo_id', complejoId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || [])
      .filter((c) => {
        const nLower = (c.nombre || '').toLowerCase();
        return !nLower.includes('manicurista 4') && nLower !== '4';
      })
      .map(enriquecerCancha);
  }

  /**
   * Consulta los horarios disponibles ejecutando la función RPC 'obtener_horarios_disponibles'
   * y descartando horas que ya pasaron si la consulta es para el día de hoy en Colombia (UTC-5)
   */
  static async getHorariosDisponibles(canchaId: string, fechaIso: string): Promise<HorarioDisponible[]> {
    await this.liberarReservasExpiradas();

    const { data, error } = await supabase.rpc('obtener_horarios_disponibles', {
      p_cancha_id: canchaId,
      p_fecha: fechaIso,
    });

    if (error) throw error;
    const horarios = (data || []) as HorarioDisponible[];

    // Obtener la fecha y hora actual en Colombia (America/Bogota, UTC-5)
    const ahora = new Date();
    const fechaCol = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const hoyColStr = `${fechaCol.getFullYear()}-${String(fechaCol.getMonth() + 1).padStart(2, '0')}-${String(fechaCol.getDate()).padStart(2, '0')}`;
    const horaColStr = `${String(fechaCol.getHours()).padStart(2, '0')}:${String(fechaCol.getMinutes()).padStart(2, '0')}:00`;

    const esHoy = fechaIso === hoyColStr;

    return horarios.map((h) => {
      // Si la base de datos ya lo tiene ocupado por reserva o bloqueo
      if (!h.disponible) {
        return { ...h, disponible: false };
      }

      // Si la fecha es hoy y la hora de inicio ya pasó, marcar como no disponible
      if (esHoy && h.hora_inicio <= horaColStr) {
        return { ...h, disponible: false };
      }

      // Bloquear siempre la franja de almuerzo (12:00 PM - 1:00 PM)
      const hIni = (h.hora_inicio || '').slice(0, 5);
      const hFin = (h.hora_fin || '').slice(0, 5);
      if (hIni < '13:00' && hFin > '12:00') {
        return { ...h, disponible: false };
      }

      return h;
    });
  }

  /**
   * Crea una pre-reserva con bloqueo de 15 minutos en PostgreSQL.
   */
  static async crearPreReserva(params: {
    canchaId: string;
    clienteId: string;
    fechaInicio: string;
    fechaFin: string;
    valorTotal: number;
    porcentajeAnticipo?: number;
    montoAnticipo?: number;
    exigeAnticipo?: boolean;
  }) {
    let anticipoRequerido = 0;
    let esConfirmadaDirecta = false;

    if (params.montoAnticipo !== undefined) {
      anticipoRequerido = Math.min(params.valorTotal, Number(params.montoAnticipo) || 0);
      esConfirmadaDirecta = params.exigeAnticipo !== undefined ? !params.exigeAnticipo : anticipoRequerido === 0;
    } else {
      const porcentaje = Number(params.porcentajeAnticipo) || 0;
      anticipoRequerido = (params.valorTotal * porcentaje) / 100;
      esConfirmadaDirecta = porcentaje === 0;
    }

    const expiracion = esConfirmadaDirecta ? null : new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const estado = esConfirmadaDirecta ? 'confirmada' : 'pendiente_pago';

    const { data, error } = await supabase
      .from('reservas')
      .insert({
        cancha_id: params.canchaId,
        cliente_id: params.clienteId,
        fecha_inicio: params.fechaInicio,
        fecha_fin: params.fechaFin,
        estado,
        valor_total: params.valorTotal,
        valor_anticipo_requerido: anticipoRequerido,
        expiracion_reserva: expiracion,
      })
      .select('*, canchas(nombre)')
      .single();

    if (error) {
      if (error.code === '23P01') {
        throw new Error('Lo sentimos, este turno acaba de ser apartado por otra persona.');
      }
      throw error;
    }

    if (data?.id) {
      notificarCambioReservas('INSERT', { id: data.id });
    }
    return data;
  }

  /**
   * Registra el pago del anticipo y confirma la reserva en la base de datos
   */
  static async registrarPagoAnticipo(params: {
    reservaId: string;
    metodo: 'nequi' | 'daviplata' | 'transferencia_bancaria';
    monto: number;
    comprobanteUrl?: string;
    referencia?: string;
    estado?: 'pendiente' | 'aprobado';
    revisadoPor?: string;
    notasAdmin?: string;
  }) {
    const { data: pago, error: pagoError } = await supabase
      .from('pagos_anticipos')
      .insert({
        reserva_id: params.reservaId,
        metodo: params.metodo,
        monto: params.monto,
        comprobante_url: params.comprobanteUrl,
        referencia_transaccion: params.referencia,
        estado: params.estado || 'aprobado',
        revisado_por: params.revisadoPor || 'IA_GEMINI',
        notas_admin: params.notasAdmin || 'Auditado y aprobado automáticamente por IA',
      })
      .select()
      .single();

    if (pagoError) throw pagoError;

    const { data: reserva, error: reservaError } = await supabase
      .from('reservas')
      .update({ estado: 'confirmada', expiracion_reserva: null })
      .eq('id', params.reservaId)
      .select()
      .single();

    if (reservaError) throw reservaError;
    if (reserva?.id) {
      notificarCambioReservas('UPDATE', { id: reserva.id });
    }
    return { pago, reserva };
  }

  /**
   * Libera reservas pendientes cuyo tiempo de pago superó el límite establecido (30 min)
   */
  static async liberarReservasExpiradas() {
    const ahora = new Date().toISOString();
    try {
      const { data: expiradas } = await supabase
        .from('reservas')
        .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
        .eq('estado', 'pendiente_pago')
        .not('expiracion_reserva', 'is', null)
        .lt('expiracion_reserva', ahora);

      if (!expiradas || expiradas.length === 0) return;

      for (const r of expiradas) {
        const notas = r.notas || '';
        // Si la cita fue agendada por una administradora o especialista desde el panel, NUNCA se cancela automáticamente
        if (notas.includes('Agendado en cabina por:') || notas.includes('[SIN_EXPIRACION_PANEL]')) {
          continue;
        }
        // Si la clienta ya envió el comprobante y la IA lo validó en revisión, NO se cancela
        if (notas.includes('[COMPROBANTE_VALIDO_IA]') || notas.includes('[COMPROBANTE_RECIBIDO]')) {
          continue;
        }

        console.log(`[EXPIRACION] Liberando turno de reserva ${r.id} por falta de comprobante de anticipo`);
        await supabase
          .from('reservas')
          .update({
            estado: 'cancelada',
            notas: `${notas} | [EXPIRADO] Cancelada automáticamente por superar el tiempo límite de anticipo`,
          })
          .eq('id', r.id);

        // Enviar notificación por WhatsApp a la clienta
        const cliente = r.clientes as any;
        const cancha = r.canchas as any;
        const complejo = cancha?.complejos as any;

        if (cliente?.telefono_wa) {
          const horaStr = new Date(r.fecha_inicio).toLocaleTimeString('es-CO', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Bogota',
          });
          const msgAviso =
            `🌸 *JL MÍMATE NAILS* 🌸\n\n` +
            `Hola *${cliente.nombre || 'Reina'}*, te informamos que tu turno para las *${horaStr}* ha sido liberado porque no recibimos el comprobante de anticipo dentro del tiempo límite.\n\n` +
            `Si aún deseas apartar tu espacio, con gusto puedes volver a agendar en nuestra agenda web:\n` +
            `👉 https://mimate-nails-spa.vercel.app 💕💅`;

          let cleanPhone = String(cliente.telefono_wa).replace(/\D/g, '');
          if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) cleanPhone = `57${cleanPhone}`;
          try {
            await BaileysService.enviarMensajeDirecto(cleanPhone, msgAviso);
          } catch (e: any) {
            console.warn('Error enviando aviso de liberación por Baileys:', e.message);
          }
        }
      }
    } catch (err: any) {
      console.error('Error en liberarReservasExpiradas:', err.message);
    }
  }
}
