import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconBrandWhatsapp,
  IconCalendar,
  IconClock,
  IconCheck,
  IconX,
  IconPlus,
  IconLogout,
  IconChartBar,
  IconArrowLeft,
  IconLoader2,
  IconExternalLink,
  IconLock,
  IconLockOpen,
  IconRefresh,
  IconAlertCircle,
  IconChevronLeft,
  IconChevronRight,
  IconCalendarEvent,
  IconCalendarWeek,
  IconCalendarMonth,
  IconSettings,
} from '@tabler/icons-react';
import { supabase } from '../config/supabase';
import {
  verifyPinHash,
  ADMIN_MASTER_PIN_HASH,
  HASH_ACCESO_LILI,
  HASH_ACCESO_JHOANA,
  HASH_ACCESO_MANUELA,
} from '../utils/security';
import { formatearHora12, formatearRangoHoras12 } from '../utils/formatoHora';
export { formatearHora12, formatearRangoHoras12 };
import { BloquearHorarioModal } from './dashboard/BloquearHorarioModal';
import { ConfigAnticipoModal } from './dashboard/ConfigAnticipoModal';
import { AgendarCitaModal } from './dashboard/AgendarCitaModal';
import { SelectorFechaMimate, SelectorMesMimate } from './dashboard/SelectorFechaMimate';
import { ExclusionesBotModal } from './dashboard/ExclusionesBotModal';
import { DetalleCitaPopover, sumarAdicionalesCita, esPorConfirmar } from './dashboard/DetalleCitaPopover';
import { ModalAgregarAdicional } from './dashboard/ModalAgregarAdicional';
import { WhatsAppVinculacionModal } from './dashboard/WhatsAppVinculacionModal';

interface Cancha {
  id: string;
  nombre: string;
  deporte?: string;
  activa: boolean;
  foto?: string | null;
}

interface Reserva {
  id: string;
  cancha_id: string;
  cliente_id?: string;
  fecha_inicio: string;
  fecha_fin: string;
  db_fecha_inicio?: string;
  db_fecha_fin?: string;
  estado: 'pendiente_pago' | 'pendiente_anticipo' | 'confirmada' | 'cancelada' | 'completada' | 'bloqueada';
  valor_total: number;
  valor_anticipo_requerido: number;
  expiracion_reserva?: string | null;
  notas?: string;
  canchas?: {
    id?: string;
    nombre: string;
  };
  clientes?: {
    nombre: string;
    telefono_wa: string;
  };
}

interface Servicio {
  id: number;
  nombre: string;
  categoria: string;
  duracion: number;
  precio: number;
  descripcion: string;
}

export interface StaffProfile {
  id: string;
  canchaNombreMatch: string;
  nombre: string;
  alias: string;
  rol: 'admin' | 'manicurista';
  pinHash: string;
  descripcion: string;
  avatar: string;
  foto?: string;
  colorBadge: string;
  canchaId?: string;
}

const FOTOS_EQUIPO_ADMIN: Record<string, string> = {
  'lili': '/equipo/lili.jpg',
  'jhoana': '/equipo/jhoana.jpg',
  'manuela': '/equipo/manuela.jpg',
  'manicurista 1': '/equipo/lili.jpg',
  'manicurista 2': '/equipo/jhoana.jpg',
  'manicurista 3': '/equipo/manuela.jpg',
};

const PERFILES_SPA_CONFIG: Omit<StaffProfile, 'canchaId'>[] = [
  {
    id: 'admin-m1',
    canchaNombreMatch: 'Lili',
    nombre: 'Lili (Administradora)',
    alias: 'Lili (Admin & Especialista)',
    rol: 'admin',
    pinHash: HASH_ACCESO_LILI,
    descripcion: 'Acceso Total: Supervisión de todas las tablas, métricas de reservas y agendamiento exclusivo.',
    avatar: '💅',
    foto: '/equipo/lili.jpg',
    colorBadge: 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]',
  },
  {
    id: 'admin-m2',
    canchaNombreMatch: 'Jhoana',
    nombre: 'Jhoana (Administradora)',
    alias: 'Jhoana (Admin & Especialista)',
    rol: 'admin',
    pinHash: HASH_ACCESO_JHOANA,
    descripcion: 'Acceso Total: Supervisión de todas las tablas, métricas de reservas y agendamiento exclusivo.',
    avatar: '💅',
    foto: '/equipo/jhoana.jpg',
    colorBadge: 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]',
  },
  {
    id: 'staff-m3',
    canchaNombreMatch: 'Manuela',
    nombre: 'Manuela',
    alias: 'Manuela (Especialista)',
    rol: 'manicurista',
    pinHash: HASH_ACCESO_MANUELA,
    descripcion: 'Vista personal de turnos del día y gestión de atención de clientas asignadas.',
    avatar: '💅',
    foto: '/equipo/manuela.jpg',
    colorBadge: 'bg-[#FFF5F7] text-[#C74B66] border-[#F2C4D2]',
  },
];

interface Props {
  onIrAWebReservas: () => void;
  complejoId?: string;
}

// Función auxiliar para obtener el nombre exacto de la clienta por cita
function obtenerNombreClienta(cita: Reserva): string {
  if (cita.estado === 'bloqueada') {
    return '🔒 Horario Bloqueado';
  }
  const matchNom = (cita.notas || '').match(/Clienta:\s*([^|[\n]+)/i);
  if (matchNom && matchNom[1]) {
    return matchNom[1].trim();
  }
  return cita.clientes?.nombre || 'Clienta';
}

// Función auxiliar para extraer el nombre del servicio de la cita
function obtenerServicioCita(cita: Reserva): string {
  if (cita.estado === 'bloqueada') {
    const matchMotivo = (cita.notas || '').match(/Motivo:\s*([^|[\n]+)/i);
    return matchMotivo ? matchMotivo[1].trim() : 'Turno Bloqueado';
  }
  const matchSvc = (cita.notas || '').match(/Servicio:\s*([^|[\n]+)/i);
  if (matchSvc && matchSvc[1]) {
    return matchSvc[1].trim();
  }

  // Deducción inteligente si las notas no contienen el tag Servicio:
  const notasLower = (cita.notas || '').replace(/\[HORARIO_REAL:[^\]]+\]/gi, '').toLowerCase();
  const serviciosConocidos = [
    'semi manos y pies', 'manos y pies', 'semi pies', 'semipermanente',
    'pies hombre', 'manos hombre', 'semi hombre', 'base rubber', 'press on',
    'retoque press', 'dipping', 'retiro acrilico', 'retiro semi', 'retiro',
    'acrilico', 'barrido', 'retoque', 'pies', 'manos'
  ];
  const encontrados = serviciosConocidos.filter((nombre) => notasLower.includes(nombre));
  if (encontrados.length > 0) {
    return encontrados.map((e) => e.charAt(0).toUpperCase() + e.slice(1)).join(' + ');
  }

  // Deducción por valor monetario si las notas fueron formateadas externamente
  const v = Number(cita.valor_total || 0);
  if (v === 103000) return 'Manos y pies + Semi hombre + Semipermanente';
  if (v === 90000) return 'Acrilico';
  if (v === 75000) return 'Semi Manos y Pies';
  if (v === 65000) return 'Press on';
  if (v === 55000) return 'Base Rubber';
  if (v === 50000) return 'Retoque press';
  if (v === 43000) return 'Semipermanente';
  if (v === 38000) return 'Semi pies';
  if (v === 35000) return 'Manos y pies';
  if (v === 25000) return 'Semi hombre';
  if (v === 20000) return 'Pies';
  if (v === 16000) return 'Manos';
  if (v === 14000) return 'Manos hombre';

  return 'Servicio de Uñas';
}

// Extrae el motivo y responsable del bloqueo
function obtenerDetalleBloqueo(cita: Reserva): { motivo: string; por: string } {
  const matchMotivo = (cita.notas || '').match(/Motivo:\s*([^|[\n]+)/i);
  const matchPor = (cita.notas || '').match(/Por:\s*([^|[\n]+)/i);
  return {
    motivo: matchMotivo ? matchMotivo[1].trim() : 'Horario no disponible',
    por: matchPor ? matchPor[1].trim() : 'Personal del Spa',
  };
}

/**
 * Calcula dinámicamente las opciones de horas para bloqueo de horarios
 * basándose en el horario de atención estipulado en ese momento (apertura y cierre).
 */
export function calcularHorasOpcionesBloqueo(
  horaApertura: string = '08:00',
  horaCierre: string = '19:00',
  intervaloMinutos: number = 60
): string[] {
  const [aperH, aperM] = (horaApertura || '08:00').split(':').map(Number);
  const [cierH, cierM] = (horaCierre || '19:00').split(':').map(Number);
  const startMin = (isNaN(aperH) ? 8 : aperH) * 60 + (isNaN(aperM) ? 0 : aperM);
  const endMin = (isNaN(cierH) ? 19 : cierH) * 60 + (isNaN(cierM) ? 0 : cierM);

  const lista: string[] = [];
  for (let m = startMin; m < endMin; m += intervaloMinutos) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    lista.push(`${hh}:${mm}`);
  }
  return lista;
}

// Función calculada para compatibilidad cuando se referencie HORAS_OPCIONES_BLOQUEO
export const HORAS_OPCIONES_BLOQUEO = (
  horaApertura: string = '08:00',
  horaCierre: string = '19:00',
  intervaloMinutos: number = 60
): string[] => calcularHorasOpcionesBloqueo(horaApertura, horaCierre, intervaloMinutos);

export function calcularHorasTimeline(horaApertura: string = '08:00', horaCierre: string = '19:00'): number[] {
  const aperH = parseInt((horaApertura || '08:00').split(':')[0], 10) || 8;
  const cierH = parseInt((horaCierre || '19:00').split(':')[0], 10) || 19;
  const horas: number[] = [];
  for (let h = aperH; h <= cierH; h++) {
    horas.push(h);
  }
  return horas.length > 0 ? horas : [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
}

const ALTURA_HORA_PX = 88;

// Funciones para calcular la hora en Colombia (America/Bogota, UTC-5)
function obtenerHoraMinutosBogota(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '08:00';
    return d.toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '08:00';
  }
}



// Minutos desde la apertura en Colombia (por defecto horaBaseApertura = 8:00 AM)
function obtenerMinutosDesdeAperturaBogota(isoStr: string, horaBaseApertura: number = 8): number {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 0;
    const horaStr = d.toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [h, m] = horaStr.split(':').map((n) => parseInt(n, 10));
    return (h - horaBaseApertura) * 60 + m;
  } catch {
    return 0;
  }
}

// Duración en minutos calculada a partir de fecha_inicio y fecha_fin (por defecto 45)
function obtenerDuracionMinutosCita(inicioIso: string, finIso?: string): number {
  if (!finIso) return 45;
  try {
    const tIni = new Date(inicioIso).getTime();
    const tFin = new Date(finIso).getTime();
    if (isNaN(tIni) || isNaN(tFin) || tFin <= tIni) return 45;
    return Math.max(15, Math.round((tFin - tIni) / 60000));
  } catch {
    return 45;
  }
}

interface CitaPosicionada {
  cita: Reserva;
  top: number;
  height: number;
  colIndex: number;
  totalCols: number;
}

interface DragCitaSemanalState {
  modo: 'semanal' | 'diaria';
  cita: Reserva;
  duracionMinutos: number;
  alturaPx: number;
  fechaOriginalIso: string;
  minInicioOriginal: number;
  targetFechaIso: string;
  targetDayIndex: number;
  targetMinInicio: number;
  rawTopPx: number;
  snappedTopPx: number;
  esValido: boolean;
  motivoInvalido: string | null;
  esTraslapeParcial?: boolean;
}

const REGEX_HORARIO_REAL = /\[HORARIO_REAL:([^|\]]+)\|([^\]]+)\]/i;
const REGEX_HORARIO_REAL_CLEAN = /\s*\|?\s*\[HORARIO_REAL:[^\]]+\]/gi;
const MIN_NO_TRASLAPE_MS = 15 * 60 * 1000;
const ESTADOS_EXCLUSION_DB = new Set(['pendiente_pago', 'pendiente_anticipo', 'confirmada', 'bloqueada']);

function hidratarHorarioRealReserva(r: Reserva): Reserva {
  if (!r) return r;
  const base: Reserva = {
    ...r,
    db_fecha_inicio: r.db_fecha_inicio || r.fecha_inicio,
    db_fecha_fin: r.db_fecha_fin || r.fecha_fin,
  };
  const match = (r.notas || '').match(REGEX_HORARIO_REAL);
  if (match && match[1] && match[2]) {
    const iniMs = new Date(match[1].trim()).getTime();
    const finMs = new Date(match[2].trim()).getTime();
    if (!isNaN(iniMs) && !isNaN(finMs) && finMs > iniMs) {
      return {
        ...base,
        fecha_inicio: new Date(iniMs).toISOString(),
        fecha_fin: new Date(finMs).toISOString(),
      };
    }
  }
  return base;
}

function calcularPersistenciaTraslapeFallback(params: {
  idReserva: string;
  canchaId: string;
  dInicio: Date;
  dFin: Date;
  notasActuales?: string;
  todasReservas: Reserva[];
}): { dbFechaInicio: string; dbFechaFin: string; notasFinal: string } | null {
  const { idReserva, canchaId, dInicio, dFin, notasActuales, todasReservas } = params;
  const slotStart = dInicio.getTime();
  const slotEnd = dFin.getTime();

  const dbOcupados = (todasReservas || [])
    .filter(
      (o) =>
        o &&
        o.id !== idReserva &&
        o.cancha_id === canchaId &&
        o.estado !== 'cancelada' &&
        ESTADOS_EXCLUSION_DB.has(String(o.estado || '')) &&
        (o.db_fecha_inicio || o.fecha_inicio)
    )
    .map((o) => {
      const s = new Date(o.db_fecha_inicio || o.fecha_inicio).getTime();
      const e = new Date(o.db_fecha_fin || o.fecha_fin || s + 45 * 60000).getTime();
      return { start: s, end: e };
    })
    .filter((iv) => iv.start < slotEnd && iv.end > slotStart)
    .sort((a, b) => a.start - b.start);

  let segmentosLibres: Array<{ start: number; end: number }> = [{ start: slotStart, end: slotEnd }];
  for (const occ of dbOcupados) {
    const siguientes: Array<{ start: number; end: number }> = [];
    for (const seg of segmentosLibres) {
      if (occ.end <= seg.start || occ.start >= seg.end) {
        siguientes.push(seg);
      } else {
        if (occ.start > seg.start) siguientes.push({ start: seg.start, end: occ.start });
        if (occ.end < seg.end) siguientes.push({ start: occ.end, end: seg.end });
      }
    }
    segmentosLibres = siguientes;
  }

  if (segmentosLibres.length === 0) return null;
  segmentosLibres.sort((a, b) => b.end - b.start - (a.end - a.start));
  const mejor = segmentosLibres[0];
  if (mejor.end <= mejor.start) return null;

  const notasLimpias = String(notasActuales || '')
    .replace(REGEX_HORARIO_REAL_CLEAN, '')
    .trim();
  const realStartIso = dInicio.toISOString();
  const realEndIso = dFin.toISOString();
  const requiereTagReal = mejor.start !== slotStart || mejor.end !== slotEnd;

  return {
    dbFechaInicio: new Date(mejor.start).toISOString(),
    dbFechaFin: new Date(mejor.end).toISOString(),
    notasFinal: requiereTagReal
      ? `${notasLimpias ? `${notasLimpias} | ` : ''}[HORARIO_REAL:${realStartIso}|${realEndIso}]`
      : notasLimpias,
  };
}

function formatearMinutosAHHMM(horaAperturaBase: number, minDesdeApertura: number): string {
  const totalMin = Math.max(0, Math.round(horaAperturaBase * 60 + minDesdeApertura));
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Indica si una fecha YYYY-MM-DD cae en domingo regular cerrado (diciembre sí abre domingos). */
function esDomingoCerradoIso(fechaIso: string): boolean {
  return new Date(`${fechaIso}T12:00:00-05:00`).getDay() === 0 && !/^\d{4}-12-/.test(fechaIso);
}

function calcularPosicionesCitas(citas: Reserva[], horaBaseApertura: number = 8): CitaPosicionada[] {
  if (!citas || citas.length === 0) return [];

  const items = citas.map((c) => {
    const minInicio = Math.max(0, obtenerMinutosDesdeAperturaBogota(c.fecha_inicio, horaBaseApertura));
    const durMin = obtenerDuracionMinutosCita(c.fecha_inicio, c.fecha_fin);
    const minFin = minInicio + durMin;
    const top = (minInicio / 60) * ALTURA_HORA_PX;
    const height = Math.max(42, (durMin / 60) * ALTURA_HORA_PX - 4);
    return {
      cita: c,
      minInicio,
      minFin,
      top,
      height,
      colIndex: 0,
      totalCols: 1,
    };
  });

  items.sort((a, b) => a.minInicio - b.minInicio || b.minFin - a.minFin);

  const grupos: typeof items[] = [];
  let grupoActual: typeof items = [];
  let maxFinGrupo = -1;

  for (const item of items) {
    if (grupoActual.length === 0 || item.minInicio < maxFinGrupo) {
      grupoActual.push(item);
      maxFinGrupo = Math.max(maxFinGrupo, item.minFin);
    } else {
      grupos.push(grupoActual);
      grupoActual = [item];
      maxFinGrupo = item.minFin;
    }
  }
  if (grupoActual.length > 0) grupos.push(grupoActual);

  for (const grupo of grupos) {
    const colsFin: number[] = [];
    for (const it of grupo) {
      let colAsignada = -1;
      for (let c = 0; c < colsFin.length; c++) {
        if (colsFin[c] <= it.minInicio) {
          colAsignada = c;
          colsFin[c] = it.minFin;
          break;
        }
      }
      if (colAsignada === -1) {
        colAsignada = colsFin.length;
        colsFin.push(it.minFin);
      }
      it.colIndex = colAsignada;
    }
    const numCols = colsFin.length;
    for (const it of grupo) {
      it.totalCols = numCols;
    }
  }

  return items;
}

export const MimateNailsDashboard: React.FC<Props> = ({ onIrAWebReservas, complejoId }) => {
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(hoyStr);
  const [idComplejoDetectado, setIdComplejoDetectado] = useState<string>(
    complejoId || '3bd1708c-21de-42a8-a529-d7c91fd41ed2'
  );
  const [perfilActual, setPerfilActual] = useState<StaffProfile | null>(() => {
    try {
      const g = localStorage.getItem('mimate_staff_profile');
      if (!g) return null;
      const parsed = JSON.parse(g);
      // Sanitizar para eliminar cualquier clave de PIN plano heredada o pinHash
      if (parsed && ('pin' in parsed || 'pinHash' in parsed)) {
        delete parsed.pin;
        delete parsed.pinHash;
        localStorage.setItem('mimate_staff_profile', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const esAdmin = perfilActual?.rol === 'admin';

  // Estado para el View Emergente (Popover) grande al pasar el mouse por encima de una cita
  const [popoverCita, setPopoverCita] = useState<{
    cita: Reserva;
    rect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  } | null>(null);
  const popoverTimeoutRef = useRef<any>(null);
  const popoverWrapperRef = useRef<HTMLDivElement | null>(null);

  const abrirPopoverDesdeElemento = (cita: Reserva, el: HTMLElement) => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
    const r = el.getBoundingClientRect();
    setPopoverCita({
      cita,
      rect: {
        top: r.top,
        left: r.left,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      },
    });
  };

  const abrirPopoverCita = (cita: Reserva, e: React.MouseEvent) => {
    abrirPopoverDesdeElemento(cita, e.currentTarget as HTMLElement);
  };

  const cerrarPopoverCita = () => {
    popoverTimeoutRef.current = setTimeout(() => {
      setPopoverCita(null);
    }, 200);
  };

  const mantenerPopoverCita = () => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
  };

  useEffect(() => {
    if (!popoverCita) return;
    const handleOutsidePointerDown = (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (popoverWrapperRef.current && popoverWrapperRef.current.contains(target)) return;
      if (target.closest('[data-cita-sem-card="true"]')) return;
      setPopoverCita(null);
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [popoverCita]);



  // Reloj en tiempo real para la franja de hora actual en el calendario
  const [ahora, setAhora] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setAhora(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  const [canchas, setCanchas] = useState<Cancha[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(false);
  const [realtimeConectado, setRealtimeConectado] = useState(false);
  const [notificacionRealtime, setNotificacionRealtime] = useState<string | null>(null);
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarNotificacionRealtime = (mensaje: string) => {
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    setNotificacionRealtime(mensaje);
    notifTimeoutRef.current = setTimeout(() => {
      setNotificacionRealtime(null);
    }, 4000);
  };

  const [tabAdmin, setTabAdmin] = useState<'agenda' | 'metricas'>('agenda');
  const [especialistaSeleccionadaId, setEspecialistaSeleccionadaId] = useState<string>('todas');
  // Selector de vista de agenda: Día (diario por horas / 4 columnas) vs Semana (planificador de 7 días)
  const [vistaAgenda, setVistaAgenda] = useState<'dia' | 'semana'>('dia');

  // Estado para la pestaña de Métricas (Por Día vs Por Mes)
  const [modoMetricas, setModoMetricas] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(() => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Modal Login PIN (Siempre inicializado vacío, nunca pre-llenado)
  const [modalPinPerfil, setModalPinPerfil] = useState<StaffProfile | null>(null);
  const [pinIngresado, setPinIngresado] = useState('');
  const [errorPin, setErrorPin] = useState<string | null>(null);

  // Asegurar que bajo ninguna circunstancia persista o se auto-llene la clave al abrir/cambiar de perfil
  useEffect(() => {
    setPinIngresado('');
    setErrorPin(null);
  }, [modalPinPerfil]);

  // Modal Agendar Cita (Solo Admin)
  const [modalAgendarAbierto, setModalAgendarAbierto] = useState(false);
  const [agendarManicuristaId, setAgendarManicuristaId] = useState('');
  const [agendarServicioId, setAgendarServicioId] = useState<number>(1);
  const [agendarServiciosExtrasIds, setAgendarServiciosExtrasIds] = useState<number[]>([]);
  const [agendarFecha, setAgendarFecha] = useState(hoyStr);
  const [agendarHora, setAgendarHora] = useState('09:30');
  const [agendarNombre, setAgendarNombre] = useState('');
  const [agendarTelefono, setAgendarTelefono] = useState('');
  const [guardandoCita, setGuardandoCita] = useState(false);
  const [errorAgendar, setErrorAgendar] = useState<string | null>(null);

  // Estados para dropdowns bonitos en el modal agendar
  const [menuManiAbierto, setMenuManiAbierto] = useState(false);
  const [menuServicioAbierto, setMenuServicioAbierto] = useState(false);
  const [menuHoraAbierto, setMenuHoraAbierto] = useState(false);

  // Modal Bloquear Horarios (Disponible para Administradora y Manicuristas)
  const [modalBloquearAbierto, setModalBloquearAbierto] = useState(false);
  const [bloquearManicuristaId, setBloquearManicuristaId] = useState<string>('');
  const [bloquearFecha, setBloquearFecha] = useState(hoyStr);
  const [bloquearHorasSeleccionadas, setBloquearHorasSeleccionadas] = useState<string[]>([]);
  const [bloquearMotivo, setBloquearMotivo] = useState('🍱 Almuerzo');
  const [bloquearMotivoPersonalizado, setBloquearMotivoPersonalizado] = useState('');
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);
  const [errorBloquear, setErrorBloquear] = useState<string | null>(null);
  const [menuBloquearManiAbierto, setMenuBloquearManiAbierto] = useState(false);

  // Estados para el Modal de Restricción del Bot (Sin Acceso Automático a Enlaces de Reserva)
  const [modalExclusionesAbierto, setModalExclusionesAbierto] = useState(false);
  const [exclusionesBot, setExclusionesBot] = useState<Array<{ id?: string; telefono: string; nombre?: string; motivo?: string; creado_en?: string }>>([]);
  const [cargandoExclusiones, setCargandoExclusiones] = useState(false);
  const [nuevoTelExclusion, setNuevoTelExclusion] = useState('');
  const [nuevoNombreExclusion, setNuevoNombreExclusion] = useState('');
  const [busquedaExclusion, setBusquedaExclusion] = useState('');
  const [guardandoExclusion, setGuardandoExclusion] = useState(false);
  const [errorExclusion, setErrorExclusion] = useState<string | null>(null);

  // Modal Elegante de Confirmación para Reactivar Bot (Quitar Restricción)
  const [exclusionAReactivar, setExclusionAReactivar] = useState<{ telefono: string; nombre?: string } | null>(null);
  const [reactivandoBot, setReactivandoBot] = useState(false);

  // Cargar lista de exclusiones desde el backend
  const cargarExclusionesBot = async () => {
    try {
      setCargandoExclusiones(true);
      const res = await fetch('/api/bot/exclusiones');
      if (res.ok) {
        const data = await res.json();
        setExclusionesBot(data.exclusiones || []);
      }
    } catch (e) {
      console.error('Error cargando exclusiones:', e);
    } finally {
      setCargandoExclusiones(false);
    }
  };

  // Configuración de Anticipos, Cuentas y Horario de Trabajo (Modal de Configuración)
  const [configAnticipo, setConfigAnticipo] = useState<{
    exigeAnticipo: boolean;
    montoAnticipoFijo?: number;
    porcentajeAnticipo?: number;
    nequiNumero: string;
    bancolombiaNumero: string;
    llaveNumero?: string;
    titularCuenta: string;
    horaApertura: string;
    horaCierre: string;
  }>({
    exigeAnticipo: false,
    montoAnticipoFijo: 20000,
    porcentajeAnticipo: 20000,
    nequiNumero: '',
    bancolombiaNumero: '',
    llaveNumero: '',
    titularCuenta: '',
    horaApertura: '08:00',
    horaCierre: '19:00',
  });
  const [modalConfigAnticipoAbierto, setModalConfigAnticipoAbierto] = useState(false);
  const [guardandoConfigAnticipo, setGuardandoConfigAnticipo] = useState(false);
  const [procesandoAccionAnticipo, setProcesandoAccionAnticipo] = useState<string | null>(null);

  // Estado para el modal de añadir servicio adicional (decorados, cristales, diseño extra)
  const [citaParaAdicional, setCitaParaAdicional] = useState<Reserva | null>(null);
  const [guardandoAdicional, setGuardandoAdicional] = useState(false);

  // Estado para el Modal de Vinculación y QR de WhatsApp (Exclusivo Administradora)
  const [modalWhatsAppAbierto, setModalWhatsAppAbierto] = useState(false);
  const [whatsappConectado, setWhatsappConectado] = useState<boolean | null>(null);

  // Sondeo inicial y discreto de conexión de WhatsApp para el badge del botón
  useEffect(() => {
    let montado = true;
    const verificarWhatsAppBadge = async () => {
      try {
        const res = await fetch(`/api/baileys/status?_t=${Date.now()}`);
        if (!res.ok) return;
        const d = await res.json();
        const status = d.status || d.baileys?.status;
        if (montado) {
          setWhatsappConectado(status === 'CONECTADO');
        }
      } catch {
        // Silencioso para no interferir
      }
    };
    verificarWhatsAppBadge();
    const interval = setInterval(verificarWhatsAppBadge, 45000); // Chequeo ligero cada 45s
    return () => {
      montado = false;
      clearInterval(interval);
    };
  }, []);

  const abrirModalAdicional = (cita: Reserva) => {
    setCitaParaAdicional(cita);
  };

  const handleGuardarAdicional = async (reservaId: string, monto: number) => {
    setGuardandoAdicional(true);
    try {
      const citaActual = reservas.find((r) => r.id === reservaId);
      if (!citaActual) throw new Error('Cita no encontrada');

      const nuevoValorTotal = Number(citaActual.valor_total || 0) + monto;
      const notaExtra = ` | ✨ Adicional: +$${monto.toLocaleString('es-CO')} [ADICIONAL:${monto}]`;
      const nuevasNotas = (citaActual.notas || '') + notaExtra;

      const { error } = await supabase
        .from('reservas')
        .update({
          valor_total: nuevoValorTotal,
          notas: nuevasNotas,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', reservaId);

      if (error) throw error;

      // Actualizar estado local de reservas
      setReservas((prev) =>
        prev.map((r) =>
          r.id === reservaId
            ? { ...r, valor_total: nuevoValorTotal, notas: nuevasNotas }
            : r
        )
      );

      // Si el popover está abierto con esta misma cita, refrescarlo
      if (popoverCita && popoverCita.cita.id === reservaId) {
        setPopoverCita({
          ...popoverCita,
          cita: {
            ...popoverCita.cita,
            valor_total: nuevoValorTotal,
            notas: nuevasNotas,
          },
        });
      }
    } finally {
      setGuardandoAdicional(false);
    }
  };

  const handleEliminarAdicional = async (cita: Reserva) => {
    if (!window.confirm('¿Deseas remover los adicionales registrados en esta cita y volver al valor base?')) {
      return;
    }
    try {
      const totalAds = sumarAdicionalesCita(cita.notas);
      const nuevoValorTotal = Math.max(0, Number(cita.valor_total || 0) - totalAds);
      const nuevasNotas = (cita.notas || '')
        .replace(/\s*\|\s*✨\s*Adicional:[^|[]*\[ADICIONAL:\d+\]/gi, '')
        .replace(/\[ADICIONAL:\d+\]/gi, '')
        .trim();

      const { error } = await supabase
        .from('reservas')
        .update({
          valor_total: nuevoValorTotal,
          notas: nuevasNotas,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', cita.id);

      if (error) throw error;

      setReservas((prev) =>
        prev.map((r) =>
          r.id === cita.id
            ? { ...r, valor_total: nuevoValorTotal, notas: nuevasNotas }
            : r
        )
      );

      if (popoverCita && popoverCita.cita.id === cita.id) {
        setPopoverCita({
          ...popoverCita,
          cita: {
            ...popoverCita.cita,
            valor_total: nuevoValorTotal,
            notas: nuevasNotas,
          },
        });
      }
    } catch (err: any) {
      console.error('Error al remover adicional:', err);
      alert('No se pudo quitar el adicional: ' + err.message);
    }
  };

  const cargarConfigAnticipo = async () => {
    try {
      const res = await fetch('/api/spa/config');
      if (res.ok) {
        const d = await res.json();
        const montoFijo = Number(d.montoAnticipoFijo ?? d.porcentajeAnticipo) || 20000;
        setConfigAnticipo({
          exigeAnticipo: Boolean(d.exigeAnticipo),
          montoAnticipoFijo: montoFijo,
          porcentajeAnticipo: montoFijo,
          nequiNumero: d.nequiNumero || '',
          bancolombiaNumero: d.bancolombiaNumero || '',
          llaveNumero: d.llaveNumero || '',
          titularCuenta: d.titularCuenta || '',
          horaApertura: d.horaApertura || '08:00',
          horaCierre: d.horaCierre || '19:00',
        });
      }
    } catch (e) {
      console.error('Error al cargar config de anticipo y horario:', e);
    }
  };

  const handleGuardarConfigAnticipo = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoConfigAnticipo(true);
    try {
      const res = await fetch('/api/spa/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configAnticipo),
      });
      if (res.ok) {
        try { sessionStorage.removeItem('mimate_bootstrap'); } catch {}
        setModalConfigAnticipoAbierto(false);
        cargarReservas();
      } else {
        console.error('No se pudo guardar la configuración.');
      }
    } catch (err: any) {
      console.error('Error guardando configuración:', err.message);
    } finally {
      setGuardandoConfigAnticipo(false);
    }
  };

  const handleAprobarAnticipo = async (reservaId: string, nombreClienta: string) => {
    if (!window.confirm(`¿Aprobar el anticipo de "${nombreClienta}"? Se confirmará la cita y se enviará la notificación oficial por WhatsApp.`)) return;
    setProcesandoAccionAnticipo(reservaId);
    try {
      const res = await fetch(`/api/reservas/${reservaId}/aprobar-anticipo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas_admin: 'Aprobado manualmente desde el Visor de Control' }),
      });
      if (res.ok) {
        await cargarReservas();
      } else {
        alert('No se pudo aprobar el anticipo.');
      }
    } catch (err: any) {
      alert('Error aprobando anticipo: ' + err.message);
    } finally {
      setProcesandoAccionAnticipo(null);
    }
  };

  const handleRechazarAnticipo = async (reservaId: string, nombreClienta: string) => {
    const motivo = window.prompt(
      `¿Rechazar el turno de "${nombreClienta}" y liberar el horario? Escribe un motivo breve para la clienta:`,
      'Comprobante no válido o tiempo límite expirado'
    );
    if (motivo === null) return;
    setProcesandoAccionAnticipo(reservaId);
    try {
      const res = await fetch(`/api/reservas/${reservaId}/rechazar-anticipo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() || 'Comprobante no válido o tiempo límite expirado' }),
      });
      if (res.ok) {
        await cargarReservas();
      } else {
        alert('No se pudo rechazar la reserva.');
      }
    } catch (err: any) {
      alert('Error rechazando reserva: ' + err.message);
    } finally {
      setProcesandoAccionAnticipo(null);
    }
  };

  useEffect(() => {
    if (esAdmin) {
      cargarExclusionesBot();
      cargarConfigAnticipo();
    }
  }, [esAdmin]);

  const abrirModalExclusiones = () => {
    setNuevoTelExclusion('');
    setNuevoNombreExclusion('');
    setErrorExclusion(null);
    setBusquedaExclusion('');
    setModalExclusionesAbierto(true);
    cargarExclusionesBot();
  };

  const handleAgregarExclusion = async (e: React.FormEvent) => {
    e.preventDefault();
    const telLimpio = nuevoTelExclusion.replace(/\D/g, '');
    if (!telLimpio || telLimpio.length < 7) {
      setErrorExclusion('Por favor ingresa un número de teléfono válido.');
      return;
    }

    setGuardandoExclusion(true);
    setErrorExclusion(null);
    try {
      const res = await fetch('/api/bot/exclusiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefono: telLimpio,
          nombre: nuevoNombreExclusion.trim() || undefined,
        }),
      });

      if (res.ok) {
        setNuevoTelExclusion('');
        setNuevoNombreExclusion('');
        await cargarExclusionesBot();
      } else {
        const data = await res.json();
        setErrorExclusion(data.error || 'No se pudo guardar la restricción.');
      }
    } catch (err: any) {
      setErrorExclusion('Error de conexión al agregar número.');
    } finally {
      setGuardandoExclusion(false);
    }
  };

  // Abrir modal de confirmación con los colores de la app para Reactivar Bot
  const solicitarReactivarBot = (telefono: string, nombre?: string) => {
    setExclusionAReactivar({ telefono, nombre });
  };

  // Procesar reactivación confirmada
  const handleConfirmarReactivarBot = async () => {
    if (!exclusionAReactivar) return;
    setReactivandoBot(true);
    try {
      const res = await fetch(`/api/bot/exclusiones/${exclusionAReactivar.telefono}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setExclusionesBot((prev) => prev.filter((item) => item.telefono !== exclusionAReactivar.telefono));
        setExclusionAReactivar(null);
      } else {
        alert('No se pudo reactivar el bot en el servidor.');
      }
    } catch (e) {
      console.error('Error eliminando restricción:', e);
      alert('Error de conexión al reactivar el bot.');
    } finally {
      setReactivandoBot(false);
    }
  };

  // Objeto de la manicurista actualmente seleccionada en el formulario
  const manicuristaSeleccionadaForm = useMemo(() => {
    return canchas.find((c) => c.id === agendarManicuristaId) || canchas[0];
  }, [canchas, agendarManicuristaId]);

  // Objeto del servicio actualmente seleccionado en el formulario
  const servicioSeleccionadoForm = useMemo(() => {
    return servicios.find((s) => s.id === Number(agendarServicioId)) || servicios[0];
  }, [servicios, agendarServicioId]);

  // Servicios extras seleccionados en el modal de agendar admin
  const serviciosExtrasForm = useMemo(() => {
    return servicios.filter((s) => agendarServiciosExtrasIds.includes(s.id));
  }, [servicios, agendarServiciosExtrasIds]);

  // Duración total combinada (principal + extras)
  const duracionTotalAdmin = useMemo(() => {
    const durPrincipal = servicioSeleccionadoForm?.duracion || 45;
    const durExtras = serviciosExtrasForm.reduce((acc, s) => acc + (s.duracion || 0), 0);
    return durPrincipal + durExtras;
  }, [servicioSeleccionadoForm, serviciosExtrasForm]);

  // Precio total combinado (principal + extras)
  const precioTotalAdmin = useMemo(() => {
    const prePrincipal = servicioSeleccionadoForm?.precio || 16000;
    const preExtras = serviciosExtrasForm.reduce((acc, s) => acc + (s.precio || 0), 0);
    return prePrincipal + preExtras;
  }, [servicioSeleccionadoForm, serviciosExtrasForm]);

  // Nombre de servicios combinados (ej. "Manos + Pies")
  const nombreServiciosAdmin = useMemo(() => {
    if (!servicioSeleccionadoForm) return 'Manos';
    if (serviciosExtrasForm.length === 0) return servicioSeleccionadoForm.nombre;
    return [servicioSeleccionadoForm.nombre, ...serviciosExtrasForm.map((s) => s.nombre)].join(' + ');
  }, [servicioSeleccionadoForm, serviciosExtrasForm]);

  // Horas base de opciones de bloqueo calculadas dinámicamente según horario configurado en el spa (1 hora por bloque)
  const horasOpcionesBloqueoDinamicas = useMemo(() => {
    return calcularHorasOpcionesBloqueo(configAnticipo.horaApertura, configAnticipo.horaCierre, 60);
  }, [configAnticipo.horaApertura, configAnticipo.horaCierre]);

  // Horas para el timeline visual calculadas dinámicamente según horario de apertura y cierre
  // Si hay citas activas de Admin/Especialistas que terminan después del cierre, se extiende automáticamente el timeline
  const horasTimeline = useMemo(() => {
    const baseHoras = calcularHorasTimeline(configAnticipo.horaApertura, configAnticipo.horaCierre);
    const maxBase = baseHoras[baseHoras.length - 1] ?? 19;
    let maxHoraFin = maxBase;

    for (const r of reservas) {
      if (r.estado === 'cancelada' || !r.fecha_fin) continue;
      const hhmmFin = obtenerHoraMinutosBogota(r.fecha_fin);
      const [hFin, mFin] = hhmmFin.split(':').map(Number);
      if (!isNaN(hFin)) {
        const horaTecho = mFin > 0 ? hFin + 1 : hFin;
        if (horaTecho > maxHoraFin) {
          maxHoraFin = Math.min(23, horaTecho);
        }
      }
    }

    if (maxHoraFin > maxBase) {
      const extendidas = [...baseHoras];
      for (let h = maxBase + 1; h <= maxHoraFin; h++) {
        extendidas.push(h);
      }
      return extendidas;
    }
    return baseHoras;
  }, [configAnticipo.horaApertura, configAnticipo.horaCierre, reservas]);

  // Horas libres para el modal de Agendar Cita con cálculo dinámico por duración y fin de citas previas
  const horasDisponiblesAgendarAdmin = useMemo(() => {
    if (!agendarFecha || !agendarManicuristaId) return [];
    const esDiciembre = agendarFecha ? /^\d{4}-12-/.test(agendarFecha.trim()) : false;
    if (new Date(`${agendarFecha}T12:00:00-05:00`).getDay() === 0 && !esDiciembre) return [];

    const aperturaStr = configAnticipo.horaApertura || '08:00';
    const cierreStr = configAnticipo.horaCierre || '19:00';
    const duracionMinutos = duracionTotalAdmin;
    const horaCierreMs = new Date(`${agendarFecha}T${cierreStr}:00-05:00`).getTime();
    const horaAperturaMs = new Date(`${agendarFecha}T${aperturaStr}:00-05:00`).getTime();
    const ahoraMs = Date.now();
    const esHoy = agendarFecha === hoyStr;

    // Generar franjas base cada 30 minutos desde la hora de apertura hasta la de cierre
    const [aperH, aperM] = aperturaStr.split(':').map(Number);
    const [cierH, cierM] = cierreStr.split(':').map(Number);
    const startMin = (isNaN(aperH) ? 8 : aperH) * 60 + (isNaN(aperM) ? 0 : aperM);
    const endMin = (isNaN(cierH) ? 19 : cierH) * 60 + (isNaN(cierM) ? 0 : cierM);

    const horasBaseAdmin: string[] = [];
    for (let m = startMin; m < endMin; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      horasBaseAdmin.push(`${hh}:${mm}`);
    }

    const candidatosSet = new Set<string>(horasBaseAdmin);

    // Reservas activas de la manicurista seleccionada en esta fecha
    const reservasMani = reservas.filter((r) => {
      if (r.estado === 'cancelada') return false;
      if (r.cancha_id !== agendarManicuristaId) return false;
      if (!r.fecha_inicio) return false;
      const fCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
        timeZone: 'America/Bogota',
      });
      return fCita === agendarFecha;
    });

    // Añadir puntos de inicio candidatos donde terminan citas previas de esa manicurista
    for (const r of reservasMani) {
      if (r.fecha_fin) {
        try {
          const hhmmFin = obtenerHoraMinutosBogota(r.fecha_fin);
          const finMs = new Date(`${agendarFecha}T${hhmmFin}:00-05:00`).getTime();
          if (finMs >= horaAperturaMs && finMs < horaCierreMs) {
            candidatosSet.add(hhmmFin);
          }
        } catch {
          // Ignorar
        }
      }
    }

    const candidatosOrdenados = Array.from(candidatosSet).sort();
    const libres: string[] = [];

    for (const h of candidatosOrdenados) {
      const slotStartMs = new Date(`${agendarFecha}T${h}:00-05:00`).getTime();
      const slotEndMs = slotStartMs + duracionMinutos * 60 * 1000;

      // 1. Si es hoy y el horario ya pasó, no se puede agendar
      if (esHoy && slotStartMs <= ahoraMs) {
        continue;
      }

      // Si es una fecha anterior a hoy en Colombia, descartar todo
      if (agendarFecha < hoyStr) {
        continue;
      }

      // 2. En el panel de Admin y Especialistas se permite que la cita finalice después de la hora de cierre
      // siempre que inicie antes de la hora de cierre configurada (ej. inicia 6:00 PM y termina 8:00 PM con cierre 7:00 PM)
      if (slotStartMs >= horaCierreMs) {
        continue;
      }

      // 3. Validar si solapa con alguna reserva activa o bloqueada existente de esta manicurista
      const colisiona = reservasMani.some((r) => {
        const rStart = new Date(r.fecha_inicio).getTime();
        const rEnd = new Date(r.fecha_fin).getTime();
        return rStart < slotEndMs && rEnd > slotStartMs;
      });

      if (!colisiona) {
        libres.push(h);
      }
    }

    return libres;
  }, [reservas, agendarFecha, agendarManicuristaId, duracionTotalAdmin, hoyStr, configAnticipo.horaApertura, configAnticipo.horaCierre]);

  // Si cambia la manicurista, el servicio o la fecha en el modal de agendar, ajustar a una hora disponible
  useEffect(() => {
    if (modalAgendarAbierto) {
      if (horasDisponiblesAgendarAdmin.length > 0) {
        if (!horasDisponiblesAgendarAdmin.includes(agendarHora)) {
          if (agendarHora && agendarHora.includes(':')) {
            const [th, tm] = agendarHora.split(':').map(Number);
            const targetMin = (isNaN(th) ? 0 : th) * 60 + (isNaN(tm) ? 0 : tm);
            const parseMin = (hStr: string) => {
              const [hh, mm] = hStr.split(':').map(Number);
              return (isNaN(hh) ? 0 : hh) * 60 + (isNaN(mm) ? 0 : mm);
            };
            const posterior = horasDisponiblesAgendarAdmin.find((h) => parseMin(h) >= targetMin);
            if (posterior) {
              setAgendarHora(posterior);
            } else {
              const masCercana = [...horasDisponiblesAgendarAdmin].sort(
                (a, b) => Math.abs(parseMin(a) - targetMin) - Math.abs(parseMin(b) - targetMin)
              )[0];
              setAgendarHora(masCercana);
            }
          } else {
            setAgendarHora(horasDisponiblesAgendarAdmin[0]);
          }
        }
      } else {
        setAgendarHora('');
      }
    }
  }, [modalAgendarAbierto, agendarFecha, agendarManicuristaId, duracionTotalAdmin, horasDisponiblesAgendarAdmin]);

  // Horas ya ocupadas o bloqueadas para el modal de Bloquear Horario
  const horasYaOcupadasBloqueo = useMemo(() => {
    if (!bloquearFecha) return new Set<string>();

    const ocupadas = new Set<string>();

    for (const h of horasOpcionesBloqueoDinamicas) {
      const slotStartMs = new Date(`${bloquearFecha}T${h}:00-05:00`).getTime();
      const slotEndMs = slotStartMs + 60 * 60 * 1000;

      const estaOcupada = reservas.some((r) => {
        if (r.estado === 'cancelada') return false;
        if (bloquearManicuristaId !== 'todas' && r.cancha_id !== bloquearManicuristaId) return false;
        const rStart = new Date(r.fecha_inicio).getTime();
        const rEnd = new Date(r.fecha_fin).getTime();
        return rStart < slotEndMs && rEnd > slotStartMs;
      });

      if (estaOcupada) {
        ocupadas.add(h);
      }
    }

    return ocupadas;
  }, [reservas, bloquearFecha, bloquearManicuristaId, horasOpcionesBloqueoDinamicas]);

  // Horas que ya han pasado para el modal de Bloquear Horario (no se pueden bloquear)
  const horasYaPasadasBloqueo = useMemo(() => {
    if (!bloquearFecha) return new Set<string>();
    const pasadas = new Set<string>();
    const ahoraMs = ahora.getTime();
    const esFechaPasada = bloquearFecha < hoyStr;
    const esHoy = bloquearFecha === hoyStr;

    if (esFechaPasada) {
      for (const h of horasOpcionesBloqueoDinamicas) {
        pasadas.add(h);
      }
      return pasadas;
    }

    if (esHoy) {
      for (const h of horasOpcionesBloqueoDinamicas) {
        const slotStartMs = new Date(`${bloquearFecha}T${h}:00-05:00`).getTime();
        if (slotStartMs <= ahoraMs) {
          pasadas.add(h);
        }
      }
    }

    return pasadas;
  }, [bloquearFecha, hoyStr, horasOpcionesBloqueoDinamicas, ahora]);

  // 1. Cargar datos del Spa (Equipo, Servicios, Configuración unificada)
  const cargarInfoSpa = async () => {
    try {
      const res = await fetch('/api/spa/info');
      if (res.ok) {
        const d = await res.json();
        const idReal = d.complejo?.id || complejoId || '3bd1708c-21de-42a8-a529-d7c91fd41ed2';
        setIdComplejoDetectado(idReal);
        if (d.equipo) {
          const normalizadas = d.equipo
            .filter((c: any) => {
              const nLower = (c.nombre || '').toLowerCase();
              return !nLower.includes('manicurista 4') && nLower !== '4';
            })
            .map((c: any) => {
              let nombre = c.nombre;
              const nLower = nombre.trim().toLowerCase();
              if (nLower.includes('manicurista 1') || nLower === '1') nombre = 'Lili';
              else if (nLower.includes('manicurista 2') || nLower === '2') nombre = 'Jhoana';
              else if (nLower.includes('manicurista 3') || nLower === '3') nombre = 'Manuela';
              const foto = c.foto || FOTOS_EQUIPO_ADMIN[nombre.toLowerCase()] || FOTOS_EQUIPO_ADMIN[c.nombre.toLowerCase()] || null;
              return { ...c, nombre, foto };
            });
          setCanchas(normalizadas);
        }
        if (d.servicios) setServicios(d.servicios);
        if (d.config) {
          const montoFijo = Number(d.config.montoAnticipoFijo ?? d.config.porcentajeAnticipo) || 20000;
          setConfigAnticipo({
            exigeAnticipo: Boolean(d.config.exigeAnticipo),
            montoAnticipoFijo: montoFijo,
            porcentajeAnticipo: montoFijo,
            nequiNumero: d.config.nequiNumero || '',
            bancolombiaNumero: d.config.bancolombiaNumero || '',
            llaveNumero: d.config.llaveNumero || '',
            titularCuenta: d.config.titularCuenta || '',
            horaApertura: d.config.horaApertura || '08:00',
            horaCierre: d.config.horaCierre || '19:00',
          });
        }
        cargarReservas(idReal);
      }
    } catch (e) {
      console.error('Error cargando info spa:', e);
    }
  };

  // 2. Cargar Reservas del Spa
  const cargarReservas = async (overrideId?: string | unknown, silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const spaId =
        typeof overrideId === 'string' && overrideId
          ? overrideId
          : idComplejoDetectado || complejoId || '3bd1708c-21de-42a8-a529-d7c91fd41ed2';
      const res = await fetch(`/api/reservas?complejo_id=${spaId}`);
      if (res.ok) {
        const data = await res.json();
        const dataOrdenada = Array.isArray(data)
          ? data
              .map(hidratarHorarioRealReserva)
              .sort((a: Reserva, b: Reserva) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
          : [];
        setReservas(dataOrdenada);
      }
    } catch (e) {
      console.error('Error cargando reservas:', e);
    } finally {
      if (!silencioso) setCargando(false);
    }
  };

  useEffect(() => {
    cargarInfoSpa();
    cargarReservas();
    cargarConfigAnticipo();
  }, [complejoId]);

  // Suscripción Realtime a cambios en reservas (Broadcast + Postgres + Polling inteligente)
  useEffect(() => {
    const canal = supabase
      .channel('mimate-reservas-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservas',
        },
        (payload) => {
          console.log('⚡ [Realtime Postgres] Cambio detectado en reservas:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            mostrarNotificacionRealtime('¡Nueva cita agendada en vivo!');
          } else if (payload.eventType === 'UPDATE') {
            mostrarNotificacionRealtime('¡Cita o turno actualizado en vivo!');
          } else if (payload.eventType === 'DELETE') {
            mostrarNotificacionRealtime('Turno liberado en vivo');
          }
          // Refresco silencioso en segundo plano sin bloquear la pantalla
          cargarReservas(undefined, true);
        }
      )
      .on('broadcast', { event: 'cambio-reservas' }, (payload: any) => {
        console.log('⚡ [Realtime Broadcast] Cambio en reservas recibido:', payload);
        const evType = payload.payload?.eventType || payload.payload?.accion || 'UPDATE';
        if (evType === 'INSERT') {
          mostrarNotificacionRealtime('¡Nueva cita agendada en vivo!');
        } else if (evType === 'UPDATE') {
          mostrarNotificacionRealtime('¡Cita o turno actualizado en vivo!');
        } else if (evType === 'DELETE') {
          mostrarNotificacionRealtime('Turno liberado en vivo');
        }
        cargarReservas(undefined, true);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('⚡ [Realtime] Conectado a eventos de reservas');
          setRealtimeConectado(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeConectado(false);
        }
      });

    // Polling inteligente de respaldo cada 5 segundos (silencioso, sin parpadeos ni spinners)
    const pollTimer = setInterval(() => {
      cargarReservas(undefined, true);
    }, 5000);

    // Actualización automática instantánea al cambiar o enfocar la pestaña
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        cargarReservas(undefined, true);
      }
    };
    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(canal);
      if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    };
  }, [idComplejoDetectado, complejoId]);

  // Sincronizar perfiles con IDs de las canchas en la BD
  const perfilesConIds: StaffProfile[] = useMemo(() => {
    return PERFILES_SPA_CONFIG.map((p) => {
      const canchaEncontrada = canchas.find((c) => {
        const cLower = c.nombre.toLowerCase();
        const pMatch = p.canchaNombreMatch.toLowerCase();
        return (
          cLower.includes(pMatch) ||
          (p.id === 'admin-m1' && (cLower.includes('1') || cLower.includes('lili'))) ||
          ((p.id === 'staff-m2' || p.id === 'admin-m2') && (cLower.includes('2') || cLower.includes('jhoana'))) ||
          (p.id === 'staff-m3' && (cLower.includes('3') || cLower.includes('manuela')))
        );
      });
      return {
        ...p,
        canchaId: canchaEncontrada?.id,
      };
    });
  }, [canchas]);

  // Si el perfil guardado en localStorage no tiene canchaId o cambió de rol, sincronizarlo
  useEffect(() => {
    if (perfilActual) {
      const match = perfilesConIds.find(
        (p) =>
          p.id === perfilActual.id ||
          (perfilActual.id === 'staff-m2' && p.id === 'admin-m2') ||
          p.canchaNombreMatch.toLowerCase() === perfilActual.canchaNombreMatch?.toLowerCase() ||
          p.nombre.toLowerCase().includes(perfilActual.nombre.toLowerCase().split(' ')[0])
      );
      if (match) {
        if (
          match.rol !== perfilActual.rol ||
          match.nombre !== perfilActual.nombre ||
          match.foto !== perfilActual.foto ||
          (match.canchaId && match.canchaId !== perfilActual.canchaId)
        ) {
          const actualizado = { ...perfilActual, ...match };
          setPerfilActual(actualizado);
          const { pinHash: _hash, ...actualizadoSinHash } = actualizado;
          localStorage.setItem('mimate_staff_profile', JSON.stringify(actualizadoSinHash));
        }
      }
    }
  }, [perfilesConIds]);

  // Dirección de transición para animación suave (1 = hacia adelante / siguiente, -1 = hacia atrás / anterior)
  const [direccionSlide, setDireccionSlide] = useState<number>(1);

  // Formato corto para feedback flotante de cambio de día ("Lun 17 nov", "Hoy")
  const obtenerEtiquetaCorta = (fechaIso: string) => {
    if (fechaIso === hoyStr) return 'Hoy';
    const [y, m, d] = fechaIso.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, d);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${dias[fechaObj.getDay()]} ${fechaObj.getDate()} ${meses[fechaObj.getMonth()]}`;
  };

  // Navegar días hacia atrás o adelante
  const cambiarDia = (offset: number) => {
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, d);
    fechaObj.setDate(fechaObj.getDate() + offset);
    const nuevoY = fechaObj.getFullYear();
    const nuevoM = String(fechaObj.getMonth() + 1).padStart(2, '0');
    const nuevoD = String(fechaObj.getDate()).padStart(2, '0');
    const nuevaIso = `${nuevoY}-${nuevoM}-${nuevoD}`;
    setDireccionSlide(offset > 0 ? 1 : -1);
    setFechaSeleccionada(nuevaIso);
    return nuevaIso;
  };

  // Navegar semanas hacia atrás o adelante (desplaza 7 días)
  const cambiarSemana = (offsetSemanas: number) => {
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, d);
    fechaObj.setDate(fechaObj.getDate() + offsetSemanas * 7);
    const nuevoY = fechaObj.getFullYear();
    const nuevoM = String(fechaObj.getMonth() + 1).padStart(2, '0');
    const nuevoD = String(fechaObj.getDate()).padStart(2, '0');
    const nuevaIso = `${nuevoY}-${nuevoM}-${nuevoD}`;
    setDireccionSlide(offsetSemanas > 0 ? 1 : -1);
    setFechaSeleccionada(nuevaIso);
    return nuevaIso;
  };

  const irAFecha = (nuevaIso: string) => {
    if (nuevaIso === fechaSeleccionada) return;
    setDireccionSlide(nuevaIso > fechaSeleccionada ? 1 : -1);
    setFechaSeleccionada(nuevaIso);
  };

  // ============================================================================
  // GESTOS TÁCTILES MÓVILES (SWIPE DÍA A DÍA Y SEMANA A SEMANA CON TOPE)
  // ============================================================================
  const [feedbackSwipe, setFeedbackSwipe] = useState<string | null>(null);
  const feedbackSwipeTimerRef = useRef<any>(null);
  const touchInicioRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const scrollSemanalRef = useRef<HTMLDivElement | null>(null);
  const headerScrollSemanalRef = useRef<HTMLDivElement | null>(null);
  const syncingSemanalScrollRef = useRef<'header' | 'body' | null>(null);
  const desktopHeaderRef = useRef<HTMLElement | null>(null);
  const mobileStickyBarRef = useRef<HTMLDivElement | null>(null);
  const [stickyTopOffset, setStickyTopOffset] = useState<number>(49);
  const columnasDiasSemanalRef = useRef<HTMLDivElement | null>(null);
  const scrollDiarioRef = useRef<HTMLDivElement | null>(null);
  const lienzoTimelineDiarioRef = useRef<HTMLDivElement | null>(null);
  const [dragCitaSemanal, setDragCitaSemanal] = useState<DragCitaSemanalState | null>(null);
  const dragCitaSemanalRef = useRef<DragCitaSemanalState | null>(null);
  const holdDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const lastPointerPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const isMovingCitaRef = useRef<boolean>(false);
  const suppressSwipeUntilRef = useRef<number>(0);
  const pointerHoldInfoRef = useRef<{
    modo: 'semanal' | 'diaria';
    pointerId: number;
    cita: Reserva;
    startX: number;
    startY: number;
    grabOffsetY: number;
    dayIndexOriginal: number;
    fechaOriginalIso: string;
    minInicioOriginal: number;
    duracionMinutos: number;
    alturaPx: number;
    cardEl: HTMLElement;
    dragging: boolean;
  } | null>(null);
  const touchSemanalRef = useRef<{
    startX: number;
    startY: number;
    scrollLeftStart: number;
    time: number;
  } | null>(null);

  useEffect(() => {
    const calcularOffset = () => {
      const mobileEl = mobileStickyBarRef.current;
      const desktopEl = desktopHeaderRef.current;
      if (mobileEl && mobileEl.offsetHeight > 0) {
        setStickyTopOffset(mobileEl.offsetHeight);
      } else if (desktopEl && typeof window !== 'undefined' && window.getComputedStyle(desktopEl).position === 'sticky') {
        setStickyTopOffset(desktopEl.offsetHeight);
      } else {
        setStickyTopOffset(0);
      }
    };
    calcularOffset();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calcularOffset) : null;
    if (ro) {
      if (mobileStickyBarRef.current) ro.observe(mobileStickyBarRef.current);
      if (desktopHeaderRef.current) ro.observe(desktopHeaderRef.current);
    }
    window.addEventListener('resize', calcularOffset);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', calcularOffset);
    };
  }, [perfilActual, tabAdmin, vistaAgenda]);

  const handleScrollHeaderSemanal = () => {
    if (syncingSemanalScrollRef.current === 'body') return;
    const hEl = headerScrollSemanalRef.current;
    const bEl = scrollSemanalRef.current;
    if (!hEl || !bEl) return;
    syncingSemanalScrollRef.current = 'header';
    bEl.scrollLeft = hEl.scrollLeft;
    requestAnimationFrame(() => {
      syncingSemanalScrollRef.current = null;
    });
  };

  const handleScrollBodySemanal = () => {
    if (syncingSemanalScrollRef.current === 'header') return;
    const hEl = headerScrollSemanalRef.current;
    const bEl = scrollSemanalRef.current;
    if (!hEl || !bEl) return;
    syncingSemanalScrollRef.current = 'body';
    hEl.scrollLeft = bEl.scrollLeft;
    requestAnimationFrame(() => {
      syncingSemanalScrollRef.current = null;
    });
  };

  const mostrarFeedbackSwipe = (texto: string) => {
    if (feedbackSwipeTimerRef.current) clearTimeout(feedbackSwipeTimerRef.current);
    setFeedbackSwipe(texto);
    feedbackSwipeTimerRef.current = setTimeout(() => {
      setFeedbackSwipe(null);
    }, 1100);
  };

  // 1. Gesto en Vista de Día: Deslizar izquierda -> siguiente día; derecha -> día anterior
  const handleTouchStartDia = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || dragCitaSemanalRef.current || pointerHoldInfoRef.current?.dragging) return;
    touchInicioRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchEndDia = (e: React.TouchEvent) => {
    if (
      !touchInicioRef.current ||
      dragCitaSemanalRef.current ||
      pointerHoldInfoRef.current?.dragging ||
      Date.now() < suppressSwipeUntilRef.current
    ) {
      touchInicioRef.current = null;
      return;
    }
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - touchInicioRef.current.x;
    const deltaY = touchEnd.clientY - touchInicioRef.current.y;
    const duracionMs = Date.now() - touchInicioRef.current.time;
    touchInicioRef.current = null;

    // Verificar intención horizontal limpia: recorrido >= 50px y al menos 1.4x más horizontal que vertical
    if (duracionMs < 800 && Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        // Desliza hacia la izquierda -> Siguiente día
        const nueva = cambiarDia(1);
        mostrarFeedbackSwipe(`👉 Pasando a ${obtenerEtiquetaCorta(nueva)}`);
      } else {
        // Desliza hacia la derecha -> Día anterior
        const nueva = cambiarDia(-1);
        mostrarFeedbackSwipe(`👈 Pasando a ${obtenerEtiquetaCorta(nueva)}`);
      }
    }
  };

  // 2. Gesto en Cabecera Semanal: Deslizar izquierda -> siguiente semana; derecha -> semana anterior
  const handleTouchStartCabeceraSemanal = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchInicioRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  };

  const handleTouchEndCabeceraSemanal = (e: React.TouchEvent) => {
    if (!touchInicioRef.current) return;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - touchInicioRef.current.x;
    const deltaY = touchEnd.clientY - touchInicioRef.current.y;
    const duracionMs = Date.now() - touchInicioRef.current.time;
    touchInicioRef.current = null;

    if (duracionMs < 800 && Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        cambiarSemana(1);
        mostrarFeedbackSwipe('👉 Semana siguiente');
      } else {
        cambiarSemana(-1);
        mostrarFeedbackSwipe('👈 Semana anterior');
      }
    }
  };

  // 3. Gesto en Grilla Semanal: Permite deslizar los días sin interferir.
  // Solo si está en el tope derecho y desliza hacia la izquierda -> semana siguiente.
  // Solo si está en el tope izquierdo y desliza hacia la derecha -> semana anterior.
  const handleTouchStartSemanalBody = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1 || dragCitaSemanalRef.current || pointerHoldInfoRef.current?.dragging) return;
    const container = e.currentTarget;
    touchSemanalRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      scrollLeftStart: container.scrollLeft,
      time: Date.now(),
    };
  };

  const handleTouchEndSemanalBody = (e: React.TouchEvent<HTMLDivElement>) => {
    if (
      !touchSemanalRef.current ||
      dragCitaSemanalRef.current ||
      pointerHoldInfoRef.current?.dragging ||
      Date.now() < suppressSwipeUntilRef.current
    ) {
      touchSemanalRef.current = null;
      return;
    }
    const container = e.currentTarget;
    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - touchSemanalRef.current.startX;
    const deltaY = touchEnd.clientY - touchSemanalRef.current.startY;
    const duracionMs = Date.now() - touchSemanalRef.current.time;
    const scrollLeftStart = touchSemanalRef.current.scrollLeftStart;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    touchSemanalRef.current = null;

    // Solo evaluar gestos deliberadamente horizontales
    if (duracionMs < 800 && Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      // Si la grilla completa cabe en pantalla (sin scroll horizontal necesario):
      if (maxScrollLeft <= 10) {
        if (deltaX < 0) {
          cambiarSemana(1);
          mostrarFeedbackSwipe('👉 Semana siguiente');
        } else {
          cambiarSemana(-1);
          mostrarFeedbackSwipe('👈 Semana anterior');
        }
        return;
      }

      // Si tiene scroll horizontal activo:
      // A. Tope derecho (Domingo): si estaba en el límite derecho y desliza hacia la izquierda
      const estabaEnTopeDerecho = scrollLeftStart >= maxScrollLeft - 20;
      const estaEnTopeDerecho = container.scrollLeft >= maxScrollLeft - 20;
      if (deltaX < 0 && (estabaEnTopeDerecho || estaEnTopeDerecho)) {
        cambiarSemana(1);
        mostrarFeedbackSwipe('👉 Semana siguiente');
        setTimeout(() => {
          if (scrollSemanalRef.current) scrollSemanalRef.current.scrollLeft = 0;
          if (headerScrollSemanalRef.current) headerScrollSemanalRef.current.scrollLeft = 0;
        }, 60);
        return;
      }

      // B. Tope izquierdo (Lunes): si estaba en el límite izquierdo y desliza hacia la derecha
      const estabaEnTopeIzquierdo = scrollLeftStart <= 20;
      const estaEnTopeIzquierdo = container.scrollLeft <= 20;
      if (deltaX > 0 && (estabaEnTopeIzquierdo || estaEnTopeIzquierdo)) {
        cambiarSemana(-1);
        mostrarFeedbackSwipe('👈 Semana anterior');
        setTimeout(() => {
          if (scrollSemanalRef.current) scrollSemanalRef.current.scrollLeft = 0;
          if (headerScrollSemanalRef.current) headerScrollSemanalRef.current.scrollLeft = 0;
        }, 60);
        return;
      }

      // En cualquier otro caso: el usuario estaba deslizándose por los días intermedios (Martes a Sábado)
      // El scroll nativo se encarga fluidamente y NO cambia la semana.
    }
  };

  // Cálculo de los 7 días de la semana activa (Lunes a Domingo)
  const diasDeLaSemana = useMemo(() => {
    if (!fechaSeleccionada) return [];
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    const refDate = new Date(y, m - 1, d);
    const dayOfWeek = refDate.getDay(); // 0 es Domingo, 1 es Lunes...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate);
    monday.setDate(monday.getDate() + diffToMonday);

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const curDate = new Date(monday);
      curDate.setDate(monday.getDate() + i);
      const curY = curDate.getFullYear();
      const curM = String(curDate.getMonth() + 1).padStart(2, '0');
      const curD = String(curDate.getDate()).padStart(2, '0');
      const fechaIso = `${curY}-${curM}-${curD}`;

      const nombreDia = curDate.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
      const nombreDiaLargo = curDate.toLocaleDateString('es-CO', { weekday: 'long' });
      const diaNum = curDate.getDate();
      const mesCorto = curDate.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');

      dias.push({
        fechaIso,
        fechaObj: curDate,
        nombreCorto: nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1),
        nombreLargo: nombreDiaLargo.charAt(0).toUpperCase() + nombreDiaLargo.slice(1),
        diaNum,
        mesCorto,
        esHoy: fechaIso === hoyStr,
        esSeleccionada: fechaIso === fechaSeleccionada,
      });
    }
    return dias;
  }, [fechaSeleccionada, hoyStr]);

  // ============================================================================
  // DRAG & DROP (HOLD-TO-MOVE) CON SOPORTE DE TRASLAPE PARCIAL EN VISTAS SEMANAL Y DIARIA
  // Diferencia click corto (abre DetalleCitaPopover) vs mantener presionado (arrastre suave)
  // ============================================================================
  const validarDestinoCitaSemanal = (
    cita: Reserva,
    targetFechaIso: string,
    targetMinInicio: number,
    duracionMinutos: number
  ): { esValido: boolean; motivoInvalido: string | null; esTraslapeParcial?: boolean } => {
    const horaAperturaNum = parseInt((configAnticipo.horaApertura || '08:00').split(':')[0], 10) || 8;
    const horaInicioStr = formatearMinutosAHHMM(horaAperturaNum, targetMinInicio);
    const slotStartMs = new Date(`${targetFechaIso}T${horaInicioStr}:00-05:00`).getTime();
    const slotEndMs = slotStartMs + duracionMinutos * 60 * 1000;

    // 1. Domingo cerrado (excepto diciembre)
    const esDiciembre = /^\d{4}-12-/.test(targetFechaIso);
    const esDomingo = new Date(`${targetFechaIso}T12:00:00-05:00`).getDay() === 0;
    if (esDomingo && !esDiciembre) {
      return { esValido: false, motivoInvalido: 'Domingo cerrado' };
    }

    // 2. Fecha u hora ya pasada
    if (targetFechaIso < hoyStr || slotStartMs <= Date.now()) {
      return { esValido: false, motivoInvalido: 'Horario ya pasado' };
    }

    // 3. El inicio no puede ser igual o posterior a la hora de cierre del spa (el fin sí puede extenderse más allá del cierre para Admin/Especialistas)
    const cierreStr = (configAnticipo.horaCierre || '19:00').slice(0, 5);
    const horaCierreMs = new Date(`${targetFechaIso}T${cierreStr}:00-05:00`).getTime();
    if (slotStartMs >= horaCierreMs) {
      return { esValido: false, motivoInvalido: 'Inicia después del cierre' };
    }

    // 4. Evaluar traslape parcial con citas activas de la misma especialista
    const colisiones = reservas.filter((r) => {
      if (r.id === cita.id || r.estado === 'cancelada' || r.cancha_id !== cita.cancha_id) return false;
      if (!r.fecha_inicio) return false;
      const rStart = new Date(r.fecha_inicio).getTime();
      const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60000;
      return rStart < slotEndMs && rEnd > slotStartMs;
    });

    if (colisiones.length === 0) {
      return { esValido: true, motivoInvalido: null, esTraslapeParcial: false };
    }

    if (colisiones.some((r) => r.estado === 'bloqueada')) {
      return { esValido: false, motivoInvalido: 'Horario bloqueado' };
    }

    if (colisiones.length > 1) {
      return { esValido: false, motivoInvalido: 'Traslape múltiple' };
    }

    const otra = colisiones[0];
    const oStart = new Date(otra.fecha_inicio).getTime();
    const oEnd = otra.fecha_fin ? new Date(otra.fecha_fin).getTime() : oStart + 45 * 60000;

    if (
      slotStartMs === oStart ||
      slotEndMs === oEnd ||
      (slotStartMs >= oStart && slotEndMs <= oEnd) ||
      (oStart >= slotStartMs && oEnd <= slotEndMs)
    ) {
      return { esValido: false, motivoInvalido: 'Sin traslape total' };
    }

    const overlapMs = Math.min(slotEndMs, oEnd) - Math.max(slotStartMs, oStart);
    const restanteMovidaMs = slotEndMs - slotStartMs - overlapMs;
    const restanteOtraMs = oEnd - oStart - overlapMs;

    if (restanteMovidaMs < MIN_NO_TRASLAPE_MS || restanteOtraMs < MIN_NO_TRASLAPE_MS) {
      return { esValido: false, motivoInvalido: 'Traslape excesivo' };
    }

    return { esValido: true, motivoInvalido: null, esTraslapeParcial: true };
  };

  const handleMoverCitaSemanal = async (drag: DragCitaSemanalState) => {
    if (isMovingCitaRef.current) return;
    isMovingCitaRef.current = true;

    const horaAperturaNum = parseInt((configAnticipo.horaApertura || '08:00').split(':')[0], 10) || 8;
    const horaInicioNueva = formatearMinutosAHHMM(horaAperturaNum, drag.targetMinInicio);
    const dInicio = new Date(`${drag.targetFechaIso}T${horaInicioNueva}:00-05:00`);
    const dFin = new Date(dInicio.getTime() + drag.duracionMinutos * 60 * 1000);
    const nuevoInicioIso = dInicio.toISOString();
    const nuevoFinIso = dFin.toISOString();
    const horaFinNueva = obtenerHoraMinutosBogota(nuevoFinIso);
    const nombreClienta = obtenerNombreClienta(drag.cita);

    const estadoPrevio = {
      fecha_inicio: drag.cita.fecha_inicio,
      fecha_fin: drag.cita.fecha_fin,
      db_fecha_inicio: drag.cita.db_fecha_inicio,
      db_fecha_fin: drag.cita.db_fecha_fin,
      notas: drag.cita.notas,
    };

    // Actualización optimista inmediata: libera el horario anterior y ocupa el nuevo
    setReservas((prev) =>
      prev.map((r) =>
        r.id === drag.cita.id
          ? { ...r, fecha_inicio: nuevoInicioIso, fecha_fin: nuevoFinIso }
          : r
      )
    );

    try {
      let apiHandled = false;
      try {
        const res = await fetch(`/api/reservas/${drag.cita.id}/horario`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha_inicio: nuevoInicioIso,
            fecha_fin: nuevoFinIso,
          }),
        });

        if (res.ok) {
          apiHandled = true;
          const payload = await res.json().catch(() => null);
          if (payload?.reserva) {
            const hydrated = hidratarHorarioRealReserva(payload.reserva);
            setReservas((prev) =>
              prev.map((r) => (r.id === drag.cita.id ? { ...r, ...hydrated } : r))
            );
          }
        } else if (res.status === 400 || res.status === 404 || res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'No se pudo mover la cita a ese horario.');
        }
      } catch (errApi: any) {
        if (errApi instanceof Error && errApi.name !== 'TypeError') {
          throw errApi;
        }
        console.warn('API /api/reservas/:id/horario offline, usando Supabase directo:', errApi);
      }

      if (!apiHandled) {
        const persistencia = calcularPersistenciaTraslapeFallback({
          idReserva: drag.cita.id,
          canchaId: drag.cita.cancha_id,
          dInicio,
          dFin,
          notasActuales: drag.cita.notas,
          todasReservas: reservas,
        });

        if (!persistencia) {
          throw new Error('No queda espacio disponible para ubicar este traslape sin afectar otra cita.');
        }

        const { error: sbErr } = await supabase
          .from('reservas')
          .update({
            fecha_inicio: persistencia.dbFechaInicio,
            fecha_fin: persistencia.dbFechaFin,
            notas: persistencia.notasFinal,
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', drag.cita.id);

        if (sbErr) {
          if (sbErr.code === '23P01') {
            throw new Error('Este horario ya está ocupado por otra cita o bloqueo.');
          }
          throw sbErr;
        }

        setReservas((prev) =>
          prev.map((r) =>
            r.id === drag.cita.id
              ? {
                  ...r,
                  fecha_inicio: nuevoInicioIso,
                  fecha_fin: nuevoFinIso,
                  db_fecha_inicio: persistencia.dbFechaInicio,
                  db_fecha_fin: persistencia.dbFechaFin,
                  notas: persistencia.notasFinal,
                }
              : r
          )
        );
      }

      try {
        sessionStorage.removeItem('mimate_bootstrap');
      } catch {}

      mostrarNotificacionRealtime(
        drag.esTraslapeParcial
          ? `✨ Cita de ${nombreClienta} movida con traslape parcial (${formatearHora12(horaInicioNueva)} - ${formatearHora12(horaFinNueva)})`
          : `✨ Cita de ${nombreClienta} reprogramada: ${formatearHora12(horaInicioNueva)} - ${formatearHora12(horaFinNueva)}`
      );
    } catch (err: any) {
      // Revertir en caso de conflicto o error
      setReservas((prev) =>
        prev.map((r) =>
          r.id === drag.cita.id
            ? {
                ...r,
                fecha_inicio: estadoPrevio.fecha_inicio,
                fecha_fin: estadoPrevio.fecha_fin,
                db_fecha_inicio: estadoPrevio.db_fecha_inicio,
                db_fecha_fin: estadoPrevio.db_fecha_fin,
                notas: estadoPrevio.notas,
              }
            : r
        )
      );
      mostrarNotificacionRealtime(
        `⚠️ ${err?.message || 'No se pudo mover la cita. Se restauró su horario.'}`
      );
    } finally {
      isMovingCitaRef.current = false;
    }
  };

  const detenerAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  };

  const actualizarPosicionDrag = (clientX: number, clientY: number) => {
    const info = pointerHoldInfoRef.current;
    if (!info || !info.dragging) return;

    const esDiario = info.modo === 'diaria';
    const gridEl = esDiario ? lienzoTimelineDiarioRef.current : columnasDiasSemanalRef.current;
    if (!gridEl || (!esDiario && diasDeLaSemana.length < 7)) return;

    const gridRect = gridEl.getBoundingClientRect();
    if (gridRect.width <= 0) return;

    let targetDayIndex = 0;
    let targetFechaIso = info.fechaOriginalIso;
    if (!esDiario) {
      const colWidth = gridRect.width / 7;
      const relX = clientX - gridRect.left;
      targetDayIndex = Math.max(0, Math.min(6, Math.floor(relX / colWidth)));
      const targetDia = diasDeLaSemana[targetDayIndex];
      if (!targetDia) return;
      targetFechaIso = targetDia.fechaIso;
    }

    const horaAperturaNum = parseInt((configAnticipo.horaApertura || '08:00').split(':')[0], 10) || 8;
    const horaCierreNum = parseInt((configAnticipo.horaCierre || '19:00').split(':')[0], 10) || 19;
    const cierreParts = (configAnticipo.horaCierre || '19:00').slice(0, 5).split(':').map(Number);
    const cierreMinTotal = (isNaN(cierreParts[0]) ? horaCierreNum : cierreParts[0]) * 60 + (isNaN(cierreParts[1]) ? 0 : cierreParts[1]);
    const maxMinPermitidos = Math.max(0, cierreMinTotal - horaAperturaNum * 60 - 15);
    const maxRawTopPx = Math.max(0, (maxMinPermitidos / 60) * ALTURA_HORA_PX);

    const rawTopUnclamped = clientY - gridRect.top - info.grabOffsetY;
    const rawTopPx = Math.max(0, Math.min(maxRawTopPx, rawTopUnclamped));
    const rawMin = (rawTopPx / ALTURA_HORA_PX) * 60;

    // Snapping híbrido: bloques de 15 min + snap magnético suave a bordes de citas adyacentes (<= 4 min)
    let snappedMin = Math.round(rawMin / 15) * 15;
    const puntosMagneticos: number[] = [];
    for (const r of reservas) {
      if (r.id === info.cita.id || r.estado === 'cancelada' || r.cancha_id !== info.cita.cancha_id || !r.fecha_inicio) {
        continue;
      }
      const fCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      if (fCita !== targetFechaIso) continue;
      const rMinIni = obtenerMinutosDesdeAperturaBogota(r.fecha_inicio, horaAperturaNum);
      const rDur = obtenerDuracionMinutosCita(r.fecha_inicio, r.fecha_fin);
      const rMinFin = rMinIni + rDur;
      puntosMagneticos.push(rMinFin);
      if (rMinIni - info.duracionMinutos >= 0) {
        puntosMagneticos.push(rMinIni - info.duracionMinutos);
      }
    }

    let mejorDist = 5;
    for (const pt of puntosMagneticos) {
      const dist = Math.abs(rawMin - pt);
      if (dist <= 4 && dist < mejorDist) {
        mejorDist = dist;
        snappedMin = pt;
      }
    }

    const targetMinInicio = Math.max(0, Math.min(maxMinPermitidos, snappedMin));
    const snappedTopPx = (targetMinInicio / 60) * ALTURA_HORA_PX;

    const { esValido, motivoInvalido, esTraslapeParcial } = validarDestinoCitaSemanal(
      info.cita,
      targetFechaIso,
      targetMinInicio,
      info.duracionMinutos
    );

    const nextDragState: DragCitaSemanalState = {
      modo: info.modo,
      cita: info.cita,
      duracionMinutos: info.duracionMinutos,
      alturaPx: info.alturaPx,
      fechaOriginalIso: info.fechaOriginalIso,
      minInicioOriginal: info.minInicioOriginal,
      targetFechaIso,
      targetDayIndex,
      targetMinInicio,
      rawTopPx,
      snappedTopPx,
      esValido,
      motivoInvalido,
      esTraslapeParcial,
    };

    dragCitaSemanalRef.current = nextDragState;
    setDragCitaSemanal(nextDragState);
  };

  const finalizarDrag = (commit: boolean) => {
    if (holdDragTimerRef.current) {
      clearTimeout(holdDragTimerRef.current);
      holdDragTimerRef.current = null;
    }
    detenerAutoScroll();

    const info = pointerHoldInfoRef.current;
    const drag = dragCitaSemanalRef.current;

    pointerHoldInfoRef.current = null;
    dragCitaSemanalRef.current = null;
    lastPointerPosRef.current = null;
    setDragCitaSemanal(null);

    if (info?.dragging) {
      suppressSwipeUntilRef.current = Date.now() + 300;
      touchSemanalRef.current = null;
      touchInicioRef.current = null;
    }

    if (!info || !info.dragging || !drag || !commit) return;

    const mismoHorario =
      drag.targetFechaIso === drag.fechaOriginalIso &&
      drag.targetMinInicio === drag.minInicioOriginal;
    if (mismoHorario) return;

    if (!drag.esValido) {
      mostrarNotificacionRealtime(
        `⚠️ No se puede mover aquí: ${drag.motivoInvalido || 'Horario no disponible'}`
      );
      return;
    }

    handleMoverCitaSemanal(drag);
  };

  const actualizarPosicionDragRef = useRef(actualizarPosicionDrag);
  actualizarPosicionDragRef.current = actualizarPosicionDrag;
  const finalizarDragRef = useRef(finalizarDrag);
  finalizarDragRef.current = finalizarDrag;

  const iniciarAutoScroll = () => {
    detenerAutoScroll();
    const step = () => {
      const pos = lastPointerPosRef.current;
      const info = pointerHoldInfoRef.current;
      if (!pos || !info || !info.dragging) {
        autoScrollFrameRef.current = null;
        return;
      }

      const container = info.modo === 'diaria' ? scrollDiarioRef.current : scrollSemanalRef.current;
      let scrolled = false;

      if (container) {
        const rect = container.getBoundingClientRect();
        const leftStickyWidth = typeof window !== 'undefined' && window.innerWidth < 640 ? 64 : 96;
        const topStickyHeight = info.modo === 'diaria' ? 0 : 68;
        const edge = 42;
        let dx = 0;
        let dy = 0;

        if (container.scrollWidth > container.clientWidth + 4) {
          if (pos.clientX < rect.left + leftStickyWidth + edge) {
            const factor = Math.max(0, Math.min(1, (rect.left + leftStickyWidth + edge - pos.clientX) / edge));
            dx = -Math.ceil(factor * 10);
          } else if (pos.clientX > rect.right - edge) {
            const factor = Math.max(0, Math.min(1, (pos.clientX - (rect.right - edge)) / edge));
            dx = Math.ceil(factor * 10);
          }
        }

        if (container.scrollHeight > container.clientHeight + 4 && info.modo !== 'semanal') {
          if (pos.clientY < rect.top + topStickyHeight + edge) {
            const factor = Math.max(0, Math.min(1, (rect.top + topStickyHeight + edge - pos.clientY) / edge));
            dy = -Math.ceil(factor * 10);
          } else if (pos.clientY > rect.bottom - edge) {
            const factor = Math.max(0, Math.min(1, (pos.clientY - (rect.bottom - edge)) / edge));
            dy = Math.ceil(factor * 10);
          }
        } else if (typeof window !== 'undefined') {
          const topThreshold = info.modo === 'semanal' ? stickyTopOffset + 70 : 80;
          let winDy = 0;
          if (pos.clientY < topThreshold) {
            winDy = -Math.ceil(((topThreshold - pos.clientY) / topThreshold) * 10);
          } else if (pos.clientY > window.innerHeight - 60) {
            winDy = Math.ceil(((pos.clientY - (window.innerHeight - 60)) / 60) * 10);
          }
          if (winDy !== 0) {
            const prevY = window.scrollY;
            window.scrollBy(0, winDy);
            if (window.scrollY !== prevY) scrolled = true;
          }
        }

        if (dx !== 0 || dy !== 0) {
          const prevL = container.scrollLeft;
          const prevT = container.scrollTop;
          container.scrollLeft += dx;
          container.scrollTop += dy;
          if (container.scrollLeft !== prevL || container.scrollTop !== prevT) {
            scrolled = true;
            if (info.modo === 'semanal' && headerScrollSemanalRef.current) {
              headerScrollSemanalRef.current.scrollLeft = container.scrollLeft;
            }
          }
        }
      }

      if (scrolled) {
        actualizarPosicionDragRef.current(pos.clientX, pos.clientY);
      }

      autoScrollFrameRef.current = requestAnimationFrame(step);
    };
    autoScrollFrameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const onGlobalPointerMove = (e: PointerEvent) => {
      const info = pointerHoldInfoRef.current;
      if (!info || e.pointerId !== info.pointerId) return;
      lastPointerPosRef.current = { clientX: e.clientX, clientY: e.clientY };

      if (!info.dragging) {
        const dist = Math.hypot(e.clientX - info.startX, e.clientY - info.startY);
        if (dist > 8) {
          // Desplazamiento antes de 220ms: cancelar hold para permitir scroll nativo
          if (holdDragTimerRef.current) {
            clearTimeout(holdDragTimerRef.current);
            holdDragTimerRef.current = null;
          }
          pointerHoldInfoRef.current = null;
        }
        return;
      }

      actualizarPosicionDragRef.current(e.clientX, e.clientY);
    };

    const onGlobalPointerUp = (e: PointerEvent) => {
      const info = pointerHoldInfoRef.current;
      if (!info || e.pointerId !== info.pointerId) return;

      if (info.dragging) {
        finalizarDragRef.current(true);
        return;
      }

      // Hold no alcanzó 220ms -> evaluar si es un click corto (< 8px) para abrir el modal/popover
      const dist = Math.hypot(e.clientX - info.startX, e.clientY - info.startY);
      const cardEl = info.cardEl;
      const citaClick = info.cita;

      if (holdDragTimerRef.current) {
        clearTimeout(holdDragTimerRef.current);
        holdDragTimerRef.current = null;
      }
      pointerHoldInfoRef.current = null;

      if (dist < 8 && cardEl) {
        abrirPopoverDesdeElemento(citaClick, cardEl);
      }
    };

    const onGlobalPointerCancel = (e: PointerEvent) => {
      const info = pointerHoldInfoRef.current;
      if (!info || e.pointerId !== info.pointerId) return;
      finalizarDragRef.current(false);
    };

    const onGlobalTouchMove = (e: TouchEvent) => {
      if (pointerHoldInfoRef.current?.dragging && e.cancelable) {
        e.preventDefault();
      }
    };

    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pointerHoldInfoRef.current?.dragging) {
        finalizarDragRef.current(false);
      }
    };

    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onGlobalPointerCancel);
    window.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
    window.addEventListener('keydown', onGlobalKeyDown);

    return () => {
      window.removeEventListener('pointermove', onGlobalPointerMove);
      window.removeEventListener('pointerup', onGlobalPointerUp);
      window.removeEventListener('pointercancel', onGlobalPointerCancel);
      window.removeEventListener('touchmove', onGlobalTouchMove);
      window.removeEventListener('keydown', onGlobalKeyDown);
      if (holdDragTimerRef.current) clearTimeout(holdDragTimerRef.current);
      detenerAutoScroll();
    };
  }, []);

  const iniciarHoldCitaSemanal = (
    cita: Reserva,
    dayIndex: number,
    fechaIso: string,
    pos: CitaPosicionada,
    e: React.PointerEvent<HTMLDivElement>,
    modo: 'semanal' | 'diaria' = 'semanal'
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest('button, a')) return;

    if (holdDragTimerRef.current) {
      clearTimeout(holdDragTimerRef.current);
      holdDragTimerRef.current = null;
    }

    const cardEl = e.currentTarget;
    const cardRect = cardEl.getBoundingClientRect();
    const grabOffsetY = Math.max(8, Math.min(cardRect.height - 8, e.clientY - cardRect.top));
    const horaAperturaNum = parseInt((configAnticipo.horaApertura || '08:00').split(':')[0], 10) || 8;
    const minInicioOriginal = Math.max(
      0,
      obtenerMinutosDesdeAperturaBogota(cita.fecha_inicio, horaAperturaNum)
    );
    const duracionMinutos = obtenerDuracionMinutosCita(cita.fecha_inicio, cita.fecha_fin);
    const alturaPx = Math.max(44, pos.height);

    lastPointerPosRef.current = { clientX: e.clientX, clientY: e.clientY };
    pointerHoldInfoRef.current = {
      modo,
      pointerId: e.pointerId,
      cita,
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetY,
      dayIndexOriginal: dayIndex,
      fechaOriginalIso: fechaIso,
      minInicioOriginal,
      duracionMinutos,
      alturaPx,
      cardEl,
      dragging: false,
    };

    holdDragTimerRef.current = setTimeout(() => {
      holdDragTimerRef.current = null;
      const info = pointerHoldInfoRef.current;
      if (!info) return;

      const esBloqueada = cita.estado === 'bloqueada';
      const finMs = cita.fecha_fin
        ? new Date(cita.fecha_fin).getTime()
        : new Date(cita.fecha_inicio).getTime() + 45 * 60000;
      const esMovible =
        cita.estado !== 'completada' &&
        cita.estado !== 'cancelada' &&
        !esBloqueada &&
        finMs > Date.now();

      if (!esMovible) {
        pointerHoldInfoRef.current = null;
        if (!esBloqueada) {
          mostrarNotificacionRealtime('⚠️ Las citas completadas o pasadas no se pueden mover');
        }
        return;
      }

      info.dragging = true;
      setPopoverCita(null);
      try {
        navigator.vibrate?.(20);
      } catch {}
      try {
        info.cardEl.setPointerCapture(info.pointerId);
      } catch {}

      const p = lastPointerPosRef.current || { clientX: info.startX, clientY: info.startY };
      actualizarPosicionDragRef.current(p.clientX, p.clientY);
      iniciarAutoScroll();
    }, 220);
  };

  // Etiqueta legible del rango de la semana (ej: "5 al 11 de octubre de 2026")
  const etiquetaSemana = useMemo(() => {
    if (diasDeLaSemana.length < 7) return '';
    const primerDia = diasDeLaSemana[0];
    const ultimoDia = diasDeLaSemana[6];
    const mes1 = primerDia.fechaObj.toLocaleDateString('es-CO', { month: 'long' });
    const mes2 = ultimoDia.fechaObj.toLocaleDateString('es-CO', { month: 'long' });
    const anio = primerDia.fechaObj.getFullYear();
    if (primerDia.fechaObj.getMonth() === ultimoDia.fechaObj.getMonth()) {
      return `${primerDia.diaNum} al ${ultimoDia.diaNum} de ${mes1} de ${anio}`;
    } else {
      return `${primerDia.diaNum} de ${mes1} al ${ultimoDia.diaNum} de ${mes2} de ${anio}`;
    }
  }, [diasDeLaSemana]);

  // Fecha legible en español
  const fechaLegible = useMemo(() => {
    if (!fechaSeleccionada) return '';
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const texto = dateObj.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }, [fechaSeleccionada]);

  // Etiqueta contextual y no ambigua: Hoy, Mañana, Ayer o día específico (ej: Sáb, 10 oct)
  const etiquetaFechaRelativa = useMemo(() => {
    if (!fechaSeleccionada || !hoyStr) return 'Hoy';
    const [y1, m1, d1] = hoyStr.split('-').map(Number);
    const [y2, m2, d2] = fechaSeleccionada.split('-').map(Number);
    const dHoy = new Date(y1, m1 - 1, d1);
    const dSel = new Date(y2, m2 - 1, d2);

    const diffMs = dSel.getTime() - dHoy.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias === 0) return 'Hoy';
    if (diffDias === 1) return 'Mañana';
    if (diffDias === -1) return 'Ayer';

    // Para cualquier otra fecha: día abreviado + número de día + mes (ej: "Sáb, 10 oct", "Lun, 12 oct")
    const diaSemana = dSel.toLocaleDateString('es-CO', { weekday: 'short' });
    const diaMes = dSel.getDate();
    const mes = dSel.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    const diaCapitalizado = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1).replace('.', '');
    return `${diaCapitalizado}, ${diaMes} ${mes}`;
  }, [fechaSeleccionada, hoyStr]);

  // Cambiar mes hacia atrás o adelante para métricas mensuales
  const cambiarMes = (offset: number) => {
    const [y, m] = mesSeleccionado.split('-').map(Number);
    const fechaObj = new Date(y, m - 1 + offset, 1);
    const nuevoY = fechaObj.getFullYear();
    const nuevoM = String(fechaObj.getMonth() + 1).padStart(2, '0');
    setMesSeleccionado(`${nuevoY}-${nuevoM}`);
  };

  // Nombre legible del mes en español (ej: "Octubre de 2026")
  const nombreMesLegible = useMemo(() => {
    if (!mesSeleccionado) return '';
    const [y, m] = mesSeleccionado.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, 1);
    const nombre = fechaObj.toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
    });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }, [mesSeleccionado]);

  // Manejo de Login con PIN seguro (Sin auto-llenado y verificación por Hash criptográfico)
  const handleIniciarSesion = (perfil: StaffProfile) => {
    setModalPinPerfil(perfil);
    setPinIngresado('');
    setErrorPin(null);
  };

  const handleConfirmarPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPinPerfil) return;

    const pinLimpio = pinIngresado.trim();
    if (!pinLimpio) {
      setErrorPin('Por favor ingresa tu contraseña de acceso.');
      return;
    }

    const esValido =
      (await verifyPinHash(pinLimpio, modalPinPerfil.pinHash)) ||
      (await verifyPinHash(pinLimpio, ADMIN_MASTER_PIN_HASH));

    if (esValido) {
      setPerfilActual(modalPinPerfil);
      const { pinHash: _hash, ...perfilSinHash } = modalPinPerfil;
      localStorage.setItem('mimate_staff_profile', JSON.stringify(perfilSinHash));
      setModalPinPerfil(null);
      setPinIngresado('');
      setErrorPin(null);
    } else {
      setErrorPin('Contraseña incorrecta. Por favor verifica e intenta nuevamente.');
      setPinIngresado('');
    }
  };

  const handleCerrarSesion = () => {
    setPerfilActual(null);
    setPinIngresado('');
    setErrorPin(null);
    localStorage.removeItem('mimate_staff_profile');
  };

  // Cambiar estado de una cita (Completada o Cancelada)
  const handleCambiarEstado = async (reservaId: string, nuevoEstado: string) => {
    try {
      const res = await fetch(`/api/reservas/${reservaId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (res.ok) {
        setReservas((prev) =>
          prev.map((r) => (r.id === reservaId ? { ...r, estado: nuevoEstado as any } : r))
        );
      }
    } catch (e) {
      console.error('Error actualizando estado:', e);
    }
  };

  // Auto-completar citas automáticamente cuando la barra roja llega al final del recuadro de la cita (ahora >= fecha_fin)
  const citasAutoCompletadasRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!reservas || reservas.length === 0) return;
    const ahoraMs = ahora.getTime();

    const citasParaCompletar = reservas.filter((r) => {
      if (r.estado === 'completada' || r.estado === 'cancelada' || r.estado === 'bloqueada') {
        return false;
      }
      if (!r.fecha_fin) return false;
      const finMs = new Date(r.fecha_fin).getTime();
      if (isNaN(finMs)) return false;

      // La barra roja ya llegó al final del recuadro de la cita (o lo sobrepasó)
      return ahoraMs >= finMs;
    });

    for (const cita of citasParaCompletar) {
      if (!citasAutoCompletadasRef.current.has(cita.id)) {
        citasAutoCompletadasRef.current.add(cita.id);
        handleCambiarEstado(cita.id, 'completada');
      }
    }
  }, [ahora, reservas]);

  // Abrir modal de Agendar Cita (Admin y Manicuristas)
  const abrirModalAgendar = (manicuristaId?: string, horaInicial?: string, fechaInicial?: string) => {
    const defaultMani = (!esAdmin && perfilActual?.canchaId)
      ? perfilActual.canchaId
      : (canchas[0]?.id || '');
    const maniId = manicuristaId || defaultMani;
    const fecha = fechaInicial || fechaSeleccionada;
    setAgendarManicuristaId(maniId);
    setAgendarFecha(fecha);
    setAgendarHora(horaInicial || '');
    setAgendarServiciosExtrasIds([]);
    setAgendarNombre('');
    setAgendarTelefono('');
    setErrorAgendar(null);
    setMenuManiAbierto(false);
    setMenuServicioAbierto(false);
    setMenuHoraAbierto(false);
    setModalAgendarAbierto(true);
  };

  // Abrir modal de agendar al hacer clic sobre un espacio vacío de la cuadrícula (semanal o diaria)
  const handleClickEspacioVacioCuadricula = (
    fechaIso: string,
    horaClick: string,
    canchaIdContexto?: string
  ) => {
    if (
      dragCitaSemanalRef.current ||
      pointerHoldInfoRef.current?.dragging ||
      Date.now() < suppressSwipeUntilRef.current
    ) {
      return;
    }

    if (popoverCita) {
      setPopoverCita(null);
    }

    // Validar domingo cerrado (excepto diciembre)
    if (esDomingoCerradoIso(fechaIso)) {
      mostrarNotificacionRealtime('⚠️ Los domingos regulares el spa está cerrado (excepto en diciembre)');
      return;
    }

    // Validar fecha u hora pasada
    if (fechaIso < hoyStr) {
      mostrarNotificacionRealtime('⚠️ No es posible agendar citas en fechas pasadas');
      return;
    }

    const slotStartMs = new Date(`${fechaIso}T${horaClick}:00-05:00`).getTime();
    if (fechaIso === hoyStr && slotStartMs <= Date.now()) {
      mostrarNotificacionRealtime('⚠️ Este horario ya pasó. Selecciona una franja futura');
      return;
    }

    // Validar hora de cierre del spa
    const cierreStr = (configAnticipo.horaCierre || '19:00').slice(0, 5);
    const horaCierreMs = new Date(`${fechaIso}T${cierreStr}:00-05:00`).getTime();
    if (slotStartMs >= horaCierreMs) {
      mostrarNotificacionRealtime('⚠️ Este horario excede la hora de cierre del spa');
      return;
    }

    // Determinar especialista a preseleccionar
    let maniId = '';
    if (!esAdmin && perfilActual?.canchaId) {
      maniId = perfilActual.canchaId;
    } else if (canchaIdContexto && canchaIdContexto !== 'todas') {
      maniId = canchaIdContexto;
    } else {
      const durBaseMin = servicioSeleccionadoForm?.duracion || 45;
      const slotEndMs = slotStartMs + durBaseMin * 60 * 1000;
      const estaLibreEnRango = (canchaIdBuscar: string, finCheckMs: number) =>
        !reservas.some((r) => {
          if (r.estado === 'cancelada' || r.cancha_id !== canchaIdBuscar || !r.fecha_inicio) return false;
          const rStart = new Date(r.fecha_inicio).getTime();
          const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60000;
          return rStart < finCheckMs && rEnd > slotStartMs;
        });

      const especialistaLibre =
        canchas.find((c) => estaLibreEnRango(c.id, slotEndMs)) ||
        canchas.find((c) => estaLibreEnRango(c.id, slotStartMs + 1));

      maniId = especialistaLibre?.id || canchas[0]?.id || '';
    }

    abrirModalAgendar(maniId, horaClick, fechaIso);
  };

  // Sub-franjas interactivas de 30 minutos (:00 y :30) para crear cita al hacer clic en espacios vacíos
  const renderSubFranjas30Min = (
    h: number,
    fechaIso: string,
    canchaIdContexto: string | undefined,
    esHoyCheck: boolean,
    ahoraCheckMs: number,
    variante: 'diaria' | 'semanal'
  ) => {
    const cerrado = esDomingoCerradoIso(fechaIso);
    const cierreStr = (configAnticipo.horaCierre || '19:00').slice(0, 5);
    const horaCierreMs = new Date(`${fechaIso}T${cierreStr}:00-05:00`).getTime();

    return (['00', '30'] as const).map((mm) => {
      const hStr = `${String(h).padStart(2, '0')}:${mm}`;
      const slotMs = new Date(`${fechaIso}T${hStr}:00-05:00`).getTime();
      const habilitado =
        !cerrado && !(fechaIso < hoyStr || (esHoyCheck && slotMs <= ahoraCheckMs) || slotMs >= horaCierreMs);

      return (
        <div
          key={mm}
          onClick={() => handleClickEspacioVacioCuadricula(fechaIso, hStr, canchaIdContexto)}
          className={`h-1/2 w-full transition-colors flex items-center pointer-events-auto group/slot ${
            mm === '30' ? 'border-t border-dashed border-[#F2C4D2]/35' : ''
          } ${
            variante === 'semanal' ? 'justify-center' : 'pl-2 sm:pl-3'
          } ${habilitado ? 'hover:bg-[#FCE8EF]/45 cursor-pointer' : ''}`}
          title={habilitado ? `Clic para agendar a las ${hStr}` : undefined}
        >
          {habilitado && (
            <span className="text-[10px] font-bold text-[#8C243B]/80 opacity-0 group-hover/slot:opacity-100 transition-opacity select-none">
              {variante === 'semanal' ? `+ ${hStr}` : `+ Agendar ${hStr}`}
            </span>
          )}
        </div>
      );
    });
  };

  // Enviar formulario de Agendar Cita (Solo Admin)
  const handleCrearCitaAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendarNombre.trim() || !agendarTelefono.trim()) {
      setErrorAgendar('Por favor ingresa nombre y teléfono de la clienta.');
      return;
    }

    if (!agendarHora) {
      setErrorAgendar('No hay un turno válido seleccionado para esta fecha y especialista.');
      return;
    }

    setGuardandoCita(true);
    setErrorAgendar(null);

    
    try {
      let reservado = false;
      try {
        const res = await fetch('/api/spa/reservar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            servicio_nombre: nombreServiciosAdmin,
            precio: precioTotalAdmin,
            duracion_minutos: duracionTotalAdmin,
            fecha: agendarFecha,
            hora: agendarHora,
            cancha_id: agendarManicuristaId || undefined,
            cliente_nombre: agendarNombre.trim(),
            cliente_telefono: agendarTelefono.trim(),
            origen: 'panel',
            agendado_por: perfilActual ? (perfilActual.alias || perfilActual.nombre) : 'Personal',
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          reservado = true;
        } else {
          setErrorAgendar(data.error || 'No se pudo agendar la cita. Verifica el horario.');
          setGuardandoCita(false);
          return;
        }
      } catch (errNet) {
        console.warn('API /api/spa/reservar offline o sin conexión, usando Supabase directo:', errNet);
      }

      if (!reservado) {
        // Fallback directo en Supabase
        let cleanPhone = String(agendarTelefono.trim()).replace(/\D/g, '');
        if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
          cleanPhone = `57${cleanPhone}`;
        }

        let clienteId: string | null = null;
        const sinPais = cleanPhone.replace(/^57/, '');
        const { data: clienteExistente } = await supabase
          .from('clientes')
          .select('id, nombre')
          .or(`telefono_wa.eq.${cleanPhone},telefono_wa.eq.${sinPais}`)
          .maybeSingle();

        if (clienteExistente) {
          clienteId = clienteExistente.id;
          // Si el nombre ingresado por la administradora/especialista fue actualizado, sincronizar en la BD
          if (agendarNombre.trim() && agendarNombre.trim() !== clienteExistente.nombre) {
            await supabase
              .from('clientes')
              .update({ nombre: agendarNombre.trim() })
              .eq('id', clienteId);
          }
        } else {
          const { data: clienteCreado } = await supabase
            .from('clientes')
            .insert({ telefono_wa: cleanPhone, nombre: agendarNombre.trim() })
            .select('id')
            .single();
          if (clienteCreado) clienteId = clienteCreado.id;
        }

        const dInicio = new Date(`${agendarFecha}T${agendarHora}:00-05:00`);
        const dFin = new Date(dInicio.getTime() + (Number(duracionTotalAdmin) || 60) * 60 * 1000);
        const autor = perfilActual ? (perfilActual.alias || perfilActual.nombre) : 'Personal';

        const { error: sbErr } = await supabase.from('reservas').insert({
          cancha_id: agendarManicuristaId || canchas[0]?.id,
          cliente_id: clienteId,
          fecha_inicio: dInicio.toISOString(),
          fecha_fin: dFin.toISOString(),
          valor_total: precioTotalAdmin,
          valor_anticipo_requerido: 0,
          estado: 'confirmada',
          notas: `💅 Servicio: ${nombreServiciosAdmin} | Duración: ${duracionTotalAdmin} min | Clienta: ${agendarNombre.trim()} | Agendado en cabina por: ${autor}${(dInicio.getTime() - Date.now() >= 24 * 60 * 60 * 1000 && agendarFecha !== hoyStr) ? ' [POR_CONFIRMAR_CLIENTA]' : ''}`,
        });

        if (sbErr) {
          if (sbErr.code === '23P01') {
            setErrorAgendar('Este horario ya está ocupado por otra cita o bloqueo.');
            setGuardandoCita(false);
            return;
          }
          throw sbErr;
        }
      }

      setModalAgendarAbierto(false);
      await cargarReservas();
    } catch (err: any) {
      setErrorAgendar('Error al agendar cita: ' + (err.message || 'Error desconocido'));
    } finally {
      setGuardandoCita(false);
    }
  };

  // Abrir modal de Bloquear Horario
  const abrirModalBloquear = (manicuristaId?: string, horaInicial?: string, fechaInicial?: string) => {
    if (!esAdmin && perfilActual?.canchaId) {
      setBloquearManicuristaId(perfilActual.canchaId);
    } else {
      setBloquearManicuristaId(
        manicuristaId ||
        (especialistaSeleccionadaId !== 'todas' ? especialistaSeleccionadaId : canchas[0]?.id || '')
      );
    }
    const fechaElegida = fechaInicial || fechaSeleccionada;
    const fechaValida = fechaElegida < hoyStr ? hoyStr : fechaElegida;
    setBloquearFecha(fechaValida);

    if (horaInicial) {
      const ahoraMs = Date.now();
      const slotMs = new Date(`${fechaValida}T${horaInicial}:00-05:00`).getTime();
      const horaYaPaso = fechaValida < hoyStr || (fechaValida === hoyStr && slotMs <= ahoraMs);
      if (!horaYaPaso) {
        setBloquearHorasSeleccionadas([horaInicial]);
      } else {
        setBloquearHorasSeleccionadas([]);
      }
    } else {
      setBloquearHorasSeleccionadas([]);
    }
    setBloquearMotivo('🍱 Almuerzo');
    setBloquearMotivoPersonalizado('');
    setErrorBloquear(null);
    setMenuBloquearManiAbierto(false);
    setModalBloquearAbierto(true);
  };

  // Toggle de selección de horas para bloqueo múltiple
  const toggleHoraBloqueo = (hora: string) => {
    if (horasYaPasadasBloqueo.has(hora) || horasYaOcupadasBloqueo.has(hora)) {
      return;
    }
    setBloquearHorasSeleccionadas((prev) =>
      prev.includes(hora) ? prev.filter((h) => h !== hora) : [...prev, hora].sort()
    );
  };

  // Enviar formulario de Bloquear Horario (Admin o Manicurista)
  const handleCrearBloqueo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bloquearHorasSeleccionadas.length === 0) {
      setErrorBloquear('Por favor selecciona al menos una hora para bloquear.');
      return;
    }

    if (bloquearFecha < hoyStr) {
      setErrorBloquear('No es posible bloquear fechas pasadas.');
      return;
    }

    const ahoraMs = Date.now();
    const horasPasadas = bloquearHorasSeleccionadas.filter((h) => {
      if (bloquearFecha === hoyStr) {
        const slotStartMs = new Date(`${bloquearFecha}T${h}:00-05:00`).getTime();
        return slotStartMs <= ahoraMs;
      }
      return false;
    });

    if (horasPasadas.length > 0) {
      setErrorBloquear('No es posible bloquear horarios que ya han pasado.');
      return;
    }

    setGuardandoBloqueo(true);
    setErrorBloquear(null);

    const motivoFinal = (bloquearMotivoPersonalizado.trim() || bloquearMotivo || 'Horario bloqueado').trim();
    const autor = perfilActual ? (perfilActual.alias || perfilActual.nombre) : 'Personal del Spa';

    const targetCanchasIds: string[] =
      bloquearManicuristaId === 'todas'
        ? canchas.map((c) => c.id)
        : [bloquearManicuristaId || (canchas[0]?.id || '')];

    try {
      // 1. Intentar endpoint en backend
      let apiSuccess = false;
      try {
        const res = await fetch('/api/bloqueos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cancha_ids: targetCanchasIds,
            fecha: bloquearFecha,
            horas: bloquearHorasSeleccionadas,
            motivo: motivoFinal,
            bloqueado_por: autor,
          }),
        });

        if (res.ok) {
          apiSuccess = true;
        } else {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 409) {
            setErrorBloquear(errData.error || 'Uno o más de los horarios seleccionados ya tiene una cita o bloqueo.');
            setGuardandoBloqueo(false);
            return;
          }
        }
      } catch (errApi) {
        console.warn('API /api/bloqueos offline o error de red, usando Supabase directo:', errApi);
      }

      // 2. Si la API no respondió exitosamente, fallback directo a Supabase
      if (!apiSuccess) {
        const durPaso = 60;
        const minutos = Array.from(new Set(bloquearHorasSeleccionadas))
          .map((h) => {
            const [hh, mm] = h.split(':').map(Number);
            return (isNaN(hh) ? 0 : hh) * 60 + (isNaN(mm) ? 0 : mm);
          })
          .sort((a, b) => a - b);

        const rangos: { hInicio: string; hFin: string }[] = [];
        if (minutos.length > 0) {
          let actualInicio = minutos[0];
          let actualFin = minutos[0] + durPaso;

          for (let i = 1; i < minutos.length; i++) {
            const m = minutos[i];
            if (m === actualFin) {
              actualFin = m + durPaso;
            } else {
              const hI = `${String(Math.floor(actualInicio / 60)).padStart(2, '0')}:${String(actualInicio % 60).padStart(2, '0')}`;
              const hF = `${String(Math.floor(actualFin / 60)).padStart(2, '0')}:${String(actualFin % 60).padStart(2, '0')}`;
              rangos.push({ hInicio: hI, hFin: hF });
              actualInicio = m;
              actualFin = m + durPaso;
            }
          }
          const hI = `${String(Math.floor(actualInicio / 60)).padStart(2, '0')}:${String(actualInicio % 60).padStart(2, '0')}`;
          const hF = `${String(Math.floor(actualFin / 60)).padStart(2, '0')}:${String(actualFin % 60).padStart(2, '0')}`;
          rangos.push({ hInicio: hI, hFin: hF });
        }

        const registros: any[] = [];
        for (const r of rangos) {
          const dInicio = new Date(`${bloquearFecha}T${r.hInicio}:00-05:00`);
          const dFin = new Date(`${bloquearFecha}T${r.hFin}:00-05:00`);
          for (const cid of targetCanchasIds) {
            registros.push({
              cancha_id: cid,
              cliente_id: null,
              fecha_inicio: dInicio.toISOString(),
              fecha_fin: dFin.toISOString(),
              estado: 'bloqueada',
              valor_total: 0,
              valor_anticipo_requerido: 0,
              notas: `🔒 BLOQUEO: ${motivoFinal} | Horario: ${r.hInicio} - ${r.hFin} | Por: ${autor}`,
            });
          }
        }

        const { error: sbErr } = await supabase.from('reservas').insert(registros);
        if (sbErr) {
          if (sbErr.code === '23P01') {
            setErrorBloquear('Uno o más de los horarios seleccionados ya tiene una cita o bloqueo.');
            setGuardandoBloqueo(false);
            return;
          }
          throw sbErr;
        }
      }

      setModalBloquearAbierto(false);
      await cargarReservas();
    } catch (err: any) {
      setErrorBloquear('Error al bloquear horarios: ' + (err.message || 'Error desconocido'));
    } finally {
      setGuardandoBloqueo(false);
    }
  };

  // Desbloquear un horario de inmediato sin popups ni confirmaciones
  const handleDesbloquearHorario = async (reservaId: string, _horaDetalle?: string) => {
    try {
      let borrado = false;
      try {
        const res = await fetch(`/api/bloqueos/${reservaId}`, { method: 'DELETE' });
        if (res.ok) borrado = true;
        else {
          const res2 = await fetch(`/api/reservas/${reservaId}`, { method: 'DELETE' });
          if (res2.ok) borrado = true;
        }
      } catch (errApi) {
        console.warn('API delete offline, usando Supabase directo:', errApi);
      }

      if (!borrado) {
        const { error } = await supabase.from('reservas').delete().eq('id', reservaId);
        if (error) throw error;
      }

      setReservas((prev) => prev.filter((r) => r.id !== reservaId));
    } catch (e: any) {
      console.error('No se pudo desbloquear el horario:', e.message || 'Error de conexión');
    }
  };

  // Filtrado de reservas por fecha seleccionada (ordenadas cronológicamente de forma ascendente: de más temprano a más tarde)
  const reservasDelDia = useMemo(() => {
    return reservas
      .filter((r) => {
        if (!r.fecha_inicio) return false;
        const fechaCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
          timeZone: 'America/Bogota',
        });
        return fechaCita === fechaSeleccionada;
      })
      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
  }, [reservas, fechaSeleccionada]);

  // Citas reales vs Bloqueos del día
  const citasClientesDelDia = useMemo(() => {
    return reservasDelDia.filter((r) => r.estado !== 'bloqueada' && r.estado !== 'cancelada');
  }, [reservasDelDia]);

  const bloqueosDelDia = useMemo(() => {
    return reservasDelDia.filter((r) => r.estado === 'bloqueada');
  }, [reservasDelDia]);

  // Reservas de toda la semana activa (ordenadas cronológicamente de forma ascendente)
  const reservasDeLaSemana = useMemo(() => {
    if (diasDeLaSemana.length === 0) return [];
    const fechasSet = new Set(diasDeLaSemana.map((d) => d.fechaIso));
    return reservas
      .filter((r) => {
        if (!r.fecha_inicio) return false;
        const fechaCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
          timeZone: 'America/Bogota',
        });
        return fechasSet.has(fechaCita);
      })
      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
  }, [reservas, diasDeLaSemana]);

  const citasClientesDeLaSemana = useMemo(() => {
    return reservasDeLaSemana.filter((r) => r.estado !== 'bloqueada' && r.estado !== 'cancelada');
  }, [reservasDeLaSemana]);

  const bloqueosDeLaSemana = useMemo(() => {
    return reservasDeLaSemana.filter((r) => r.estado === 'bloqueada');
  }, [reservasDeLaSemana]);

  // Reservas filtradas según el modo de métricas (Día seleccionado vs Mes seleccionado, excluyendo bloqueos)
  const reservasFiltradasMetricas = useMemo(() => {
    return reservas.filter((r) => {
      if (!r.fecha_inicio) return false;
      if (r.estado === 'bloqueada') return false;
      const fechaCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
        timeZone: 'America/Bogota',
      }); // formato 'YYYY-MM-DD'
      if (modoMetricas === 'dia') {
        return fechaCita === fechaSeleccionada;
      } else if (modoMetricas === 'semana') {
        return diasDeLaSemana.some((d) => d.fechaIso === fechaCita);
      } else {
        return fechaCita.startsWith(mesSeleccionado);
      }
    });
  }, [reservas, modoMetricas, fechaSeleccionada, diasDeLaSemana, mesSeleccionado]);

  // Métricas financieras calculadas para la Admin según el período seleccionado
  const metricasSpa = useMemo(() => {
    const normalizarTexto = (txt: string) =>
      txt
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

    // Servicios ordenados por longitud descendente para evitar falsos positivos por subcadenas (ej. "Manos y pies" antes que "Manos")
    const serviciosPorLongitud = [...servicios].sort((a, b) => b.nombre.length - a.nombre.length);

    // Extrae la lista exacta de servicios asociados a una cita (soporta servicio único o múltiples separados por '+')
    const extraerServiciosDeCita = (r: Reserva): Servicio[] => {
      if (servicios.length === 0) return [];
      const notas = r.notas || '';
      const matchSvc = notas.match(/Servicio:\s*([^|[\n]+)/i);

      if (matchSvc && matchSvc[1]) {
        const partes = matchSvc[1]
          .split('+')
          .map((p) => normalizarTexto(p))
          .filter(Boolean);
        const encontrados: Servicio[] = [];
        for (const parte of partes) {
          let svc = servicios.find((s) => normalizarTexto(s.nombre) === parte);
          if (!svc) {
            svc = serviciosPorLongitud.find((s) => parte.includes(normalizarTexto(s.nombre)));
          }
          if (svc && !encontrados.some((e) => e.id === svc!.id)) {
            encontrados.push(svc);
          }
        }
        if (encontrados.length > 0) return encontrados;
      }

      const notasNorm = normalizarTexto(notas);
      if (notasNorm) {
        const svcPorNota = serviciosPorLongitud.find((s) =>
          notasNorm.includes(normalizarTexto(s.nombre))
        );
        if (svcPorNota) return [svcPorNota];
      }

      const monto = Number(r.valor_total || 0);
      if (monto > 0) {
        const svcPorPrecio = servicios.find((s) => s.precio === monto);
        if (svcPorPrecio) return [svcPorPrecio];
        const svcMasCercano = [...servicios].sort((a, b) => Math.abs(a.precio - monto) - Math.abs(b.precio - monto))[0];
        if (svcMasCercano) return [svcMasCercano];
      }

      return servicios[0] ? [servicios[0]] : [];
    };

    const obtenerValorReserva = (r: Reserva): number => {
      const monto = Number(r.valor_total || 0);
      if (monto > 0) return monto;
      const svcs = extraerServiciosDeCita(r);
      return svcs.reduce((sum, s) => sum + Number(s.precio || 0), 0);
    };

    const lista = reservasFiltradasMetricas;
    const canceladas = lista.filter((r) => r.estado === 'cancelada');
    // Solo las citas activas (no canceladas) cuentan como agendadas y generan ingresos
    const citasActivas = lista.filter((r) => r.estado !== 'cancelada');
    const total = citasActivas.length;

    const confirmadas = citasActivas.filter(
      (r) => r.estado === 'confirmada' || r.estado === 'completada'
    );
    const completadas = citasActivas.filter((r) => r.estado === 'completada');
    const pendientes = citasActivas.filter((r) => r.estado !== 'completada');

    const ingresosTotales = citasActivas.reduce((sum, r) => sum + obtenerValorReserva(r), 0);
    const ingresosCompletados = completadas.reduce((sum, r) => sum + obtenerValorReserva(r), 0);

    // Desglose por manicurista en este período (basado en citas activas no canceladas)
    const porManicurista = canchas.map((c) => {
      const citasMani = citasActivas.filter((r) => r.cancha_id === c.id);
      const completadasMani = citasMani.filter((r) => r.estado === 'completada');
      const pendientesMani = citasMani.filter((r) => r.estado !== 'completada');
      const recaudadoEstimado = citasMani.reduce((sum, r) => sum + obtenerValorReserva(r), 0);
      const recaudadoRealizado = completadasMani.reduce(
        (sum, r) => sum + obtenerValorReserva(r),
        0
      );
      return {
        cancha: c,
        total: citasMani.length,
        completadas: completadasMani.length,
        pendientes: pendientesMani.length,
        ingresos: recaudadoEstimado,
        ingresosCompletados: recaudadoRealizado,
      };
    });


    // Desglose exacto por servicio en este período (sin duplicar por nombres parecidos)
    const mapaServicios = new Map<number, { cantidad: number; ingresos: number }>();
    for (const s of servicios) {
      mapaServicios.set(s.id, { cantidad: 0, ingresos: 0 });
    }

    for (const r of citasActivas) {
      const svcsCita = extraerServiciosDeCita(r);
      const adic = sumarAdicionalesCita(r.notas);
      const valorCita = Math.max(0, obtenerValorReserva(r) - adic);
      if (svcsCita.length === 1) {
        const item = mapaServicios.get(svcsCita[0].id);
        if (item) {
          item.cantidad += 1;
          item.ingresos += valorCita;
        }
      } else if (svcsCita.length > 1) {
        const sumaCatalogo = svcsCita.reduce((acc, s) => acc + Number(s.precio || 0), 0);
        let acumulado = 0;
        svcsCita.forEach((svc, idx) => {
          const item = mapaServicios.get(svc.id);
          if (item) {
            item.cantidad += 1;
            const aporte =
              idx === svcsCita.length - 1
                ? Math.max(0, valorCita - acumulado)
                : sumaCatalogo > 0
                ? Math.round((svc.precio / sumaCatalogo) * valorCita)
                : Math.round(valorCita / svcsCita.length);
            acumulado += aporte;
            item.ingresos += aporte;
          }
        });
      }
    }

    const porServicio = servicios
      .map((s) => {
        const stats = mapaServicios.get(s.id) || { cantidad: 0, ingresos: 0 };
        return {
          servicio: s,
          cantidad: stats.cantidad,
          ingresos: stats.ingresos,
        };
      })
      .sort((a, b) => b.cantidad - a.cantidad || b.ingresos - a.ingresos);

    // Métricas exclusivas para la fila única de "Adicionales"
    const citasConAdicional = citasActivas.filter((r) => sumarAdicionalesCita(r.notas) > 0);
    const ingresosAdicionales = citasActivas.reduce((sum, r) => sum + sumarAdicionalesCita(r.notas), 0);

    const adicionalesInfo = {
      cantidad: citasConAdicional.length,
      ingresos: ingresosAdicionales,
    };

    const totalCitasServicios = porServicio.reduce((sum, s) => sum + s.cantidad, 0);
    const totalDineroServicios = porServicio.reduce((sum, s) => sum + s.ingresos, 0) + adicionalesInfo.ingresos;

    return {
      total,
      confirmadasCount: confirmadas.length,
      completadasCount: completadas.length,
      canceladasCount: canceladas.length,
      pendientesCount: pendientes.length,
      ingresosTotales,
      ingresosCompletados,
      porManicurista,
      porServicio,
      adicionalesInfo,
      totalCitasServicios,
      totalDineroServicios,
    };
  }, [reservasFiltradasMetricas, canchas, servicios]);

  // ============================================================================
  // VISTA 1: PANTALLA DE LOGIN CON LOS 4 PERFILES
  // ============================================================================
  if (!perfilActual) {
    return (
      <div className="min-h-screen bg-[#FFF5F7] text-[#2D2529] flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl w-full space-y-6 text-center"
        >
          {/* Logo y Encabezado */}
          <div className="space-y-3">
            <div className="w-24 h-24 mx-auto rounded-full bg-white p-2 shadow-lg border-2 border-[#F2C4D2] flex items-center justify-center overflow-hidden">
              <img
                src="/mimate-nails-logo.png"
                alt="JL Mímate Nails Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-widest text-[#C74B66] uppercase bg-white px-3 py-1 rounded-full border border-[#F2C4D2]">
                Portal del Equipo & Administración
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2529] font-serif mt-2">
                JL Mímate <span className="italic text-[#8C243B]">Nails</span>
              </h1>
              <p className="text-xs sm:text-sm text-[#7D6870] max-w-md mx-auto mt-1">
                Selecciona tu perfil de manicurista o administración para ver tu agenda de turnos.
              </p>
            </div>
          </div>

          {/* Tarjetas de Selección de los 4 Perfiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left">
            {perfilesConIds.map((p) => {
              const esPAdmin = p.rol === 'admin';
              return (
                <motion.div
                  key={p.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleIniciarSesion(p)}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between ${
                    esPAdmin
                      ? 'border-[#8C243B]/40 hover:border-[#8C243B] bg-gradient-to-br from-white to-[#FFF5F7]'
                      : 'border-[#F2C4D2] hover:border-[#C74B66]'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="w-11 h-11 rounded-xl bg-[#FCE8EF] border border-[#F2C4D2] overflow-hidden flex items-center justify-center text-xl shrink-0 shadow-2xs">
                        {p.foto ? (
                          <img src={p.foto} alt={p.nombre} className="w-full h-full object-cover" />
                        ) : (
                          <span>{p.avatar}</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.colorBadge}`}>
                        {esPAdmin ? 'Administradora' : 'Manicurista'}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                        {p.nombre}
                      </h3>
                      <p className="text-[11px] text-[#7D6870] leading-relaxed mt-0.5">
                        {p.descripcion}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#FCE8EF] mt-3 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-[#8C243B]">Ingresar perfil →</span>
                    <span className="text-[10px] text-[#7D6870] opacity-75">PIN protegido</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Botón Volver a la web pública */}
          <div className="pt-2">
            <button
              onClick={onIrAWebReservas}
              className="inline-flex items-center gap-1.5 text-xs text-[#7D6870] hover:text-[#8C243B] font-medium transition cursor-pointer"
            >
              <IconArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a la página web de reservas públicas</span>
            </button>
          </div>
        </motion.div>

        {/* Modal PIN de Ingreso */}
        <AnimatePresence>
          {modalPinPerfil && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl max-w-sm w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full border-2 border-[#F2C4D2] overflow-hidden flex items-center justify-center text-xl shrink-0 shadow-2xs">
                      {modalPinPerfil.foto ? (
                        <img src={modalPinPerfil.foto} alt={modalPinPerfil.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <span>{modalPinPerfil.avatar}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                        {modalPinPerfil.nombre}
                      </h3>
                      <p className="text-[11px] text-[#7D6870]">Ingresa tu clave de acceso</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setModalPinPerfil(null);
                      setPinIngresado('');
                      setErrorPin(null);
                    }}
                    className="p-1 rounded-full text-[#7D6870] hover:text-[#2D2529] cursor-pointer"
                  >
                    <IconX className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleConfirmarPin} autoComplete="off" noValidate className="space-y-3">
                  <div>
                    <label htmlFor={`mimate_spa_auth_pin_${modalPinPerfil.id}`} className="text-[11px] font-bold text-[#7D6870] block mb-1">
                      Contraseña de Acceso
                    </label>
                    <div className="relative">
                      <IconLock className="w-4 h-4 text-[#C74B66] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id={`mimate_spa_auth_pin_${modalPinPerfil.id}`}
                        name={`mimate_spa_auth_pin_${modalPinPerfil.id}`}
                        type="text"
                        style={{
                          WebkitTextSecurity: 'disc',
                          textSecurity: 'disc',
                        } as React.CSSProperties}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        data-form-type="other"
                        value={pinIngresado}
                        onChange={(e) => setPinIngresado(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-sm font-mono tracking-widest text-center text-[#2D2529] focus:outline-none focus:border-[#8C243B]"
                        autoFocus
                      />
                    </div>
                    {errorPin && (
                      <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1 font-medium">
                        <IconAlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {errorPin}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setModalPinPerfil(null);
                        setPinIngresado('');
                        setErrorPin(null);
                      }}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#7D6870] text-xs font-semibold rounded-xl transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-[#8C243B] hover:bg-[#731D30] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                    >
                      Entrar a mi Turno
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ============================================================================
  // RENDERIZADOR: TIMELINE DIARIO POR HORAS (ESTILO GOOGLE / APPLE CALENDAR)
  // ============================================================================
  const renderTimelineManicurista = (
    citasManicurista: Reserva[],
    nombreManicurista: string,
    canchaId?: string,
    puedeAgendar: boolean = false,
    fechaParam?: string,
    fechaLegibleParam?: string
  ) => {
    const fechaActualTimeline = fechaParam || fechaSeleccionada;
    const fechaTextoTimeline = fechaLegibleParam || fechaLegible;
    const esHoy = fechaActualTimeline === hoyStr;
    const horaActualNum = ahora.getHours();
    const minutosActuales = ahora.getMinutes();
    const horaAperturaNum = parseInt((configAnticipo.horaApertura || '08:00').split(':')[0], 10) || 8;
    const horaCierreNum = parseInt((configAnticipo.horaCierre || '19:00').split(':')[0], 10) || 19;
    const estaEnHorario = horaActualNum >= horaAperturaNum && horaActualNum <= horaCierreNum;
    const minutosDesdeApertura = (horaActualNum - horaAperturaNum) * 60 + minutosActuales;
    const posicionYLinea = (minutosDesdeApertura / 60) * ALTURA_HORA_PX;
    const horaMinutosActualStr = formatearHora12(
      ahora.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );

    const ALTURA_TOTAL_TIMELINE = horasTimeline.length * ALTURA_HORA_PX;
    const citasVisibles = citasManicurista.filter((r) => r.estado !== 'cancelada');
    const citasPosicionadas = calcularPosicionesCitas(citasVisibles, horaAperturaNum);
    const ahoraMs = ahora.getTime();

    return (
      <div className="bg-white rounded-3xl border border-[#F2C4D2] shadow-xs overflow-hidden">
        {/* Cabecera del Timeline */}
        <div className="p-4 bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border-b border-[#F2C4D2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#F2C4D2] flex items-center justify-center font-bold text-base text-[#8C243B] shadow-2xs">
              💅
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[#2D2529] font-serif">
                {nombreManicurista}
              </h3>
              <p className="text-xs text-[#7D6870]">
                {fechaTextoTimeline} · <strong className="text-[#8C243B]">{citasVisibles.length} citas</strong> agendadas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#7D6870] hidden sm:inline">
              Horario: {formatearHora12(configAnticipo.horaApertura || '08:00')} a {formatearHora12(configAnticipo.horaCierre || '19:00')}
            </span>
            {esHoy && estaEnHorario && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Ahora: {horaMinutosActualStr}
              </span>
            )}
          </div>
        </div>

        {/* Grilla de Tiempo Continua y Fiel a los Minutos */}
        <div ref={scrollDiarioRef} className="relative p-2.5 sm:p-6 overflow-x-auto">
          <div className="min-w-full sm:min-w-[600px] relative">
            <div className="flex relative" style={{ height: `${ALTURA_TOTAL_TIMELINE}px` }}>
              {/* Columna de Horas a la izquierda */}
              <div className="w-14 sm:w-24 pr-2 sm:pr-3 flex-shrink-0 relative select-none">
                {horasTimeline.map((h, index) => (
                  <div
                    key={h}
                    className="absolute right-3 -mt-2.5 text-right"
                    style={{ top: `${index * ALTURA_HORA_PX}px` }}
                  >
                    <span className="text-[11px] sm:text-xs font-semibold text-[#7D6870]">
                      {formatearHora12(h)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Lienzo del Timeline a la derecha */}
              <div ref={lienzoTimelineDiarioRef} className="flex-1 relative border-l border-[#F2C4D2]/60">
                {/* FRONTAL: Línea roja de la hora actual en tiempo real */}
                {esHoy && estaEnHorario && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none flex items-center transition-all duration-700"
                    style={{ top: `${posicionYLinea}px` }}
                  >
                    <span className="absolute -left-14 sm:-left-16 -top-2.5 bg-red-500 text-white text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      {horaMinutosActualStr}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white shadow-xs" />
                    <div className="flex-1 h-[2px] bg-red-500 shadow-xs" />
                  </div>
                )}

                {/* Filas de fondo con guías horarias completas y de media hora clicables para agendar */}
                <div className="absolute inset-0 flex flex-col">
                  {horasTimeline.map((h) => {
                    const hStr00 = `${String(h).padStart(2, '0')}:00`;
                    const cierreStr = (configAnticipo.horaCierre || '19:00').slice(0, 5);
                    const horaCierreMs = new Date(`${fechaActualTimeline}T${cierreStr}:00-05:00`).getTime();
                    const slot00Ms = new Date(`${fechaActualTimeline}T${hStr00}:00-05:00`).getTime();
                    const esHoraPasadaTimeline = fechaActualTimeline < hoyStr || (esHoy && slot00Ms <= ahoraMs);

                    return (
                      <div
                        key={h}
                        className="relative group border-b border-[#F2C4D2]/60 flex flex-col"
                        style={{ height: `${ALTURA_HORA_PX}px` }}
                      >
                        {renderSubFranjas30Min(h, fechaActualTimeline, canchaId, esHoy, ahoraMs, 'diaria')}

                        {/* Botones de acción rápida al pasar el cursor */}
                        <div className="absolute right-3 top-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition z-10 pointer-events-auto">
                          {canchaId && !esHoraPasadaTimeline && slot00Ms < horaCierreMs && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalBloquear(canchaId, hStr00, fechaActualTimeline);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold hover:bg-amber-100 cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1"
                              title="Bloquear este horario"
                            >
                              <IconLock className="w-3 h-3 text-amber-700" />
                              <span>Bloquear</span>
                            </button>
                          )}
                          {puedeAgendar && !esHoraPasadaTimeline && slot00Ms < horaCierreMs && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalAgendar(canchaId || undefined, hStr00, fechaActualTimeline);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-white border border-[#F2C4D2] text-[#8C243B] text-[10px] font-bold hover:bg-[#FCE8EF] cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1"
                            >
                              <IconPlus className="w-3 h-3" />
                              <span>Agendar turno</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* CAPA DE CITAS POSICIONADAS EXACTAMENTE SEGÚN SUS MINUTOS Y DURACIÓN */}
                <div className="absolute inset-0 pointer-events-none">
                  {citasPosicionadas.map((pos) => {
                    const { cita, top, height, colIndex, totalCols } = pos;
                    const horaInicio = obtenerHoraMinutosBogota(cita.fecha_inicio);
                    const horaFin = cita.fecha_fin ? obtenerHoraMinutosBogota(cita.fecha_fin) : '';
                    const esBloqueada = cita.estado === 'bloqueada';
                    const { motivo: motivoBloqueo, por: bloqueadoPor } = obtenerDetalleBloqueo(cita);
                    const nombreClienta = obtenerNombreClienta(cita);
                    const servicioNombre = obtenerServicioCita(cita);
                    const telLimpio = String(cita.clientes?.telefono_wa || '').replace(/\D/g, '');
                    const puedeDesbloquear = esAdmin || (perfilActual?.canchaId === cita.cancha_id);

                    const inicioMs = new Date(cita.fecha_inicio).getTime();
                    const finMs = cita.fecha_fin ? new Date(cita.fecha_fin).getTime() : inicioMs + 45 * 60000;
                    const estaEnAtencion = esHoy && !esBloqueada && cita.estado !== 'completada' && cita.estado !== 'cancelada' && ahoraMs >= inicioMs && ahoraMs < finMs;
                    const esMovible = !esBloqueada && cita.estado !== 'completada' && cita.estado !== 'cancelada' && finMs > ahoraMs;
                    const esCitaArrastrada = dragCitaSemanal?.modo === 'diaria' && dragCitaSemanal?.cita.id === cita.id;

                    const leftPercent = (colIndex / totalCols) * 100;
                    const widthPercent = (1 / totalCols) * 100;

                    return (
                      <div
                        key={cita.id}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => iniciarHoldCitaSemanal(cita, 0, fechaActualTimeline, pos, e, 'diaria')}
                        onContextMenu={(e) => {
                          if (esMovible) e.preventDefault();
                        }}
                        onMouseEnter={(e) => abrirPopoverCita(cita, e)}
                        onMouseLeave={cerrarPopoverCita}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${leftPercent}% + 4px)`,
                          width: `calc(${widthPercent}% - 8px)`,
                          WebkitTouchCallout: 'none',
                        }}
                        className={`absolute z-20 pointer-events-auto rounded-2xl border transition-all flex flex-col justify-between overflow-hidden p-2.5 sm:p-3 select-none ${
                          esCitaArrastrada
                            ? 'border-2 border-dashed border-[#8C243B]/45 bg-[#FFF5F7]/70 opacity-60 shadow-none pointer-events-none'
                            : `shadow-xs hover:shadow-md ${esMovible ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                                esBloqueada
                                  ? 'bg-gradient-to-r from-amber-50 to-orange-50/80 border-amber-300 shadow-amber-100/50'
                                  : estaEnAtencion
                                  ? 'bg-rose-50/90 border-[#8C243B] ring-2 ring-[#8C243B]/20 shadow-[#8C243B]/10'
                                  : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago'
                                  ? 'bg-amber-50/80 border-amber-300 shadow-amber-100/40 text-amber-950'
                                  : cita.estado === 'completada'
                                  ? 'bg-emerald-50/80 border-emerald-300'
                                  : cita.estado === 'cancelada'
                                  ? 'bg-slate-50 border-slate-200 opacity-60'
                                  : 'bg-white border-[#F2C4D2] hover:border-[#8C243B]'
                              }`
                        }`}
                        title={
                          esMovible
                            ? 'Clic corto: ver detalles · Mantén presionado: mover horario o traslapar parcialmente'
                            : 'Clic para ver todos los detalles de esta cita'
                        }
                      >
                        {/* Cabecera de la Cita */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`px-2 py-0.5 rounded-lg border font-mono font-bold text-xs flex items-center gap-1 shadow-2xs shrink-0 ${
                                esBloqueada
                                  ? 'bg-amber-100/80 border-amber-300 text-amber-900'
                                  : 'bg-[#FFF5F7] border-[#F2C4D2] text-[#8C243B]'
                              }`}
                            >
                              {esBloqueada ? (
                                <IconLock className="w-3.5 h-3.5 text-amber-700" />
                              ) : (
                                <IconClock className="w-3.5 h-3.5 text-[#C74B66]" />
                              )}
                              <span>{formatearRangoHoras12(horaInicio, horaFin)}</span>
                            </div>

                            <div className="min-w-0 flex items-center gap-1.5 truncate">
                              <p
                                className={`font-bold text-xs sm:text-sm truncate ${
                                  esBloqueada ? 'text-amber-950 font-serif' : 'text-[#2D2529]'
                                }`}
                                title={esBloqueada ? motivoBloqueo : nombreClienta}
                              >
                                {esBloqueada ? `🔒 ${motivoBloqueo}` : nombreClienta}
                              </p>
                              {esBloqueada ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 border border-amber-300 shrink-0">
                                  BLOQUEADO
                                </span>
                              ) : estaEnAtencion ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.2 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs animate-pulse shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  EN ATENCIÓN
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Acciones principales */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {esBloqueada ? (
                              puedeDesbloquear && (
                                <button
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    handleDesbloquearHorario(cita.id, horaInicio);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                                  title="Desbloquear este horario para volver a habilitar reservas"
                                >
                                  <IconLockOpen className="w-3 h-3 text-amber-700" />
                                  <span>Desbloquear</span>
                                </button>
                              )
                            ) : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago' ? (
                                  <>
                                    {/* Badge de estado de anticipo */}
                                    {cita.notas?.includes('[COMPROBANTE_DUDOSO_REVISION_MANUAL]') || cita.notas?.includes('[COMPROBANTE_VALIDO_IA]') ? (
                                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500 text-white shadow-2xs animate-pulse" title="Comprobante dudoso por su forma en revisión manual">
                                        ⚠️ Comprobante dudoso en revisión
                                      </span>
                                    ) : (
                                      (() => {
                                        if (!cita.expiracion_reserva) {
                                          return (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                              ⏳ Esperando abono
                                            </span>
                                          );
                                        }
                                        const expMs = new Date(cita.expiracion_reserva).getTime();
                                        const diffMin = Math.round((expMs - ahora.getTime()) / (1000 * 60));
                                        return (
                                          <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                              diffMin <= 0
                                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                                : 'bg-amber-100 text-amber-900 border-amber-300'
                                            }`}
                                          >
                                            {diffMin <= 0 ? '⚠️ Expirado' : `⏳ Quedan ${diffMin} min`}
                                          </span>
                                        );
                                      })()
                                    )}

                                    {telLimpio && (
                                      <a
                                        href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                                          nombreClienta
                                        )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20al%20abono%20de%20tu%20cita%20de%20las%20${formatearHora12(horaInicio)}.`}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(ev) => ev.stopPropagation()}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition shadow-2xs"
                                        title="Escribir por WhatsApp"
                                      >
                                        <IconBrandWhatsapp className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">WhatsApp</span>
                                      </a>
                                    )}

                                    {esAdmin && (
                                      <>
                                        <button
                                          disabled={procesandoAccionAnticipo === cita.id}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            handleAprobarAnticipo(cita.id, nombreClienta);
                                          }}
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                                          title="Aprobar abono recibido y confirmar la cita"
                                        >
                                          <IconCheck className="w-3.5 h-3.5" />
                                          <span>Aprobar Abono</span>
                                        </button>

                                        <button
                                          disabled={procesandoAccionAnticipo === cita.id}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            handleRechazarAnticipo(cita.id, nombreClienta);
                                          }}
                                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
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
                                    <span
                                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                    cita.estado === 'completada'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : cita.estado === 'cancelada'
                                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                                      : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                                  }`}
                                >
                                  {esPorConfirmar(cita) ? 'POR CONFIRMAR' : cita.estado.toUpperCase()}
                                </span>

                                {telLimpio && (
                                  <a
                                    href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                                      nombreClienta
                                    )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20las%20${formatearHora12(horaInicio)}.`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(ev) => ev.stopPropagation()}
                                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold transition shadow-2xs"
                                    title="Escribir por WhatsApp"
                                  >
                                    <IconBrandWhatsapp className="w-3 h-3" />
                                    <span className="hidden sm:inline">WhatsApp</span>
                                  </a>
                                )}

                                {cita.estado !== 'completada' && cita.estado !== 'cancelada' && (
                                  <>
                                    <button
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        handleCambiarEstado(cita.id, 'completada');
                                      }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                                      title="Marcar como atendida"
                                    >
                                      <IconCheck className="w-3 h-3" />
                                      <span className="hidden sm:inline">Completada</span>
                                    </button>

                                    <button
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        handleCambiarEstado(cita.id, 'cancelada');
                                      }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                                      title="Cancelar cita y liberar el horario inmediatamente"
                                    >
                                      <IconX className="w-3 h-3" />
                                      <span className="hidden sm:inline">Cancelar</span>
                                    </button>
                                  </>
                                )}

                              </>
                            )}
                          </div>
                        </div>

                        {/* Detalle de servicio y precio */}
                        {height >= 52 && (
                          <div className="flex items-center justify-between text-xs text-[#7D6870] pt-1 border-t border-[#FCE8EF]/70">
                            <div className="truncate">
                              {esBloqueada ? (
                                <span className="text-[11px]">Bloqueado por: {bloqueadoPor}</span>
                              ) : (
                                <>
                                  <span className="font-medium">💅 {servicioNombre}</span>
                                  <span className="ml-2 font-bold text-[#8C243B]">
                                    ${Number(cita.valor_total || 25000).toLocaleString('es-CO')}
                                  </span>
                                </>
                              )}
                              {(!canchaId || canchaId === 'todas') && (() => {
                                const espCancha = canchas.find((c) => c.id === cita.cancha_id);
                                return espCancha ? (
                                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#8C243B] bg-[#FFF5F7] px-2 py-0.5 rounded-full border border-[#F2C4D2]">
                                    💅 {espCancha.nombre}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <span className="text-[10px] text-[#8C243B]/70 font-semibold italic hidden sm:inline">
                              Pasa el mouse para ver detalles
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Previsualización magnética y bloque flotante durante el arrastre en vista diaria */}
                {dragCitaSemanal &&
                  dragCitaSemanal.modo === 'diaria' &&
                  dragCitaSemanal.targetFechaIso === fechaActualTimeline &&
                  (!canchaId || canchaId === 'todas' || canchaId === dragCitaSemanal.cita.cancha_id) &&
                  (() => {
                    const dragHoraIni = formatearMinutosAHHMM(horaAperturaNum, dragCitaSemanal.targetMinInicio);
                    const dragHoraFin = formatearMinutosAHHMM(
                      horaAperturaNum,
                      dragCitaSemanal.targetMinInicio + dragCitaSemanal.duracionMinutos
                    );
                    const dragNombre = obtenerNombreClienta(dragCitaSemanal.cita);
                    const dragServicio = obtenerServicioCita(dragCitaSemanal.cita);

                    return (
                      <>
                        {/* Recuadro guía magnético (posición exacta donde encajará al soltar) */}
                        <div
                          style={{
                            top: `${dragCitaSemanal.snappedTopPx}px`,
                            height: `${dragCitaSemanal.alturaPx}px`,
                            left: '4px',
                            width: 'calc(100% - 8px)',
                            transition: 'top 90ms ease-out',
                          }}
                          className={`absolute z-30 pointer-events-none rounded-2xl border-2 border-dashed flex items-center justify-center p-2 text-center ${
                            dragCitaSemanal.esValido
                              ? dragCitaSemanal.esTraslapeParcial
                                ? 'border-violet-500 bg-violet-50/75 text-violet-900 shadow-sm'
                                : 'border-emerald-500 bg-emerald-50/75 text-emerald-800 shadow-sm'
                              : 'border-rose-500 bg-rose-50/80 text-rose-700 shadow-sm'
                          }`}
                        >
                          <span className="text-xs font-extrabold font-mono px-2.5 py-1 rounded-xl bg-white/95 shadow-2xs truncate">
                            {dragCitaSemanal.esValido
                              ? dragCitaSemanal.esTraslapeParcial
                                ? `✓ Traslape parcial: ${formatearHora12(dragHoraIni)} - ${formatearHora12(dragHoraFin)}`
                                : `✓ ${formatearHora12(dragHoraIni)} - ${formatearHora12(dragHoraFin)}`
                              : `⚠ ${dragCitaSemanal.motivoInvalido || 'No disponible'}`}
                          </span>
                        </div>

                        {/* Bloque flotante con movimiento continuo */}
                        <div
                          style={{
                            top: `${dragCitaSemanal.rawTopPx}px`,
                            height: `${dragCitaSemanal.alturaPx}px`,
                            left: '4px',
                            width: 'calc(100% - 8px)',
                          }}
                          className={`absolute z-40 pointer-events-none rounded-2xl border-2 p-2.5 sm:p-3 shadow-2xl scale-[1.01] flex flex-col justify-between overflow-hidden ring-4 backdrop-blur-xs select-none ${
                            dragCitaSemanal.esValido
                              ? dragCitaSemanal.esTraslapeParcial
                                ? 'bg-white/95 border-violet-600 ring-violet-400/35 text-[#2D2529]'
                                : 'bg-white/95 border-[#8C243B] ring-emerald-400/35 text-[#2D2529]'
                              : 'bg-rose-50/95 border-rose-500 ring-rose-400/35 text-rose-950'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 leading-none">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="px-2 py-0.5 rounded-lg border bg-[#FFF5F7] border-[#F2C4D2] text-[#8C243B] font-mono font-bold text-xs flex items-center gap-1 shrink-0">
                                <IconClock className="w-3.5 h-3.5 text-[#C74B66]" />
                                <span>{formatearRangoHoras12(dragHoraIni, dragHoraFin)}</span>
                              </div>
                              <p className="font-bold text-xs sm:text-sm truncate">{dragNombre}</p>
                            </div>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${
                                dragCitaSemanal.esValido
                                  ? dragCitaSemanal.esTraslapeParcial
                                    ? 'bg-violet-100 text-violet-800 border-violet-300'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {dragCitaSemanal.esValido
                                ? dragCitaSemanal.esTraslapeParcial
                                  ? '✓ Traslape parcial'
                                  : '✓ Libre'
                                : dragCitaSemanal.motivoInvalido}
                            </span>
                          </div>

                          {dragCitaSemanal.alturaPx >= 52 && (
                            <div className="leading-none text-xs text-[#7D6870] truncate pt-1 border-t border-[#FCE8EF]/70">
                              <span className="truncate">💅 {dragServicio}</span>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };


  // ============================================================================
  // RENDERIZADO: PLANIFICADOR SEMANAL TIMELINE (LUNES A DOMINGO x HORAS)
  // Mantiene idéntica estética al Timeline Diario pero dividido en 7 columnas de días
  // ============================================================================
  const renderVistaSemanal = (
    citasFiltradas: Reserva[],
    esVistaAdmin: boolean,
    especialistaIdActual?: string
  ) => {
    const targetCancha = canchas.find((c) => c.id === especialistaIdActual);
    const nombreTarget =
      especialistaIdActual && especialistaIdActual !== 'todas'
        ? targetCancha?.nombre || 'Especialista'
        : esVistaAdmin
        ? 'Todas las Especialistas'
        : perfilActual?.nombre || 'Mi Agenda';

    const icono =
      especialistaIdActual && especialistaIdActual !== 'todas' ? '💅' : '👑';

    const horaActualNum = ahora.getHours();
    const minutosActuales = ahora.getMinutes();
    const horaAperturaNum = parseInt((configAnticipo.horaApertura || '08:00').split(':')[0], 10) || 8;
    const horaCierreNum = parseInt((configAnticipo.horaCierre || '19:00').split(':')[0], 10) || 19;
    const estaEnHorario = horaActualNum >= horaAperturaNum && horaActualNum <= horaCierreNum;
    const minutosDesdeApertura = (horaActualNum - horaAperturaNum) * 60 + minutosActuales;
    const posicionYLinea = (minutosDesdeApertura / 60) * ALTURA_HORA_PX;
    const horaMinutosActualStr = formatearHora12(
      ahora.toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    );
    const esSemanaActual = diasDeLaSemana.some((d) => d.esHoy);
    const ALTURA_TOTAL_TIMELINE = horasTimeline.length * ALTURA_HORA_PX;
    const ahoraMs = ahora.getTime();

    return (
      <motion.div
        key={`semana-${diasDeLaSemana[0]?.fechaIso || fechaSeleccionada}`}
        initial={{ opacity: 0.35 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-3xl border border-[#F2C4D2] shadow-xs"
      >
        {/* Cabecera del Timeline Semanal (fluye naturalmente al hacer scroll hacia abajo) */}
        <div
          onTouchStart={handleTouchStartCabeceraSemanal}
          onTouchEnd={handleTouchEndCabeceraSemanal}
          className="p-3.5 sm:p-4 bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border-b border-[#F2C4D2] rounded-t-3xl flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 touch-pan-y select-none"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#F2C4D2] flex items-center justify-center font-bold text-base text-[#8C243B] shadow-2xs">
              {icono}
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[#2D2529] font-serif">
                {nombreTarget}
              </h3>
              <p className="text-xs text-[#7D6870]">
                {etiquetaSemana} · <strong className="text-[#8C243B]">{citasFiltradas.filter((r) => r.estado !== 'cancelada').length} citas</strong> agendadas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#7D6870] hidden sm:inline">
              Horario: {formatearHora12(configAnticipo.horaApertura || '08:00')} a {formatearHora12(configAnticipo.horaCierre || '19:00')}
            </span>
            {esSemanaActual && estaEnHorario && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Ahora: {horaMinutosActualStr}
              </span>
            )}
          </div>
        </div>

        {/* Indicador táctil para celular */}
        <div className="sm:hidden px-3 py-1.5 bg-[#FFF0F4] border-b border-[#F2C4D2] text-[10px] text-[#8C243B] font-medium flex items-center justify-center gap-1.5 select-none">
          <span>↔️</span>
          <span>Desliza para ver días · En los topes cambia de semana</span>
        </div>

        {/* ENCABEZADOS DE LOS 7 DÍAS (STICKY AL VIEWPORT AL HACER SCROLL VERTICAL EN LA PÁGINA) */}
        <div
          style={{ top: `${stickyTopOffset}px` }}
          className="sticky z-30 bg-white/95 backdrop-blur-md border-b border-[#F2C4D2] shadow-xs"
        >
          <div
            ref={headerScrollSemanalRef}
            onScroll={handleScrollHeaderSemanal}
            onTouchStart={handleTouchStartSemanalBody}
            onTouchEnd={handleTouchEndSemanalBody}
            className="overflow-x-auto no-scrollbar touch-pan-x touch-pan-y"
          >
            <div className="min-w-[980px] sm:min-w-[1050px] w-full px-2.5 sm:px-5 pr-4 sm:pr-6 pt-2 pb-2.5 flex items-center">
              <div className="w-16 sm:w-24 pr-3 flex-shrink-0 text-right select-none sticky left-0 z-30 bg-white/95 backdrop-blur-xs self-stretch flex items-center justify-end">
                <span className="text-[11px] font-extrabold text-[#8C243B] uppercase tracking-wider">
                  HORA
                </span>
              </div>

              <div className="flex-1 grid grid-cols-7 divide-x divide-[#F2C4D2]/60 border-l border-r border-[#F2C4D2]/60">
                {diasDeLaSemana.map((d) => {
                  const citasDelDia = citasFiltradas.filter((r) => {
                    if (!r.fecha_inicio) return false;
                    const fCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
                      timeZone: 'America/Bogota',
                    });
                    return fCita === d.fechaIso && r.estado !== 'cancelada' && r.estado !== 'bloqueada';
                  });
                  const esDiaDestinoDrag = dragCitaSemanal?.targetFechaIso === d.fechaIso;

                  return (
                    <div
                      key={d.fechaIso}
                      className={`px-1.5 py-1 text-center transition-colors rounded-xl mx-0.5 ${
                        esDiaDestinoDrag
                          ? dragCitaSemanal.esValido
                            ? 'bg-emerald-50 ring-2 ring-emerald-500/60'
                            : 'bg-rose-50 ring-2 ring-rose-500/60'
                          : d.esHoy
                          ? 'bg-[#FFF5F7] ring-1 ring-[#8C243B]/25'
                          : ''
                      }`}
                    >
                      <p
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          d.esHoy ? 'text-[#8C243B]' : 'text-[#7D6870]'
                        }`}
                      >
                        {d.nombreCorto}
                      </p>
                      <div className="flex items-center justify-center gap-1 my-0.5">
                        <span
                          className={`text-base font-extrabold font-serif ${
                            d.esHoy ? 'text-[#8C243B]' : 'text-[#2D2529]'
                          }`}
                        >
                          {d.diaNum} {d.mesCorto}
                        </span>
                        {d.esHoy && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#8C243B] text-white leading-none">
                            HOY
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border inline-block ${
                          d.esHoy
                            ? 'bg-[#8C243B] text-white border-[#8C243B]'
                            : 'bg-white text-[#8C243B] border-[#F2C4D2]'
                        }`}
                      >
                        {citasDelDia.length} {citasDelDia.length === 1 ? 'cita' : 'citas'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Grilla Semanal dividida en 7 días y con horas de apertura a cierre (sin ventana vertical interna) */}
        <div
          ref={scrollSemanalRef}
          onScroll={handleScrollBodySemanal}
          onTouchStart={handleTouchStartSemanalBody}
          onTouchEnd={handleTouchEndSemanalBody}
          className="relative overflow-x-auto touch-pan-x touch-pan-y rounded-b-3xl bg-white"
        >
          <div className="min-w-[980px] sm:min-w-[1050px] w-full px-2.5 sm:px-5 pr-4 sm:pr-6 pt-3 pb-2.5 sm:pb-5">
            {/* CUERPO DEL TIMELINE CONTINUO POR COLUMNAS DE DÍAS (LUNES A DOMINGO) */}
            <div className="flex relative" style={{ height: `${ALTURA_TOTAL_TIMELINE}px` }}>
              {/* Columna de Horas a la izquierda */}
              <div className="w-16 sm:w-24 pr-3 flex-shrink-0 relative select-none sticky left-0 z-20 bg-white/95 backdrop-blur-xs">
                {horasTimeline.map((h, index) => (
                  <div
                    key={h}
                    className="absolute right-3 -mt-2.5 text-right"
                    style={{ top: `${index * ALTURA_HORA_PX}px` }}
                  >
                    <span className="text-[11px] sm:text-xs font-semibold text-[#7D6870]">
                      {formatearHora12(h)}
                    </span>
                  </div>
                ))}
              </div>

              {/* 7 Columnas de los Días a la derecha */}
              <div
                ref={columnasDiasSemanalRef}
                className="flex-1 grid grid-cols-7 divide-x divide-[#F2C4D2]/60 relative border-l border-r border-[#F2C4D2]/60"
              >
                {/* FRONTAL: Línea roja de la hora actual en tiempo real si esta semana incluye hoy */}
                {esSemanaActual && estaEnHorario && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none flex items-center transition-all duration-700"
                    style={{ top: `${posicionYLinea}px` }}
                  >
                    <span className="absolute -left-14 sm:-left-16 -top-2.5 bg-red-500 text-white text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 select-none">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      {horaMinutosActualStr}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white shadow-xs" />
                    <div className="flex-1 h-[2px] bg-red-500 shadow-xs" />
                  </div>
                )}

                {/* Las 7 Columnas de días */}
                {diasDeLaSemana.map((d, dayIdx) => {
                  const citasDelDia = citasFiltradas
                    .filter((r) => {
                      if (!r.fecha_inicio) return false;
                      const fCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
                        timeZone: 'America/Bogota',
                      });
                      return fCita === d.fechaIso && r.estado !== 'cancelada';
                    })
                    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());

                  const posicionesDia = calcularPosicionesCitas(citasDelDia, horaAperturaNum);
                  const esColumnaDestinoDrag = dragCitaSemanal?.modo === 'semanal' && dragCitaSemanal?.targetFechaIso === d.fechaIso;

                  return (
                    <div
                      key={d.fechaIso}
                      className={`relative h-full transition-colors ${
                        esColumnaDestinoDrag && dragCitaSemanal
                          ? dragCitaSemanal.esValido
                            ? 'bg-emerald-50/35'
                            : 'bg-rose-50/35'
                          : d.esHoy
                          ? 'bg-rose-50/10'
                          : ''
                      }`}
                    >
                      {/* Filas de fondo con guías horarias completas y de media hora clicables para agendar */}
                      <div className="absolute inset-0 flex flex-col">
                        {horasTimeline.map((h) => (
                          <div
                            key={h}
                            className="relative border-b border-[#F2C4D2]/60 flex flex-col"
                            style={{ height: `${ALTURA_HORA_PX}px` }}
                          >
                            {renderSubFranjas30Min(h, d.fechaIso, especialistaIdActual, d.esHoy, ahoraMs, 'semanal')}
                          </div>
                        ))}
                      </div>

                      {/* Tarjetas de citas limpias y sin recortes en la vista semanal */}
                      <div className="absolute inset-0 pointer-events-none">
                        {posicionesDia.map((pos) => {
                          const { cita, top, height, colIndex, totalCols } = pos;
                          const horaInicio = obtenerHoraMinutosBogota(cita.fecha_inicio);
                          const horaFin = cita.fecha_fin ? obtenerHoraMinutosBogota(cita.fecha_fin) : '';
                          const esBloqueada = cita.estado === 'bloqueada';
                          const { motivo: motivoBloqueo } = obtenerDetalleBloqueo(cita);
                          const nombreClienta = obtenerNombreClienta(cita);
                          const servicioNombre = obtenerServicioCita(cita);

                          const inicioMs = new Date(cita.fecha_inicio).getTime();
                          const finMs = cita.fecha_fin ? new Date(cita.fecha_fin).getTime() : inicioMs + 45 * 60000;
                          const estaEnAtencion = d.esHoy && !esBloqueada && cita.estado !== 'completada' && cita.estado !== 'cancelada' && ahoraMs >= inicioMs && ahoraMs < finMs;
                          const esMovible = !esBloqueada && cita.estado !== 'completada' && cita.estado !== 'cancelada' && finMs > ahoraMs;
                          const esCitaArrastrada = dragCitaSemanal?.cita.id === cita.id;

                          const leftPercent = (colIndex / totalCols) * 100;
                          const widthPercent = (1 / totalCols) * 100;

                          // Asegurar una altura visual mínima de 44px para evitar recortes
                          const alturaReal = Math.max(44, height);

                          return (
                            <div
                              key={cita.id}
                              data-cita-sem-card="true"
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => iniciarHoldCitaSemanal(cita, dayIdx, d.fechaIso, pos, e)}
                              onContextMenu={(e) => {
                                if (esMovible) e.preventDefault();
                              }}
                              style={{
                                top: `${top}px`,
                                height: `${alturaReal}px`,
                                left: `calc(${leftPercent}% + 2px)`,
                                width: `calc(${widthPercent}% - 4px)`,
                                WebkitTouchCallout: 'none',
                              }}
                              className={`absolute z-20 pointer-events-auto rounded-xl border text-xs p-1.5 transition-all select-none flex flex-col justify-between overflow-hidden ${
                                esCitaArrastrada
                                  ? 'border-2 border-dashed border-[#8C243B]/45 bg-[#FFF5F7]/70 opacity-60 shadow-none pointer-events-none'
                                  : `shadow-2xs hover:shadow-lg hover:scale-[1.02] hover:z-30 ${
                                      esMovible ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                    } ${
                                      esBloqueada
                                        ? 'bg-gradient-to-r from-amber-50 to-orange-50/80 border-amber-300 text-amber-900 shadow-amber-100/50'
                                        : estaEnAtencion
                                        ? 'bg-rose-50/90 border-[#8C243B] ring-2 ring-[#8C243B]/20 text-[#8C243B]'
                                        : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago'
                                        ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                                        : cita.estado === 'completada'
                                        ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                                        : cita.estado === 'cancelada'
                                        ? 'bg-slate-50 border-slate-200 opacity-60 text-slate-700'
                                        : 'bg-white border-[#F2C4D2] hover:border-[#8C243B] text-[#2D2529]'
                                    }`
                              }`}
                              title={
                                esMovible
                                  ? 'Clic corto: ver detalles · Mantén presionado: mover a otro día u horario'
                                  : 'Clic para ver todos los detalles de esta cita'
                              }
                            >
                              {/* Fila 1: Hora exacta y Estado */}
                              <div className="flex items-center justify-between gap-1 leading-none">
                                <div className="font-mono font-bold text-[9px] truncate flex items-center gap-0.5">
                                  {esBloqueada ? (
                                    <IconLock className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                  ) : (
                                    <IconClock className="w-2.5 h-2.5 text-[#C74B66] shrink-0" />
                                  )}
                                  <span>{formatearRangoHoras12(horaInicio, horaFin, true)}</span>
                                </div>

                                {estaEnAtencion ? (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-black px-1 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 animate-pulse shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-rose-600" />
                                    EN CURSO
                                  </span>
                                ) : (
                                  <span
                                    className={`text-[8px] font-extrabold px-1 py-0.2 rounded border shrink-0 ${
                                      esBloqueada
                                        ? 'bg-amber-200 text-amber-900 border-amber-300'
                                        : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : cita.estado === 'completada'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : cita.estado === 'cancelada'
                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                        : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                                    }`}
                                  >
                                    {esBloqueada ? 'BLOQ' : (cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago') ? 'ABONO' : cita.estado === 'completada' ? 'LISTA' : esPorConfirmar(cita) ? 'POR CONF.' : 'CONF'}
                                  </span>
                                )}
                              </div>

                              {/* Fila 2: Nombre de la clienta o Motivo Bloqueo */}
                              <div className="leading-tight my-0.5 truncate">
                                <p
                                  className={`font-bold text-[10px] truncate ${
                                    esBloqueada ? 'text-amber-950 font-serif' : 'text-[#2D2529]'
                                  }`}
                                >
                                  {esBloqueada ? `🔒 ${motivoBloqueo}` : nombreClienta}
                                </p>
                              </div>

                              {/* Fila 3: Servicio (cuando la altura lo permite) */}
                              {alturaReal >= 54 && (
                                <div className="leading-none text-[9px] text-[#7D6870] truncate pt-0.5 border-t border-[#FCE8EF]/70 flex items-center justify-between">
                                  <span className="truncate">{esBloqueada ? 'Turno no disponible' : `💅 ${servicioNombre}`}</span>
                                  {!esBloqueada && (
                                    <span className="font-mono font-bold text-[#8C243B] shrink-0 ml-1">
                                      ${Number(cita.valor_total || 25000).toLocaleString('es-CO')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Previsualización magnética y bloque flotante durante el arrastre */}
                {dragCitaSemanal && dragCitaSemanal.modo === 'semanal' && (() => {
                  const dragHoraIni = formatearMinutosAHHMM(horaAperturaNum, dragCitaSemanal.targetMinInicio);
                  const dragHoraFin = formatearMinutosAHHMM(
                    horaAperturaNum,
                    dragCitaSemanal.targetMinInicio + dragCitaSemanal.duracionMinutos
                  );
                  const dragNombre = obtenerNombreClienta(dragCitaSemanal.cita);
                  const dragServicio = obtenerServicioCita(dragCitaSemanal.cita);

                  return (
                    <>
                      {/* Recuadro guía magnético (posición exacta donde encajará al soltar) */}
                      <div
                        style={{
                          top: `${dragCitaSemanal.snappedTopPx}px`,
                          height: `${dragCitaSemanal.alturaPx}px`,
                          left: `calc(${(dragCitaSemanal.targetDayIndex / 7) * 100}% + 2px)`,
                          width: `calc(${100 / 7}% - 4px)`,
                          transition: 'top 90ms ease-out, left 100ms ease-out',
                        }}
                        className={`absolute z-30 pointer-events-none rounded-xl border-2 border-dashed flex items-center justify-center p-1 text-center ${
                          dragCitaSemanal.esValido
                            ? dragCitaSemanal.esTraslapeParcial
                              ? 'border-violet-500 bg-violet-50/75 text-violet-900 shadow-sm'
                              : 'border-emerald-500 bg-emerald-50/75 text-emerald-800 shadow-sm'
                            : 'border-rose-500 bg-rose-50/80 text-rose-700 shadow-sm'
                        }`}
                      >
                        <span className="text-[9px] font-extrabold font-mono px-1.5 py-0.5 rounded bg-white/90 shadow-2xs truncate">
                          {dragCitaSemanal.esValido
                            ? dragCitaSemanal.esTraslapeParcial
                              ? `✓ Traslape ${dragHoraIni}-${dragHoraFin}`
                              : `✓ ${dragHoraIni}-${dragHoraFin}`
                            : `⚠ ${dragCitaSemanal.motivoInvalido || 'No disponible'}`}
                        </span>
                      </div>

                      {/* Bloque flotante con movimiento continuo */}
                      <div
                        style={{
                          top: `${dragCitaSemanal.rawTopPx}px`,
                          height: `${dragCitaSemanal.alturaPx}px`,
                          left: `calc(${(dragCitaSemanal.targetDayIndex / 7) * 100}% + 2px)`,
                          width: `calc(${100 / 7}% - 4px)`,
                          transition: 'left 100ms ease-out',
                        }}
                        className={`absolute z-40 pointer-events-none rounded-xl border-2 p-1.5 shadow-2xl scale-[1.03] flex flex-col justify-between overflow-hidden ring-4 backdrop-blur-xs select-none ${
                          dragCitaSemanal.esValido
                            ? dragCitaSemanal.esTraslapeParcial
                              ? 'bg-white/95 border-violet-600 ring-violet-400/35 text-[#2D2529]'
                              : 'bg-white/95 border-[#8C243B] ring-emerald-400/35 text-[#2D2529]'
                            : 'bg-rose-50/95 border-rose-500 ring-rose-400/35 text-rose-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 leading-none">
                          <div className="font-mono font-bold text-[9px] truncate flex items-center gap-0.5 text-[#8C243B]">
                            <IconClock className="w-2.5 h-2.5 shrink-0" />
                            <span>{dragHoraIni}-{dragHoraFin}</span>
                          </div>
                          <span
                            className={`text-[8px] font-extrabold px-1 py-0.2 rounded border shrink-0 ${
                              dragCitaSemanal.esValido
                                ? dragCitaSemanal.esTraslapeParcial
                                  ? 'bg-violet-100 text-violet-800 border-violet-300'
                                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {dragCitaSemanal.esValido
                              ? dragCitaSemanal.esTraslapeParcial
                                ? '✓ Traslape'
                                : '✓ Libre'
                              : dragCitaSemanal.motivoInvalido}
                          </span>
                        </div>

                        <div className="leading-tight my-0.5 truncate">
                          <p className="font-bold text-[10px] truncate">{dragNombre}</p>
                        </div>

                        {dragCitaSemanal.alturaPx >= 54 && (
                          <div className="leading-none text-[9px] text-[#7D6870] truncate pt-0.5 border-t border-[#FCE8EF]/70">
                            <span className="truncate">💅 {dragServicio}</span>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };


  // ============================================================================
  // VISTA 2: DASHBOARD PRINCIPAL (ADMIN O MANICURISTA)
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#FFF5F7] text-[#2D2529] flex flex-col font-sans">
      {/* Toast de actualización en vivo (Supabase Realtime) */}
      <AnimatePresence>
        {notificacionRealtime && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-2.5 bg-[#8C243B] text-white px-4 py-2.5 rounded-2xl shadow-xl border border-white/20 text-xs font-semibold backdrop-blur-md"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{notificacionRealtime}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BARRA SUPERIOR ELEGANTE (En móvil se desplaza al bajar; en desktop/tablet permanece fija) */}
      <header ref={desktopHeaderRef} className="bg-white/95 backdrop-blur-md md:sticky md:top-0 z-40 md:border-b border-[#F2C4D2] md:shadow-xs">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-4 pt-2.5 pb-1.5 md:py-3">
          
          {/* FILA 1: Marca/Perfil a la izquierda, Controles del Sistema a la derecha */}
          <div className="flex items-center justify-between gap-3">
            {/* Lado Izquierdo: Logo, Nombre y Perfil */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#FFF5F7] p-1 border border-[#F2C4D2] overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  src="/mimate-nails-logo.png"
                  alt="Logo JL Mímate Nails"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="font-bold text-sm sm:text-base text-[#2D2529] font-serif leading-none truncate">
                    JL Mímate Nails
                  </h1>
                  <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1.5 ${perfilActual.colorBadge}`}>
                    {perfilActual.foto ? (
                      <img src={perfilActual.foto} alt="" className="w-3.5 h-3.5 rounded-full object-cover border border-[#F2C4D2]" />
                    ) : (
                      <span>{perfilActual.avatar}</span>
                    )}
                    <span>{esAdmin ? `${perfilActual.nombre.replace(/\s*\(Administradora\)/i, '')} (Admin)` : perfilActual.nombre}</span>
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-[#7D6870] mt-0.5 hidden sm:block">
                  Pereira, Cuba · Panel de Control de Turnos
                </p>
              </div>
            </div>

            {/* Lado Derecho: Indicador Realtime, Recargar, Volver Web y Salir */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Indicador de conexión Realtime */}
              <div
                className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl text-2xs font-semibold border transition select-none ${
                  realtimeConectado
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
                title={
                  realtimeConectado
                    ? 'Conexión en vivo activa: Las nuevas citas y cambios se actualizan al instante'
                    : 'Conectando con Supabase Realtime...'
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    realtimeConectado ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span className="hidden sm:inline">
                  {realtimeConectado ? 'En vivo' : 'Conectando'}
                </span>
              </div>

              {/* Recargar datos */}
              <button
                onClick={() => cargarReservas()}
                disabled={cargando}
                className="p-1.5 sm:p-2 rounded-xl border border-[#F2C4D2] hover:bg-[#FCE8EF] text-[#7D6870] hover:text-[#8C243B] transition cursor-pointer"
                title="Actualizar datos manualmente"
              >
                <IconRefresh className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${cargando ? 'animate-spin' : ''}`} />
              </button>

              {/* Volver a la página principal */}
              <button
                onClick={onIrAWebReservas}
                className="p-1.5 sm:p-2 rounded-xl border border-[#F2C4D2] hover:bg-[#FCE8EF] text-[#7D6870] hover:text-[#8C243B] transition cursor-pointer"
                title="Volver a la página principal (Reservas de clientas)"
              >
                <IconExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Salir */}
              <button
                onClick={handleCerrarSesion}
                className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#7D6870] text-xs font-semibold transition cursor-pointer"
                title="Cambiar de perfil / Cerrar sesión"
              >
                <IconLogout className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>

          {/* FILA 2: VISTA TABLET & DESKTOP (>= md) - Pestañas a la izquierda, Botones operativos a la derecha sin sobreposición */}
          <div className="hidden md:flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t border-[#F2C4D2]/50">
            {/* Pestañas Agenda / Métricas (Izquierda en Tablet/Desktop) */}
            {esAdmin ? (
              <div className="flex items-center bg-[#FCE8EF] p-1 rounded-xl border border-[#F2C4D2] shrink-0">
                <button
                  onClick={() => setTabAdmin('agenda')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    tabAdmin === 'agenda'
                      ? 'bg-white text-[#8C243B] shadow-xs'
                      : 'text-[#7D6870] hover:text-[#2D2529]'
                  }`}
                >
                  <IconCalendar className="w-3.5 h-3.5" />
                  <span>Agenda de Turnos</span>
                </button>
                <button
                  onClick={() => setTabAdmin('metricas')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    tabAdmin === 'metricas'
                      ? 'bg-white text-[#8C243B] shadow-xs'
                      : 'text-[#7D6870] hover:text-[#2D2529]'
                  }`}
                >
                  <IconChartBar className="w-3.5 h-3.5" />
                  <span>Métricas</span>
                </button>
              </div>
            ) : (
              <div />
            )}

            {/* Botones Operativos en Tablet / Desktop (con flex-wrap para pantallas medianas) */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Botón Agendar Cita (Disponible para Admin y Manicuristas) */}
              <button
                onClick={() => abrirModalAgendar()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 sm:py-2 bg-gradient-to-r from-[#8C243B] to-[#C74B66] hover:from-[#731D30] hover:to-[#B03C54] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
              >
                <IconPlus className="w-4 h-4 stroke-[3]" />
                <span>Agendar Cita</span>
              </button>

              {/* Botón Bloquear Horario */}
              <button
                onClick={() => abrirModalBloquear()}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
                title="Bloquear una o varias horas para que las clientas no puedan reservar"
              >
                <IconLock className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{esAdmin ? 'Bloquear Horario' : 'Bloquear Mi Horario'}</span>
              </button>

              {/* Botón Exclusivo para la Admin: Configuración de Horario de Trabajo y Anticipos */}
              {esAdmin && (
                <button
                  onClick={() => setModalConfigAnticipoAbierto(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer border bg-white border-[#F2C4D2] text-[#8C243B] hover:bg-[#FCE8EF]"
                  title="Configuración general del spa: horarios de trabajo, anticipos y cuentas de recaudo"
                >
                  <IconSettings className="w-3.5 h-3.5 text-[#C74B66]" />
                  <span>Configuración del Spa</span>
                </button>
              )}

              {/* Botón Exclusivo para la Admin: Vinculación de WhatsApp (No invasivo) */}
              {esAdmin && (
                <button
                  onClick={() => setModalWhatsAppAbierto(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
                  title="Estado del bot de WhatsApp y escaneo del código QR"
                >
                  <IconBrandWhatsapp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      whatsappConectado === true
                        ? 'bg-emerald-500'
                        : whatsappConectado === false
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                    title={
                      whatsappConectado === true
                        ? 'Conectado'
                        : whatsappConectado === false
                        ? 'Requiere vincular QR'
                        : 'Consultando'
                    }
                  />
                </button>
              )}

              {/* Botón Exclusivo para la Admin: Clientes con Bot Silenciado (Atención Humana) */}
              {esAdmin && (
                <button
                  onClick={abrirModalExclusiones}
                  className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
                  title="Gestionar números restringidos del bot para atención personalizada"
                >
                  <IconLock className="w-3.5 h-3.5 text-[#8C243B]" />
                  <span>Números Restringidos</span>
                  {exclusionesBot.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-[#8C243B] text-white text-[10px] font-mono font-bold">
                      {exclusionesBot.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* FILA EXCLUSIVA PARA MÓVIL (< md): Pestañas y Botones Secundarios (Quedan arriba al hacer scroll hacia abajo) */}
          {esAdmin && (
            <div className="md:hidden mt-2 pt-2 border-t border-[#F2C4D2]/40 space-y-2">
              {/* Pestañas Agenda / Métricas a ancho completo en móvil */}
              <div className="grid grid-cols-2 bg-[#FCE8EF] p-1 rounded-xl border border-[#F2C4D2]">
                <button
                  onClick={() => setTabAdmin('agenda')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    tabAdmin === 'agenda'
                      ? 'bg-white text-[#8C243B] shadow-xs'
                      : 'text-[#7D6870]'
                  }`}
                >
                  <IconCalendar className="w-3.5 h-3.5" />
                  <span>Agenda de Turnos</span>
                </button>
                <button
                  onClick={() => setTabAdmin('metricas')}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    tabAdmin === 'metricas'
                      ? 'bg-white text-[#8C243B] shadow-xs'
                      : 'text-[#7D6870]'
                  }`}
                >
                  <IconChartBar className="w-3.5 h-3.5" />
                  <span>Métricas</span>
                </button>
              </div>

              {/* Botones Secundarios de Administración (Config. Spa, WhatsApp, Números Restringidos) */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                {/* Configuración Spa */}
                <button
                  onClick={() => setModalConfigAnticipoAbierto(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-[#8C243B] border border-[#F2C4D2] text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95 hover:bg-[#FFF5F7]"
                >
                  <IconSettings className="w-3.5 h-3.5 text-[#C74B66]" />
                  <span>Config. Spa</span>
                </button>

                {/* WhatsApp Vinculación (Móvil) */}
                <button
                  onClick={() => setModalWhatsAppAbierto(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95 hover:bg-emerald-50"
                >
                  <IconBrandWhatsapp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      whatsappConectado === true
                        ? 'bg-emerald-500'
                        : whatsappConectado === false
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  />
                </button>

                {/* Números Restringidos */}
                <button
                  onClick={abrirModalExclusiones}
                  className="col-span-2 flex items-center justify-center gap-2 px-3 py-2 bg-white text-[#8C243B] border border-[#F2C4D2] text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95 hover:bg-[#FFF5F7]"
                >
                  <IconLock className="w-3.5 h-3.5 text-[#8C243B]" />
                  <span>Números Restringidos</span>
                  {exclusionesBot.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#8C243B] text-white text-[10px] font-mono font-bold leading-none">
                      {exclusionesBot.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>
      </header>

      {/* BARRA FIJA (STICKY) EXCLUSIVA EN MÓVIL (< md): Ubicada debajo de los demás controles para que al bajar solo queden fijos "Agendar Cita" y "Bloquear Horario" con transición suave */}
      <div ref={mobileStickyBarRef} className="md:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#F2C4D2] shadow-xs px-3.5 py-2">
        <div className="max-w-7xl mx-auto grid grid-cols-2 gap-2">
          {/* Agendar (Disponible para Admin y Manicuristas) */}
          <button
            onClick={() => abrirModalAgendar()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-[#8C243B] to-[#C74B66] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
          >
            <IconPlus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Agendar Cita</span>
          </button>

          {/* Bloquear */}
          <button
            onClick={() => abrirModalBloquear()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
          >
            <IconLock className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{esAdmin ? 'Bloquear Horario' : 'Bloquear Mi Horario'}</span>
          </button>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto w-full p-3 sm:p-6 space-y-4 sm:space-y-6 flex-1">
        
        {/* BARRA DE FECHA CON FLECHAS DÍA ANTERIOR / SIGUIENTE (Solo en vista de agenda) */}
        {(!esAdmin || tabAdmin === 'agenda') && (
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-[#F2C4D2] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center shrink-0">
                <IconClock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#2D2529]">
                  {esAdmin
                    ? 'Agenda General del Spa'
                    : `Mi Agenda Personal (${perfilActual.nombre})`}
                </p>
                <p className="text-[10px] sm:text-[11px] text-[#7D6870]">
                  {vistaAgenda === 'dia' ? (
                    <>
                      {fechaLegible} · <strong className="text-[#8C243B]">{citasClientesDelDia.length} citas</strong>
                      {bloqueosDelDia.length > 0 && (
                        <span className="ml-1 text-amber-700 font-semibold">
                          · {bloqueosDelDia.length} {bloqueosDelDia.length === 1 ? 'bloqueo' : 'bloqueos'}
                        </span>
                      )}{' '}
                      programadas
                    </>
                  ) : (
                    <>
                      Semana del {etiquetaSemana} ·{' '}
                      <strong className="text-[#8C243B]">{citasClientesDeLaSemana.length} citas</strong>
                      {bloqueosDeLaSemana.length > 0 && (
                        <span className="ml-1 text-amber-700 font-semibold">
                          · {bloqueosDeLaSemana.length} {bloqueosDeLaSemana.length === 1 ? 'bloqueo' : 'bloqueos'}
                        </span>
                      )}{' '}
                      programadas
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* CONTROLES DE VISTA Y FECHA */}
            <div className="flex flex-wrap items-center justify-between md:justify-end gap-2">
              {/* SELECTOR DE VISTA: DÍA VS SEMANA */}
              <div className="flex items-center bg-[#FCE8EF] p-1 rounded-xl border border-[#F2C4D2]">
                <button
                  onClick={() => setVistaAgenda('dia')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs ${
                    vistaAgenda === 'dia'
                      ? 'bg-[#8C243B] text-white shadow-xs'
                      : 'text-[#7D6870] hover:text-[#2D2529]'
                  }`}
                  title="Ver agenda detallada por día"
                >
                  <IconCalendarEvent className="w-3.5 h-3.5" />
                  <span>Día</span>
                </button>
                <button
                  onClick={() => setVistaAgenda('semana')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs ${
                    vistaAgenda === 'semana'
                      ? 'bg-[#8C243B] text-white shadow-xs'
                      : 'text-[#7D6870] hover:text-[#2D2529]'
                  }`}
                  title="Ver planificación de toda la semana"
                >
                  <IconCalendarMonth className="w-3.5 h-3.5" />
                  <span>Semana</span>
                </button>
              </div>

              {/* CONTROLES DE FECHA SEGÚN MODO DÍA O SEMANA */}
              {vistaAgenda === 'dia' ? (
                <div className="flex items-center gap-1 sm:gap-1.5 bg-[#FFF5F7] p-1 sm:p-1.5 rounded-xl border border-[#F2C4D2]">
                  {/* ACCESO RÁPIDO: Volver a Hoy a la izquierda */}
                  {fechaSeleccionada !== hoyStr && (
                    <button
                      onClick={() => irAFecha(hoyStr)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold bg-white text-[#8C243B] hover:bg-[#FCE8EF] border border-[#F2C4D2] transition cursor-pointer shadow-2xs animate-in fade-in"
                      title="Volver a la fecha actual"
                    >
                      Hoy
                    </button>
                  )}

                  <button
                    onClick={() => cambiarDia(-1)}
                    className="p-1.5 rounded-lg bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Día anterior"
                  >
                    <IconChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>

                  {/* BOTÓN/ETIQUETA DINÁMICA: Hoy, Mañana, Ayer o Sáb, 10 oct */}
                  <button
                    onClick={() => irAFecha(hoyStr)}
                    title={fechaSeleccionada === hoyStr ? 'Estás en el día de hoy' : 'Clic para volver al día de hoy'}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs bg-[#8C243B] text-white min-w-[65px] text-center hover:opacity-95 active:scale-95 overflow-hidden"
                  >
                    <motion.span
                      key={fechaSeleccionada}
                      initial={{ y: direccionSlide * 6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      className="inline-block"
                    >
                      {etiquetaFechaRelativa}
                    </motion.span>
                  </button>

                  <button
                    onClick={() => cambiarDia(1)}
                    className="p-1.5 rounded-lg bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Día siguiente"
                  >
                    <IconChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>

                  <div className="relative pl-0.5">
                    <SelectorFechaMimate
                      variante="compacto"
                      alignDropdown="right"
                      permitirFechasPasadas={true}
                      hoyStr={hoyStr}
                      value={fechaSeleccionada}
                      onChange={(nuevaFecha) => irAFecha(nuevaFecha)}
                      title="Seleccionar fecha en el calendario"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 sm:gap-1.5 bg-[#FFF5F7] p-1 sm:p-1.5 rounded-xl border border-[#F2C4D2]">
                  {/* ACCESO RÁPIDO: Volver a la Semana Actual */}
                  {!diasDeLaSemana.some((d) => d.esHoy) && (
                    <button
                      onClick={() => irAFecha(hoyStr)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold bg-white text-[#8C243B] hover:bg-[#FCE8EF] border border-[#F2C4D2] transition cursor-pointer shadow-2xs animate-in fade-in"
                      title="Volver a la semana actual"
                    >
                      Hoy
                    </button>
                  )}

                  <button
                    onClick={() => cambiarSemana(-1)}
                    className="p-1.5 rounded-lg bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Semana anterior"
                  >
                    <IconChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>

                  <button
                    onClick={() => irAFecha(hoyStr)}
                    title="Semana activa. Clic para volver a la actual"
                    className="px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs bg-[#8C243B] text-white min-w-[90px] text-center hover:opacity-95 active:scale-95 overflow-hidden"
                  >
                    <motion.span
                      key={diasDeLaSemana[0]?.fechaIso || fechaSeleccionada}
                      initial={{ y: direccionSlide * 6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      className="inline-block"
                    >
                      {diasDeLaSemana.some((d) => d.esHoy)
                        ? 'Esta Semana'
                        : `Semana ${diasDeLaSemana[0]?.diaNum} - ${diasDeLaSemana[6]?.diaNum}`}
                    </motion.span>
                  </button>

                  <button
                    onClick={() => cambiarSemana(1)}
                    className="p-1.5 rounded-lg bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Semana siguiente"
                  >
                    <IconChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>

                  <div className="relative pl-0.5">
                    <SelectorFechaMimate
                      variante="compacto"
                      alignDropdown="right"
                      permitirFechasPasadas={true}
                      hoyStr={hoyStr}
                      value={fechaSeleccionada}
                      onChange={(nuevaFecha) => irAFecha(nuevaFecha)}
                      title="Selecciona cualquier fecha para ver su semana"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* CASO A: VISTA DE LA ADMINISTRADORA (TABLA DE TODAS LAS MANICURISTAS)  */}
        {/* ==================================================================== */}
        {esAdmin && tabAdmin === 'agenda' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-[#2D2529] font-serif">
                {vistaAgenda === 'dia'
                  ? `Turnos por Especialista · ${fechaLegible}`
                  : `Planificación Semanal · ${etiquetaSemana}`}
              </h2>
              <span className="text-xs text-[#7D6870]">
                Horario: {formatearHora12(configAnticipo.horaApertura || '08:00')} a {formatearHora12(configAnticipo.horaCierre || '19:00')}
              </span>
            </div>

            {/* SELECTOR DE VISTA EN ADMINISTRADORA: 4 Columnas vs Timeline por Especialista */}
            <div className="flex items-center gap-2 pb-1 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
              <button
                onClick={() => setEspecialistaSeleccionadaId('todas')}
                className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0 ${
                  especialistaSeleccionadaId === 'todas'
                    ? 'bg-[#8C243B] text-white shadow-xs'
                    : 'bg-white text-[#7D6870] hover:text-[#2D2529] border border-[#F2C4D2]'
                }`}
              >
                <span>👑 {vistaAgenda === 'dia' ? 'Resumen 4 Especialistas' : 'Todas las Especialistas'}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 border border-current">
                  {vistaAgenda === 'dia' ? citasClientesDelDia.length : citasClientesDeLaSemana.length}
                </span>
              </button>

              {canchas.map((cancha) => {
                const totalCitas =
                  vistaAgenda === 'dia'
                    ? reservasDelDia.filter((r) => r.cancha_id === cancha.id && r.estado !== 'cancelada').length
                    : citasClientesDeLaSemana.filter((r) => r.cancha_id === cancha.id).length;

                return (
                  <button
                    key={cancha.id}
                    onClick={() => setEspecialistaSeleccionadaId(cancha.id)}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0 ${
                      especialistaSeleccionadaId === cancha.id
                        ? 'bg-[#8C243B] text-white shadow-xs'
                        : 'bg-white text-[#7D6870] hover:text-[#2D2529] border border-[#F2C4D2]'
                    }`}
                  >
                    <span>💅 {cancha.nombre}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 border border-current">
                      {totalCitas}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* VISTA SEMANAL (7 DÍAS) VS VISTAS DIARIAS */}
            {vistaAgenda === 'semana' ? (
              renderVistaSemanal(
                especialistaSeleccionadaId === 'todas'
                  ? reservasDeLaSemana.filter((r) => r.estado !== 'cancelada')
                  : reservasDeLaSemana.filter((r) => r.cancha_id === especialistaSeleccionadaId && r.estado !== 'cancelada'),
                true,
                especialistaSeleccionadaId
              )
            ) : (
              <div
                onTouchStart={handleTouchStartDia}
                onTouchEnd={handleTouchEndDia}
                className="touch-pan-y overflow-hidden"
              >
                {/* Indicador táctil para celular */}
                <div className="sm:hidden mb-2 px-3 py-1 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[10px] text-[#8C243B] font-medium flex items-center justify-center gap-1.5 select-none">
                  <span>↔️</span>
                  <span>Desliza a la izquierda o derecha para cambiar de día</span>
                </div>

                <motion.div
                  key={`admin-dia-${fechaSeleccionada}-${especialistaSeleccionadaId}`}
                  initial={{ x: direccionSlide * 60, opacity: 0.3 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                >
                  {especialistaSeleccionadaId !== 'todas' ? (
                  (() => {
                    const targetCancha = canchas.find((c) => c.id === especialistaSeleccionadaId);
                    const citasTarget = [...reservasDelDia]
                      .filter((r) => r.cancha_id === especialistaSeleccionadaId && r.estado !== 'cancelada')
                      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
                    return renderTimelineManicurista(
                      citasTarget,
                      targetCancha?.nombre || 'Especialista',
                      targetCancha?.id,
                      true
                    );
                  })()
                ) : (
                  /* TABLAS EN 4 COLUMNAS (1 POR CADA MANICURISTA) */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {canchas.map((cancha) => {
                const citasCancha = [...reservasDelDia]
                  .filter((r) => r.cancha_id === cancha.id && r.estado !== 'cancelada')
                  .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
                const esColumnaAdmin = cancha.nombre.toLowerCase().includes('lili') || cancha.nombre.toLowerCase().includes('jhoana');

                return (
                  <div
                    key={cancha.id}
                    className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs flex flex-col justify-between overflow-hidden"
                  >
                    {/* Encabezado de la Manicurista */}
                    <div className="p-3.5 bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border-b border-[#F2C4D2] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-white border-2 border-[#F2C4D2] overflow-hidden flex items-center justify-center font-bold text-xs text-[#8C243B] shrink-0 shadow-2xs">
                          {cancha.foto || FOTOS_EQUIPO_ADMIN[cancha.nombre.toLowerCase()] ? (
                            <img src={cancha.foto || FOTOS_EQUIPO_ADMIN[cancha.nombre.toLowerCase()]} alt={cancha.nombre} className="w-full h-full object-cover" />
                          ) : (
                            <span>💅</span>
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-xs text-[#2D2529] font-serif">
                            {cancha.nombre}
                          </h3>
                          <span className="text-[10px] text-[#7D6870]">
                            {esColumnaAdmin ? 'Admin & Especialista' : 'Especialista'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#8C243B] border border-[#F2C4D2]">
                        {citasCancha.length} citas
                      </span>
                    </div>

                    {/* Lista de Citas Asignadas a esta Manicurista (clic en espacio vacío agenda cita) */}
                    <div
                      onClick={() => {
                        if (esDomingoCerradoIso(fechaSeleccionada)) {
                          mostrarNotificacionRealtime('⚠️ Los domingos regulares el spa está cerrado (excepto en diciembre)');
                          return;
                        }
                        if (fechaSeleccionada < hoyStr) {
                          mostrarNotificacionRealtime('⚠️ No es posible agendar citas en fechas pasadas');
                          return;
                        }
                        abrirModalAgendar(cancha.id, undefined, fechaSeleccionada);
                      }}
                      className={`p-3 space-y-2.5 flex-1 min-h-[220px] transition-colors ${
                        fechaSeleccionada >= hoyStr && !esDomingoCerradoIso(fechaSeleccionada)
                          ? 'hover:bg-[#FFF5F7]/45 cursor-pointer'
                          : ''
                      }`}
                      title={fechaSeleccionada >= hoyStr ? `Clic en un espacio vacío para agendar con ${cancha.nombre}` : undefined}
                    >
                      {citasCancha.length === 0 ? (
                        <div className="text-center py-8 text-[#7D6870] space-y-1">
                          <p className="text-xs font-semibold text-[#8C243B]">Sin citas para este día</p>
                          <p className="text-[11px] opacity-70">Turnos libres disponibles</p>
                        </div>
                      ) : (
                        citasCancha.map((cita) => {
                          const horaInicio = obtenerHoraMinutosBogota(cita.fecha_inicio);
                          const horaFin = cita.fecha_fin ? obtenerHoraMinutosBogota(cita.fecha_fin) : '';
                          const esBloqueada = cita.estado === 'bloqueada';
                          const { motivo: motivoBloqueo, por: bloqueadoPor } = obtenerDetalleBloqueo(cita);
                          const nombreClienta = obtenerNombreClienta(cita);
                          const servicioNombre = obtenerServicioCita(cita);
                          const telLimpio = String(cita.clientes?.telefono_wa || '').replace(/\D/g, '');

                          const inicioMs = new Date(cita.fecha_inicio).getTime();
                          const finMs = cita.fecha_fin ? new Date(cita.fecha_fin).getTime() : inicioMs + 45 * 60000;
                          const ahoraMs = ahora.getTime();
                          const esHoy = fechaSeleccionada === hoyStr;
                          const estaEnAtencion = esHoy && !esBloqueada && cita.estado !== 'completada' && cita.estado !== 'cancelada' && ahoraMs >= inicioMs && ahoraMs < finMs;

                          return (
                            <div
                              key={cita.id}
                              onClick={(e) => e.stopPropagation()}
                              onMouseEnter={(e) => abrirPopoverCita(cita, e)}
                              onMouseLeave={cerrarPopoverCita}
                              className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition cursor-pointer hover:shadow-md hover:scale-[1.01] ${
                                esBloqueada
                                  ? 'bg-gradient-to-r from-amber-50 to-orange-50/70 border-amber-300 shadow-2xs'
                                  : estaEnAtencion
                                  ? 'bg-rose-50/90 border-[#8C243B] ring-2 ring-[#8C243B]/20 shadow-[#8C243B]/10'
                                  : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago'
                                  ? 'bg-amber-50/80 border-amber-300 shadow-amber-100/40 text-amber-950'
                                  : cita.estado === 'completada'
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : cita.estado === 'cancelada'
                                  ? 'bg-slate-50 border-slate-200 opacity-60'
                                  : 'bg-white border-[#F2C4D2] shadow-2xs hover:border-[#8C243B]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`font-mono font-bold text-[11px] flex items-center gap-1 ${
                                    esBloqueada ? 'text-amber-900' : 'text-[#8C243B]'
                                  }`}
                                >
                                  {esBloqueada ? (
                                    <IconLock className="w-3 h-3 text-amber-700" />
                                  ) : (
                                    <IconClock className="w-3 h-3 text-[#C74B66]" />
                                  )}
                                  {formatearRangoHoras12(horaInicio, horaFin)}
                                </span>
                                {estaEnAtencion ? (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                    EN ATENCIÓN
                                  </span>
                                ) : (
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                                      esBloqueada
                                        ? 'bg-amber-200/80 text-amber-900 border-amber-300'
                                        : cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago'
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : cita.estado === 'completada'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : cita.estado === 'cancelada'
                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                        : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                                    }`}
                                  >
                                    {esBloqueada ? 'BLOQUEADO' : (cita.estado === 'pendiente_anticipo' || cita.estado === 'pendiente_pago') ? 'ABONO' : esPorConfirmar(cita) ? 'POR CONFIRMAR' : cita.estado.toUpperCase()}
                                  </span>
                                )}
                              </div>

                              <div>
                                <p className={`font-bold text-xs ${esBloqueada ? 'text-amber-950' : 'text-[#2D2529]'}`}>
                                  {esBloqueada ? `🔒 ${motivoBloqueo}` : nombreClienta}
                                </p>
                                <p className="text-[11px] text-[#7D6870] truncate">
                                  {esBloqueada ? `Por: ${bloqueadoPor}` : `💅 ${servicioNombre}`}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-1 border-t border-[#FCE8EF] text-[10px]">
                                <span className="font-mono font-bold text-[#2D2529]">
                                  {esBloqueada ? 'No disponible' : `$${Number(cita.valor_total || 25000).toLocaleString('es-CO')}`}
                                </span>

                                <div className="flex items-center gap-1">
                                  {esBloqueada ? (
                                    <button
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        handleDesbloquearHorario(cita.id, horaInicio);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold transition cursor-pointer active:scale-95"
                                      title="Desbloquear este horario"
                                    >
                                      Desbloquear
                                    </button>
                                  ) : (
                                    <>
                                      {/* Botón WhatsApp */}
                                      {telLimpio && (
                                        <a
                                          href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                                            nombreClienta
                                          )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20hoy.`}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(ev) => ev.stopPropagation()}
                                          className="p-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                                          title="Escribir por WhatsApp"
                                        >
                                          <IconBrandWhatsapp className="w-3.5 h-3.5" />
                                        </a>
                                      )}

                                      {/* Botón Marcar Completada */}
                                      {cita.estado !== 'completada' && cita.estado !== 'cancelada' && (
                                        <button
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            handleCambiarEstado(cita.id, 'completada');
                                          }}
                                          className="p-1 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition cursor-pointer active:scale-95"
                                          title="Marcar como atendida / completada"
                                        >
                                          <IconCheck className="w-3.5 h-3.5" />
                                        </button>
                                      )}

                                      {/* Botón Marcar Cancelada */}
                                      {cita.estado !== 'completada' && cita.estado !== 'cancelada' && (
                                        <button
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            handleCambiarEstado(cita.id, 'cancelada');
                                          }}
                                          className="p-1 rounded-md bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition cursor-pointer active:scale-95"
                                          title="Cancelar cita y liberar el horario inmediatamente"
                                        >
                                          <IconX className="w-3.5 h-3.5" />
                                        </button>
                                      )}

                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Botones Agendar y Bloquear para esta Manicurista */}
                    <div className="p-2 bg-[#FFF5F7] border-t border-[#F2C4D2] flex gap-1.5">
                      <button
                        onClick={() => abrirModalAgendar(cancha.id)}
                        className="flex-1 py-1.5 bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <IconPlus className="w-3.5 h-3.5" />
                        <span>Agendar con {cancha.nombre.split(' ')[0]}</span>
                      </button>
                      <button
                        onClick={() => abrirModalBloquear(cancha.id)}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                        title={`Bloquear horario de ${cancha.nombre}`}
                      >
                        <IconLock className="w-3 h-3 text-amber-700" />
                        <span>Bloquear</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    )}
  </div>
)}

        {/* ==================================================================== */}
        {/* CASO B: VISTA DE LA ADMINISTRADORA - PESTAÑA MÉTRICAS                 */}
        {/* ==================================================================== */}
        {esAdmin && tabAdmin === 'metricas' && (
          <div className="space-y-6">
            {/* PANEL DE CONTROL DE PERÍODO (POR DÍA VS POR MES) */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#F2C4D2] shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center font-bold">
                    <IconChartBar className="w-4 h-4" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#2D2529] font-serif">
                    Rendimiento & Métricas Financieras
                  </h2>
                </div>
                <p className="text-xs text-[#7D6870]">
                  {modoMetricas === 'dia' ? (
                    <>
                      Visualizando balance del día:{' '}
                      <strong className="text-[#8C243B] font-semibold">{fechaLegible}</strong>
                    </>
                  ) : modoMetricas === 'semana' ? (
                    <>
                      Visualizando balance de la semana:{' '}
                      <strong className="text-[#8C243B] font-semibold">{etiquetaSemana}</strong>
                    </>
                  ) : (
                    <>
                      Visualizando balance mensual consolidado de:{' '}
                      <strong className="text-[#8C243B] font-semibold">{nombreMesLegible}</strong>
                    </>
                  )}
                </p>
              </div>

              {/* CONTROLES DE CAMBIO DE MODO Y NAVEGACIÓN */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Switch de modo: Día vs Semana vs Mes */}
                <div className="flex items-center bg-[#FCE8EF] p-1 rounded-2xl border border-[#F2C4D2]">
                  <button
                    onClick={() => setModoMetricas('dia')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs ${
                      modoMetricas === 'dia'
                        ? 'bg-[#8C243B] text-white shadow-xs'
                        : 'text-[#7D6870] hover:text-[#2D2529]'
                    }`}
                  >
                    <IconCalendarEvent className="w-3.5 h-3.5" />
                    <span>Día</span>
                  </button>
                  <button
                    onClick={() => setModoMetricas('semana')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs ${
                      modoMetricas === 'semana'
                        ? 'bg-[#8C243B] text-white shadow-xs'
                        : 'text-[#7D6870] hover:text-[#2D2529]'
                    }`}
                  >
                    <IconCalendarWeek className="w-3.5 h-3.5" />
                    <span>Semana</span>
                  </button>
                  <button
                    onClick={() => setModoMetricas('mes')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs ${
                      modoMetricas === 'mes'
                        ? 'bg-[#8C243B] text-white shadow-xs'
                        : 'text-[#7D6870] hover:text-[#2D2529]'
                    }`}
                  >
                    <IconCalendarMonth className="w-3.5 h-3.5" />
                    <span>Mes</span>
                  </button>
                </div>

                {/* Si está en modo DÍA: Navegación de Días */}
                {modoMetricas === 'dia' && (
                  <div className="flex items-center gap-1 bg-[#FFF5F7] p-1 rounded-2xl border border-[#F2C4D2]">
                    {fechaSeleccionada !== hoyStr && (
                      <button
                        onClick={() => irAFecha(hoyStr)}
                        className="px-2 py-1 rounded-xl text-xs font-semibold bg-white text-[#8C243B] hover:bg-[#FCE8EF] border border-[#F2C4D2] transition cursor-pointer shadow-2xs"
                        title="Volver a la fecha actual"
                      >
                        Ir a Hoy
                      </button>
                    )}
                    <button
                      onClick={() => cambiarDia(-1)}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      title="Día anterior"
                    >
                      <IconChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <button
                      onClick={() => irAFecha(hoyStr)}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[#8C243B] text-white shadow-2xs cursor-pointer min-w-[65px] text-center"
                    >
                      {etiquetaFechaRelativa}
                    </button>
                    <button
                      onClick={() => cambiarDia(1)}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      title="Día siguiente"
                    >
                      <IconChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <SelectorFechaMimate
                      variante="compacto"
                      alignDropdown="right"
                      permitirFechasPasadas={true}
                      hoyStr={hoyStr}
                      value={fechaSeleccionada}
                      onChange={(nuevaFecha) => irAFecha(nuevaFecha)}
                      title="Seleccionar fecha de métricas"
                    />
                  </div>
                )}

                {/* Si está en modo SEMANA: Navegación de Semanas */}
                {modoMetricas === 'semana' && (
                  <div className="flex items-center gap-1 bg-[#FFF5F7] p-1 rounded-2xl border border-[#F2C4D2]">
                    <button
                      onClick={() => cambiarSemana(-1)}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      title="Semana anterior"
                    >
                      <IconChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <button
                      onClick={() => irAFecha(hoyStr)}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[#8C243B] text-white shadow-2xs cursor-pointer min-w-[75px] text-center"
                      title="Semana activa. Clic para volver a la actual"
                    >
                      {diasDeLaSemana.some((d) => d.esHoy)
                        ? 'Esta Semana'
                        : `Semana ${diasDeLaSemana[0]?.diaNum} - ${diasDeLaSemana[6]?.diaNum}`}
                    </button>
                    <button
                      onClick={() => cambiarSemana(1)}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      title="Semana siguiente"
                    >
                      <IconChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <SelectorFechaMimate
                      variante="compacto"
                      alignDropdown="right"
                      permitirFechasPasadas={true}
                      hoyStr={hoyStr}
                      value={fechaSeleccionada}
                      onChange={(nuevaFecha) => irAFecha(nuevaFecha)}
                      title="Seleccionar fecha de la semana"
                    />
                  </div>
                )}

                {/* Si está en modo MES: Navegación de Meses */}
                {modoMetricas === 'mes' && (
                  <div className="flex items-center gap-1 bg-[#FFF5F7] p-1 rounded-2xl border border-[#F2C4D2]">
                    <button
                      onClick={() => cambiarMes(-1)}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      title="Mes anterior"
                    >
                      <IconChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-[#8C243B] text-white shadow-2xs select-none">
                      {nombreMesLegible}
                    </span>
                    <button
                      onClick={() => cambiarMes(1)}
                      className="p-1.5 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                      title="Mes siguiente"
                    >
                      <IconChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                    <SelectorMesMimate
                      value={mesSeleccionado}
                      hoyStr={hoyStr}
                      onChange={(nuevoMes) => setMesSeleccionado(nuevoMes)}
                      title="Seleccionar mes de métricas"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 4 TARJETAS PRINCIPALES DE RESUMEN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">
                  {modoMetricas === 'dia'
                    ? 'Ingresos del Día'
                    : modoMetricas === 'semana'
                    ? 'Ingresos de la Semana'
                    : 'Ingresos del Mes'}
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#8C243B]">
                  ${metricasSpa.ingresosTotales.toLocaleString('es-CO')}
                </p>
                <p className="text-[10px] text-[#7D6870]">
                  Completado: ${metricasSpa.ingresosCompletados.toLocaleString('es-CO')} ({metricasSpa.completadasCount}/{metricasSpa.total} citas)
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">
                  {modoMetricas === 'dia'
                    ? 'Citas Agendadas Hoy'
                    : modoMetricas === 'semana'
                    ? 'Citas de la Semana'
                    : 'Total Citas del Mes'}
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#2D2529]">
                  {metricasSpa.total}
                </p>
                <p className="text-[10px] text-[#7D6870]">
                  {modoMetricas === 'dia'
                    ? `Para el ${fechaLegible}`
                    : modoMetricas === 'semana'
                    ? `Semana: ${etiquetaSemana}`
                    : `En todo ${nombreMesLegible}`}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">
                  Citas Completadas
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-emerald-600">
                  {metricasSpa.completadasCount}
                </p>
                <p className="text-[10px] text-emerald-700">
                  {metricasSpa.total > 0
                    ? `${Math.round((metricasSpa.completadasCount / metricasSpa.total) * 100)}% atendidas con éxito`
                    : 'Sin citas registradas aún'}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">
                  Citas por Atender
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#C74B66]">
                  {metricasSpa.pendientesCount}
                </p>
                <p className="text-[10px] text-[#7D6870]">
                  {metricasSpa.canceladasCount > 0
                    ? `${metricasSpa.canceladasCount} cancelada(s) en el período`
                    : '0 cancelaciones registradas'}
                </p>
              </div>
            </div>

            {/* TABLA 1: Rendimiento por Manicurista */}
            <div className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs overflow-hidden space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                  Rendimiento por Manicurista ({modoMetricas === 'dia' ? 'Día' : modoMetricas === 'semana' ? 'Semana' : 'Mes'})
                </h3>
                <span className="text-[11px] text-[#7D6870]">
                  {modoMetricas === 'dia' ? fechaLegible : modoMetricas === 'semana' ? etiquetaSemana : nombreMesLegible}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FFF5F7] text-[#7D6870] uppercase text-[10px] border-b border-[#F2C4D2]">
                    <tr>
                      <th className="py-2.5 px-3">Especialista</th>
                      <th className="py-2.5 px-3">Citas en el Período</th>
                      <th className="py-2.5 px-3">Completadas</th>
                      <th className="py-2.5 px-3">Recaudo Realizado</th>
                      <th className="py-2.5 px-3">Recaudo Estimado</th>
                      <th className="py-2.5 px-3" title="Porcentaje de citas completadas de esta especialista y su participación sobre el recaudo total del Spa">% Avance / Aporte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FCE8EF]">
                    {metricasSpa.porManicurista.map((m) => {
                      const pctParticipacion =
                        metricasSpa.ingresosTotales > 0
                          ? Math.round((m.ingresos / metricasSpa.ingresosTotales) * 100)
                          : 0;
                      const pctAvance =
                        m.total > 0 ? Math.round((m.completadas / m.total) * 100) : 0;
                      return (
                        <tr key={m.cancha.id} className="hover:bg-[#FFF5F7]/50 transition">
                          <td className="py-3 px-3 font-bold text-[#2D2529] flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center text-[10px]">
                              💅
                            </span>
                            <span>{m.cancha.nombre}</span>
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold">
                            <span>{m.total}</span>
                            {m.pendientes > 0 && (
                              <span className="ml-1.5 text-[10px] font-sans text-[#7D6870]">
                                ({m.pendientes} por atender)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-emerald-600 font-bold">
                            {m.completadas} / {m.total}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                            ${m.ingresosCompletados.toLocaleString('es-CO')}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[#8C243B]">
                            ${m.ingresos.toLocaleString('es-CO')}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                                title="Porcentaje de las citas de esta manicurista que ya fueron completadas"
                              >
                                {pctAvance}% completado
                              </span>
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#8C243B] border border-[#F2C4D2]"
                                title="Participación de esta manicurista en el recaudo estimado total del Spa"
                              >
                                {pctParticipacion}% del total
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-[#FFF5F7] border-t-2 border-[#F2C4D2] font-bold">
                    <tr>
                      <td className="py-3 px-3 text-[#2D2529] font-bold uppercase text-[11px] tracking-wider">
                        Total Equipo ({modoMetricas === 'dia' ? 'Día' : modoMetricas === 'semana' ? 'Semana' : 'Mes'})
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-sm text-[#2D2529]">
                        {metricasSpa.total}
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-sm text-emerald-600">
                        {metricasSpa.completadasCount} / {metricasSpa.total}
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-sm text-emerald-700">
                        ${metricasSpa.ingresosCompletados.toLocaleString('es-CO')}
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-sm text-[#8C243B]">
                        ${metricasSpa.ingresosTotales.toLocaleString('es-CO')}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#8C243B] text-white">
                          {metricasSpa.ingresosTotales > 0 ? '100% del total' : '0%'}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* TABLA 2: Citas por Servicio */}
            <div className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs overflow-hidden space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                  Demanda por Servicio de Uñas ({modoMetricas === 'dia' ? 'Día' : modoMetricas === 'semana' ? 'Semana' : 'Mes'})
                </h3>
                <span className="text-[11px] text-[#7D6870]">
                  {modoMetricas === 'dia' ? fechaLegible : modoMetricas === 'semana' ? etiquetaSemana : nombreMesLegible}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FFF5F7] text-[#7D6870] uppercase text-[10px] border-b border-[#F2C4D2]">
                    <tr>
                      <th className="py-2.5 px-3">Servicio</th>
                      <th className="py-2.5 px-3">Categoría</th>
                      <th className="py-2.5 px-3">Duración</th>
                      <th className="py-2.5 px-3">Precio</th>
                      <th className="py-2.5 px-3">Citas Agendadas</th>
                      <th className="py-2.5 px-3">Total Generado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FCE8EF]">
                    {metricasSpa.porServicio.map((s) => (
                      <tr key={s.servicio.id} className="hover:bg-[#FFF5F7]/50 transition">
                        <td className="py-2.5 px-3 font-bold text-[#2D2529]">{s.servicio.nombre}</td>
                        <td className="py-2.5 px-3 text-[#7D6870] text-[11px]">{s.servicio.categoria}</td>
                        <td className="py-2.5 px-3 text-[#7D6870] font-mono">{s.servicio.duracion} min</td>
                        <td className="py-2.5 px-3 font-mono text-[#7D6870]">
                          ${s.servicio.precio.toLocaleString('es-CO')}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#8C243B]">{s.cantidad}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#2D2529]">
                          ${s.ingresos.toLocaleString('es-CO')}
                        </td>
                      </tr>
                    ))}

                    {/* Fila única para Adicionales (Decorados, cristales, diseño extra) */}
                    <tr className="bg-amber-50/50 hover:bg-amber-100/50 transition font-medium border-t-2 border-dashed border-amber-200">
                      <td className="py-2.5 px-3 font-bold text-amber-950 flex items-center gap-1.5">
                        <span className="text-amber-600">✨</span>
                        <span>Adicionales</span>
                      </td>
                      <td className="py-2.5 px-3 text-amber-900 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                          Complementos
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[#7D6870] font-mono">--</td>
                      <td className="py-2.5 px-3 font-mono text-[#7D6870]">Variable</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#8C243B]">
                        {metricasSpa.adicionalesInfo.cantidad}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#2D2529]">
                        ${metricasSpa.adicionalesInfo.ingresos.toLocaleString('es-CO')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Resumen consolidado al pie de la lista */}
              <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#8C243B]" />
                  <span className="font-bold text-[#2D2529]">
                    Balance Total por Servicios ({modoMetricas === 'dia' ? 'Día' : modoMetricas === 'semana' ? 'Semana' : 'Mes'})
                  </span>
                  <span className="text-[#7D6870] text-[11px]">
                    · {modoMetricas === 'dia' ? fechaLegible : modoMetricas === 'semana' ? etiquetaSemana : nombreMesLegible}
                  </span>
                </div>
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#7D6870] font-medium">Total Citas Agendadas:</span>
                    <span className="font-mono font-black text-[#8C243B] text-sm sm:text-base">
                      {metricasSpa.totalCitasServicios} {metricasSpa.totalCitasServicios === 1 ? 'cita' : 'citas'}
                    </span>
                  </div>
                  <span className="text-[#F2C4D2]">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#7D6870] font-medium">Total Dinero Generado:</span>
                    <span className="font-mono font-black text-[#2D2529] text-sm sm:text-base">
                      ${metricasSpa.totalDineroServicios.toLocaleString('es-CO')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* CASO C: VISTA EXCLUSIVA DE LAS MANICURISTAS (2, 3 O 4)                */}
        {/* ==================================================================== */}
        {!esAdmin && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border border-[#F2C4D2] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#2D2529] font-serif">
                  ¡Hola, {perfilActual.nombre}! 💅
                </h2>
                <p className="text-xs text-[#7D6870]">
                  {vistaAgenda === 'dia'
                    ? `Turnos asignados a tu puesto para el ${fechaLegible}.`
                    : `Planificación semanal de tus turnos del ${etiquetaSemana}.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => abrirModalBloquear(perfilActual.canchaId)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
                  title="Bloquear una o varias horas de mi puesto para descanso o diligencias"
                >
                  <IconLock className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Bloquear Mi Horario</span>
                </button>
                <span className="text-xs font-bold text-[#8C243B] bg-white px-3 py-2 rounded-xl border border-[#F2C4D2] shadow-2xs">
                  {vistaAgenda === 'dia' ? (
                    <>
                      {citasClientesDelDia.filter((r) => r.cancha_id === perfilActual.canchaId).length} citas hoy
                      {bloqueosDelDia.filter((r) => r.cancha_id === perfilActual.canchaId).length > 0 && (
                        <span className="ml-1 text-amber-700 font-semibold">
                          ({bloqueosDelDia.filter((r) => r.cancha_id === perfilActual.canchaId).length} bloq)
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {citasClientesDeLaSemana.filter((r) => r.cancha_id === perfilActual.canchaId).length} citas esta semana
                      {bloqueosDeLaSemana.filter((r) => r.cancha_id === perfilActual.canchaId).length > 0 && (
                        <span className="ml-1 text-amber-700 font-semibold">
                          ({bloqueosDeLaSemana.filter((r) => r.cancha_id === perfilActual.canchaId).length} bloq)
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* VISTA SEGÚN MODO DÍA O SEMANA */}
            {vistaAgenda === 'semana' ? (
              renderVistaSemanal(
                reservasDeLaSemana.filter((r) => r.cancha_id === perfilActual.canchaId && r.estado !== 'cancelada'),
                false,
                perfilActual.canchaId
              )
            ) : (
              <div
                onTouchStart={handleTouchStartDia}
                onTouchEnd={handleTouchEndDia}
                className="touch-pan-y space-y-2 overflow-hidden"
              >
                {/* Indicador táctil para celular */}
                <div className="sm:hidden px-3 py-1 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[10px] text-[#8C243B] font-medium flex items-center justify-center gap-1.5 select-none">
                  <span>↔️</span>
                  <span>Desliza a la izquierda o derecha para cambiar de día</span>
                </div>

                <motion.div
                  key={`esp-dia-${fechaSeleccionada}`}
                  initial={{ x: direccionSlide * 60, opacity: 0.3 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                >
                  {/* TIMELINE DIARIO CRONOLÓGICO DE LA MANICURISTA CON LÍNEA ROJA EN TIEMPO REAL */}
                  {(() => {
                    const misCitas = [...reservasDelDia]
                      .filter((r) => r.cancha_id === perfilActual.canchaId && r.estado !== 'cancelada')
                      .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());

                    return renderTimelineManicurista(
                      misCitas,
                      perfilActual.nombre,
                      perfilActual.canchaId,
                      true
                    );
                  })()}
                </motion.div>
              </div>
            )}

            {/* Aviso de permisos */}
            <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3 text-xs text-[#7D6870] text-center">
              🔒 Tu perfil está configurado para consultar tus citas personales. La administración y agendamiento general es gestionado por la encargada.
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL: AGENDAR CITA CON MENÚS DESPLEGABLES (ADMIN Y MANICURISTAS)     */}
      {/* ==================================================================== */}
      <AgendarCitaModal
        abierto={modalAgendarAbierto}
        onClose={() => setModalAgendarAbierto(false)}
        onSubmit={handleCrearCitaAdmin}
        canchas={canchas}
        servicios={servicios}
        agendarManicuristaId={agendarManicuristaId}
        setAgendarManicuristaId={setAgendarManicuristaId}
        menuManiAbierto={menuManiAbierto}
        setMenuManiAbierto={setMenuManiAbierto}
        manicuristaSeleccionadaForm={manicuristaSeleccionadaForm}
        agendarServicioId={agendarServicioId}
        setAgendarServicioId={setAgendarServicioId}
        menuServicioAbierto={menuServicioAbierto}
        setMenuServicioAbierto={setMenuServicioAbierto}
        servicioSeleccionadoForm={servicioSeleccionadoForm}
        agendarServiciosExtrasIds={agendarServiciosExtrasIds}
        setAgendarServiciosExtrasIds={setAgendarServiciosExtrasIds}
        duracionTotalAdmin={duracionTotalAdmin}
        precioTotalAdmin={precioTotalAdmin}
        agendarFecha={agendarFecha}
        setAgendarFecha={setAgendarFecha}
        agendarHora={agendarHora}
        setAgendarHora={setAgendarHora}
        menuHoraAbierto={menuHoraAbierto}
        setMenuHoraAbierto={setMenuHoraAbierto}
        horasDisponiblesAgendarAdmin={horasDisponiblesAgendarAdmin}
        agendarNombre={agendarNombre}
        setAgendarNombre={setAgendarNombre}
        agendarTelefono={agendarTelefono}
        setAgendarTelefono={setAgendarTelefono}
        errorAgendar={errorAgendar}
        guardandoCita={guardandoCita}
      />

      {/* ==================================================================== */}
      {/* MODAL: BLOQUEAR HORARIO (ADMIN Y MANICURISTAS)                       */}
      {/* ==================================================================== */}
      <BloquearHorarioModal
        abierto={modalBloquearAbierto}
        onClose={() => setModalBloquearAbierto(false)}
        onSubmit={handleCrearBloqueo}
        esAdmin={esAdmin}
        perfilActual={perfilActual}
        canchas={canchas}
        bloquearManicuristaId={bloquearManicuristaId}
        setBloquearManicuristaId={setBloquearManicuristaId}
        menuBloquearManiAbierto={menuBloquearManiAbierto}
        setMenuBloquearManiAbierto={setMenuBloquearManiAbierto}
        bloquearFecha={bloquearFecha}
        setBloquearFecha={setBloquearFecha}
        hoyStr={hoyStr}
        bloquearHorasSeleccionadas={bloquearHorasSeleccionadas}
        setBloquearHorasSeleccionadas={setBloquearHorasSeleccionadas}
        horasOpcionesBloqueoDinamicas={horasOpcionesBloqueoDinamicas}
        horasYaPasadasBloqueo={horasYaPasadasBloqueo}
        horasYaOcupadasBloqueo={horasYaOcupadasBloqueo}
        toggleHoraBloqueo={toggleHoraBloqueo}
        bloquearMotivo={bloquearMotivo}
        setBloquearMotivo={setBloquearMotivo}
        bloquearMotivoPersonalizado={bloquearMotivoPersonalizado}
        setBloquearMotivoPersonalizado={setBloquearMotivoPersonalizado}
        errorBloquear={errorBloquear}
        guardandoBloqueo={guardandoBloqueo}
      />

      {/* ==================================================================== */}
      {/* MODAL CONFIGURACIÓN DE HORARIOS, ANTICIPOS & CUENTAS                  */}
      {/* ==================================================================== */}
      <ConfigAnticipoModal
        abierto={modalConfigAnticipoAbierto}
        onClose={() => setModalConfigAnticipoAbierto(false)}
        configAnticipo={configAnticipo}
        setConfigAnticipo={setConfigAnticipo}
        onSubmit={handleGuardarConfigAnticipo}
        guardando={guardandoConfigAnticipo}
      />

            {/* ==================================================================== */}
      {/* MODAL ELEGANTE: RESTRICCIÓN DE ACCESO AL BOT DE WHATSAPP             */}
      {/* ==================================================================== */}
      <ExclusionesBotModal
        abierto={esAdmin && modalExclusionesAbierto}
        onClose={() => setModalExclusionesAbierto(false)}
        nuevoTelExclusion={nuevoTelExclusion}
        setNuevoTelExclusion={setNuevoTelExclusion}
        nuevoNombreExclusion={nuevoNombreExclusion}
        setNuevoNombreExclusion={setNuevoNombreExclusion}
        errorExclusion={errorExclusion}
        guardandoExclusion={guardandoExclusion}
        handleAgregarExclusion={handleAgregarExclusion}
        busquedaExclusion={busquedaExclusion}
        setBusquedaExclusion={setBusquedaExclusion}
        exclusionesBot={exclusionesBot}
        cargandoExclusiones={cargandoExclusiones}
        solicitarReactivarBot={solicitarReactivarBot}
        exclusionAReactivar={exclusionAReactivar}
        setExclusionAReactivar={setExclusionAReactivar}
        reactivandoBot={reactivandoBot}
        handleConfirmarReactivarBot={handleConfirmarReactivarBot}
      />

      {/* ==================================================================== */}
      {/* MODAL ELEGANTE: CONFIRMAR REACTIVACIÓN DEL BOT (QUITAR RESTRICCIÓN)   */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {exclusionAReactivar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
            >
              {/* Cabecera del Modal con Colores de la App */}
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
                  onClick={() => setExclusionAReactivar(null)}
                  className="p-1.5 rounded-full text-[#7D6870] hover:text-[#2D2529] hover:bg-[#FFF5F7] cursor-pointer transition"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              {/* Tarjeta con los Datos del Número */}
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

              {/* Alerta Informativa */}
              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2.5">
                <IconCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Al reactivar el bot, este número volverá a recibir respuestas automáticas y podrá agendar citas por WhatsApp.
                </span>
              </div>

              {/* Botones Cancelar y Confirmar con Colores de la Marca */}
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


      {/* ============================================================================ */}
      {/* VIEW EMERGENTE (POPOVER FLOTANTE) AL PASAR EL MOUSE POR ENCIMA DE UNA CITA    */}
      {/* ============================================================================ */}
      <div ref={popoverWrapperRef}>
        <DetalleCitaPopover
          popoverCita={popoverCita}
          onMouseEnter={mantenerPopoverCita}
          onMouseLeave={cerrarPopoverCita}
          esAdmin={esAdmin}
          perfilActual={perfilActual}
          canchas={canchas}
          ahora={ahora}
          obtenerHoraMinutosBogota={obtenerHoraMinutosBogota}
          obtenerDuracionMinutosCita={obtenerDuracionMinutosCita}
          obtenerDetalleBloqueo={obtenerDetalleBloqueo}
          obtenerNombreClienta={obtenerNombreClienta}
          obtenerServicioCita={obtenerServicioCita}
          handleDesbloquearHorario={handleDesbloquearHorario}
          handleAprobarAnticipo={handleAprobarAnticipo}
          handleRechazarAnticipo={handleRechazarAnticipo}
          handleCambiarEstado={handleCambiarEstado}
          procesandoAccionAnticipo={procesandoAccionAnticipo}
          onClose={() => setPopoverCita(null)}
          onAbrirModalAdicional={abrirModalAdicional}
          onEliminarAdicional={handleEliminarAdicional}
        />
      </div>

      {/* Modal para Añadir Servicio Adicional (Decorados, etc.) */}
      <ModalAgregarAdicional
        abierto={citaParaAdicional !== null}
        onClose={() => setCitaParaAdicional(null)}
        cita={citaParaAdicional}
        onGuardar={handleGuardarAdicional}
        guardando={guardandoAdicional}
        obtenerNombreClienta={obtenerNombreClienta}
        obtenerServicioCita={obtenerServicioCita}
      />

      {/* Modal de Vinculación y Código QR de WhatsApp */}
      <WhatsAppVinculacionModal
        isOpen={modalWhatsAppAbierto}
        onClose={() => setModalWhatsAppAbierto(false)}
        onStatusChange={(conectado) => setWhatsappConectado(conectado)}
      />

      {/* Indicador Flotante de Deslizamiento (Swipe Táctil en Móvil) */}
      <AnimatePresence>
        {feedbackSwipe && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-[#8C243B] to-[#C74B66] text-white text-xs font-bold px-4 py-2 rounded-full shadow-2xl border border-rose-300 pointer-events-none flex items-center gap-1.5"
          >
            <span>✨</span>
            <span>{feedbackSwipe}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
