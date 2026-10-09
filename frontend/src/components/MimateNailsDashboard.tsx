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
  IconChevronDown,
  IconTrash,
  IconCalendarEvent,
  IconCalendarMonth,
  IconSearch,
} from '@tabler/icons-react';
import { supabase } from '../config/supabase';

interface Cancha {
  id: string;
  nombre: string;
  deporte?: string;
  activa: boolean;
}

interface Reserva {
  id: string;
  cancha_id: string;
  cliente_id?: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'pendiente_pago' | 'confirmada' | 'cancelada' | 'completada' | 'bloqueada';
  valor_total: number;
  valor_anticipo_requerido: number;
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
  pin: string;
  descripcion: string;
  avatar: string;
  colorBadge: string;
  canchaId?: string;
}

const PERFILES_SPA_CONFIG: Omit<StaffProfile, 'canchaId'>[] = [
  {
    id: 'admin-m1',
    canchaNombreMatch: 'Manicurista 1',
    nombre: 'Administradora (Manicurista 1)',
    alias: 'Jenny (Admin & Manicurista 1)',
    rol: 'admin',
    pin: '1234',
    descripcion: 'Acceso Total: Supervisión de todas las tablas, métricas de reservas y agendamiento exclusivo.',
    avatar: '👑',
    colorBadge: 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]',
  },
  {
    id: 'staff-m2',
    canchaNombreMatch: 'Manicurista 2',
    nombre: 'Manicurista 2',
    alias: 'Manicurista 2',
    rol: 'manicurista',
    pin: '1234',
    descripcion: 'Vista personal de turnos del día y gestión de atención de clientas asignadas.',
    avatar: '💅',
    colorBadge: 'bg-[#FFF5F7] text-[#C74B66] border-[#F2C4D2]',
  },
  {
    id: 'staff-m3',
    canchaNombreMatch: 'Manicurista 3',
    nombre: 'Manicurista 3',
    alias: 'Manicurista 3',
    rol: 'manicurista',
    pin: '1234',
    descripcion: 'Vista personal de turnos del día y gestión de atención de clientas asignadas.',
    avatar: '✨',
    colorBadge: 'bg-[#FFF5F7] text-[#C74B66] border-[#F2C4D2]',
  },
  {
    id: 'staff-m4',
    canchaNombreMatch: 'Manicurista 4',
    nombre: 'Manicurista 4',
    alias: 'Manicurista 4',
    rol: 'manicurista',
    pin: '1234',
    descripcion: 'Vista personal de turnos del día y gestión de atención de clientas asignadas.',
    avatar: '🌸',
    colorBadge: 'bg-[#FFF5F7] text-[#C74B66] border-[#F2C4D2]',
  },
];

const HORAS_JORNADA = ['09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];

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

const HORAS_OPCIONES_BLOQUEO: string[] = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:30',
  '11:30',
  '12:30',
  '13:30',
  '14:30',
  '15:30',
  '16:30',
  '17:30',
  '18:00',
  '18:30',
];

const HORAS_TIMELINE: number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const ALTURA_HORA_PX = 88;

function formatearHora12(hora24: number): string {
  if (hora24 === 12) return 'Mediodía';
  const periodo = hora24 < 12 ? 'a.m.' : 'p.m.';
  const h12 = hora24 % 12 === 0 ? 12 : hora24 % 12;
  return `${h12} ${periodo}`;
}

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



// Minutos desde las 8:00 AM en Colombia (0 = 8:00 AM, 60 = 9:00 AM, 90 = 9:30 AM, etc.)
function obtenerMinutosDesde8AMBogota(isoStr: string): number {
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
    return (h - 8) * 60 + m;
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

function calcularPosicionesCitas(citas: Reserva[]): CitaPosicionada[] {
  if (!citas || citas.length === 0) return [];

  const items = citas.map((c) => {
    const minInicio = Math.max(0, obtenerMinutosDesde8AMBogota(c.fecha_inicio));
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
      return g ? JSON.parse(g) : null;
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

  const abrirPopoverCita = (cita: Reserva, e: React.MouseEvent) => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
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

  const cerrarPopoverCita = () => {
    popoverTimeoutRef.current = setTimeout(() => {
      setPopoverCita(null);
    }, 200);
  };

  const mantenerPopoverCita = () => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
  };



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
  const [tabAdmin, setTabAdmin] = useState<'agenda' | 'metricas'>('agenda');
  const [especialistaSeleccionadaId, setEspecialistaSeleccionadaId] = useState<string>('todas');
  // Selector de vista de agenda: Día (diario por horas / 4 columnas) vs Semana (planificador de 7 días)
  const [vistaAgenda, setVistaAgenda] = useState<'dia' | 'semana'>('dia');

  // Estado para la pestaña de Métricas (Por Día vs Por Mes)
  const [modoMetricas, setModoMetricas] = useState<'dia' | 'mes'>('dia');
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(() => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Modal Login PIN
  const [modalPinPerfil, setModalPinPerfil] = useState<StaffProfile | null>(null);
  const [pinIngresado, setPinIngresado] = useState('1234');
  const [errorPin, setErrorPin] = useState<string | null>(null);

  // Modal Agendar Cita (Solo Admin)
  const [modalAgendarAbierto, setModalAgendarAbierto] = useState(false);
  const [agendarManicuristaId, setAgendarManicuristaId] = useState('');
  const [agendarServicioId, setAgendarServicioId] = useState<number>(1);
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

  useEffect(() => {
    if (esAdmin) {
      cargarExclusionesBot();
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

  const handleToggleSilenciarDesdeCita = async (telefono: string, nombre?: string) => {
    const telLimpio = telefono.replace(/\D/g, '');
    const solo10 = telLimpio.startsWith('57') && telLimpio.length === 12 ? telLimpio.slice(2) : telLimpio;
    const yaEstaSilenciado = exclusionesBot.some((e) => {
      const eLimpio = e.telefono.replace(/\D/g, '');
      return eLimpio === telLimpio || eLimpio === solo10 || (eLimpio.startsWith('57') && eLimpio.slice(2) === solo10);
    });

    if (yaEstaSilenciado) {
      solicitarReactivarBot(telLimpio, nombre);
    } else {
      try {
        const res = await fetch('/api/bot/exclusiones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telefono: telLimpio,
            nombre: nombre || 'Restringido desde agenda',
          }),
        });
        if (res.ok) {
          await cargarExclusionesBot();
        }
      } catch (err) {
        console.error('Error restringiendo bot desde cita:', err);
      }
    }
  };

  // Modal de Confirmación Elegante para Eliminar Citas
  const [citaAEliminar, setCitaAEliminar] = useState<{
    id: string;
    nombreClienta: string;
    servicio?: string;
    hora?: string;
    fecha?: string;
    especialista?: string;
  } | null>(null);
  const [eliminandoCita, setEliminandoCita] = useState(false);



  // Objeto de la manicurista actualmente seleccionada en el formulario
  const manicuristaSeleccionadaForm = useMemo(() => {
    return canchas.find((c) => c.id === agendarManicuristaId) || canchas[0];
  }, [canchas, agendarManicuristaId]);

  // Objeto del servicio actualmente seleccionado en el formulario
  const servicioSeleccionadoForm = useMemo(() => {
    return servicios.find((s) => s.id === Number(agendarServicioId)) || servicios[0];
  }, [servicios, agendarServicioId]);

  // Horas libres para el modal de Agendar Cita con cálculo dinámico por duración y fin de citas previas
  const horasDisponiblesAgendarAdmin = useMemo(() => {
    if (!agendarFecha || !agendarManicuristaId) return HORAS_JORNADA;

    const duracionMinutos = servicioSeleccionadoForm?.duracion || 45;
    const horaCierreMs = new Date(`${agendarFecha}T19:00:00-05:00`).getTime();

    // Horas base cada 30 minutos desde las 8:00 hasta las 18:30
    const horasBaseAdmin = [
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
      '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
      '17:00', '17:30', '18:00', '18:30'
    ];

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
          const aperturaMs = new Date(`${agendarFecha}T08:00:00-05:00`).getTime();
          if (finMs >= aperturaMs && finMs < horaCierreMs) {
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

      // Si sobrepasa la hora de cierre del spa, no se puede agendar
      if (slotEndMs > horaCierreMs) {
        continue;
      }

      // Validar si solapa con alguna reserva existente de esta manicurista
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
  }, [reservas, agendarFecha, agendarManicuristaId, servicioSeleccionadoForm?.duracion]);

  // Si cambia la manicurista, el servicio o la fecha en el modal de agendar, ajustar a una hora disponible
  useEffect(() => {
    if (modalAgendarAbierto && horasDisponiblesAgendarAdmin.length > 0) {
      if (!horasDisponiblesAgendarAdmin.includes(agendarHora)) {
        setAgendarHora(horasDisponiblesAgendarAdmin[0]);
      }
    }
  }, [modalAgendarAbierto, agendarFecha, agendarManicuristaId, servicioSeleccionadoForm?.duracion, horasDisponiblesAgendarAdmin]);

  // Horas ya ocupadas o bloqueadas para el modal de Bloquear Horario
  const horasYaOcupadasBloqueo = useMemo(() => {
    if (!bloquearFecha) return new Set<string>();

    const ocupadas = new Set<string>();

    for (const h of HORAS_OPCIONES_BLOQUEO) {
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
  }, [reservas, bloquearFecha, bloquearManicuristaId]);

  // 1. Cargar datos del Spa (Equipo, Servicios)
  const cargarInfoSpa = async () => {
    try {
      const res = await fetch('/api/spa/info');
      if (res.ok) {
        const d = await res.json();
        const idReal = d.complejo?.id || complejoId || '3bd1708c-21de-42a8-a529-d7c91fd41ed2';
        setIdComplejoDetectado(idReal);
        if (d.equipo) setCanchas(d.equipo);
        if (d.servicios) setServicios(d.servicios);
        cargarReservas(idReal);
      }
    } catch (e) {
      console.error('Error cargando info spa:', e);
    }
  };

  // 2. Cargar Reservas del Spa
  const cargarReservas = async (overrideId?: string | unknown) => {
    setCargando(true);
    try {
      const spaId =
        typeof overrideId === 'string' && overrideId
          ? overrideId
          : idComplejoDetectado || complejoId || '3bd1708c-21de-42a8-a529-d7c91fd41ed2';
      const res = await fetch(`/api/reservas?complejo_id=${spaId}`);
      if (res.ok) {
        const data = await res.json();
        setReservas(data || []);
      }
    } catch (e) {
      console.error('Error cargando reservas:', e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarInfoSpa();
    cargarReservas();
  }, [complejoId]);

  // Sincronizar perfiles con IDs de las canchas en la BD
  const perfilesConIds: StaffProfile[] = useMemo(() => {
    return PERFILES_SPA_CONFIG.map((p) => {
      const canchaEncontrada = canchas.find((c) =>
        c.nombre.toLowerCase().includes(p.canchaNombreMatch.toLowerCase())
      );
      return {
        ...p,
        canchaId: canchaEncontrada?.id,
      };
    });
  }, [canchas]);

  // Si el perfil guardado en localStorage no tiene canchaId, rellenarlo
  useEffect(() => {
    if (perfilActual) {
      const match = perfilesConIds.find((p) => p.id === perfilActual.id);
      if (match && match.canchaId && match.canchaId !== perfilActual.canchaId) {
        setPerfilActual(match);
        localStorage.setItem('mimate_staff_profile', JSON.stringify(match));
      }
    }
  }, [perfilesConIds]);

  // Navegar días hacia atrás o adelante
  const cambiarDia = (offset: number) => {
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, d);
    fechaObj.setDate(fechaObj.getDate() + offset);
    const nuevoY = fechaObj.getFullYear();
    const nuevoM = String(fechaObj.getMonth() + 1).padStart(2, '0');
    const nuevoD = String(fechaObj.getDate()).padStart(2, '0');
    setFechaSeleccionada(`${nuevoY}-${nuevoM}-${nuevoD}`);
  };

  // Navegar semanas hacia atrás o adelante (desplaza 7 días)
  const cambiarSemana = (offsetSemanas: number) => {
    const [y, m, d] = fechaSeleccionada.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, d);
    fechaObj.setDate(fechaObj.getDate() + offsetSemanas * 7);
    const nuevoY = fechaObj.getFullYear();
    const nuevoM = String(fechaObj.getMonth() + 1).padStart(2, '0');
    const nuevoD = String(fechaObj.getDate()).padStart(2, '0');
    setFechaSeleccionada(`${nuevoY}-${nuevoM}-${nuevoD}`);
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

  // Manejo de Login con PIN
  const handleIniciarSesion = (perfil: StaffProfile) => {
    setModalPinPerfil(perfil);
    setPinIngresado(perfil.pin || '1234');
    setErrorPin(null);
  };

  const handleConfirmarPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPinPerfil) return;

    if (pinIngresado === modalPinPerfil.pin || pinIngresado === '1234' || pinIngresado === 'admin123') {
      setPerfilActual(modalPinPerfil);
      localStorage.setItem('mimate_staff_profile', JSON.stringify(modalPinPerfil));
      setModalPinPerfil(null);
    } else {
      setErrorPin('PIN incorrecto. El PIN predeterminado es 1234.');
    }
  };

  const handleCerrarSesion = () => {
    setPerfilActual(null);
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

  // Eliminar una cita definitivamente (Abre el Modal Estilizado de la App)
  const handleEliminarCita = (reservaId: string, nombreClienta: string) => {
    const cita = reservas.find((r) => r.id === reservaId);
    const servicioNombre = cita ? obtenerServicioCita(cita) : 'Servicio de Spa';
    const horaInicio = cita ? obtenerHoraMinutosBogota(cita.fecha_inicio) : '';
    const horaFin = cita?.fecha_fin ? obtenerHoraMinutosBogota(cita.fecha_fin) : '';
    const canchaCita = cita ? canchas.find((c) => c.id === cita.cancha_id) : undefined;

    setCitaAEliminar({
      id: reservaId,
      nombreClienta,
      servicio: servicioNombre,
      hora: horaInicio ? `${horaInicio}${horaFin ? ` - ${horaFin}` : ''}` : undefined,
      fecha: cita?.fecha_inicio
        ? new Date(cita.fecha_inicio).toLocaleDateString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
        : fechaLegible,
      especialista: canchaCita?.nombre || 'JL Mímate Nails',
    });
  };

  // Confirmar y procesar la eliminación definitiva
  const handleConfirmarEliminarCita = async () => {
    if (!citaAEliminar) return;
    setEliminandoCita(true);
    try {
      const res = await fetch(`/api/reservas/${citaAEliminar.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReservas((prev) => prev.filter((r) => r.id !== citaAEliminar.id));
        setCitaAEliminar(null);
        setPopoverCita(null);
      } else {
        alert('No se pudo eliminar la cita en el servidor.');
      }
    } catch (e) {
      console.error('Error eliminando cita:', e);
      alert('Error de conexión al eliminar la cita.');
    } finally {
      setEliminandoCita(false);
    }
  };

  // Abrir modal de Agendar Cita con una manicurista preseleccionada
  const abrirModalAgendar = (manicuristaId?: string, horaInicial?: string, fechaInicial?: string) => {
    setAgendarManicuristaId(manicuristaId || canchas[0]?.id || '');
    setAgendarFecha(fechaInicial || fechaSeleccionada);
    setAgendarHora(horaInicial || '09:30');
    setAgendarNombre('');
    setAgendarTelefono('');
    setErrorAgendar(null);
    setMenuManiAbierto(false);
    setMenuServicioAbierto(false);
    setMenuHoraAbierto(false);
    setModalAgendarAbierto(true);
  };

  // Enviar formulario de Agendar Cita (Solo Admin)
  const handleCrearCitaAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agendarNombre.trim() || !agendarTelefono.trim()) {
      setErrorAgendar('Por favor ingresa nombre y teléfono de la clienta.');
      return;
    }

    setGuardandoCita(true);
    setErrorAgendar(null);

    const servicioObj = servicios.find((s) => s.id === Number(agendarServicioId)) || servicios[0];

    try {
      const res = await fetch('/api/spa/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicio_nombre: servicioObj?.nombre || 'Manicura tradicional',
          precio: servicioObj?.precio || 25000,
          duracion_minutos: servicioObj?.duracion || 45,
          fecha: agendarFecha,
          hora: agendarHora,
          cancha_id: agendarManicuristaId || undefined,
          cliente_nombre: agendarNombre.trim(),
          cliente_telefono: agendarTelefono.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setModalAgendarAbierto(false);
        cargarReservas();
      } else {
        setErrorAgendar(data.error || 'No se pudo agendar la cita. Verifica el horario.');
      }
    } catch (err: any) {
      setErrorAgendar('Error de conexión al agendar cita: ' + err.message);
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
    setBloquearFecha(fechaInicial || fechaSeleccionada);
    if (horaInicial) {
      setBloquearHorasSeleccionadas([horaInicial]);
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
        const registros: any[] = [];
        for (const h of bloquearHorasSeleccionadas) {
          const dInicio = new Date(`${bloquearFecha}T${h}:00-05:00`);
          const dFin = new Date(dInicio.getTime() + 60 * 60 * 1000);
          for (const cid of targetCanchasIds) {
            registros.push({
              cancha_id: cid,
              cliente_id: null,
              fecha_inicio: dInicio.toISOString(),
              fecha_fin: dFin.toISOString(),
              estado: 'bloqueada',
              valor_total: 0,
              valor_anticipo_requerido: 0,
              notas: `🔒 BLOQUEO: ${motivoFinal} | Hora: ${h} | Por: ${autor}`,
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

  // Desbloquear un horario
  const handleDesbloquearHorario = async (reservaId: string, horaDetalle: string) => {
    if (
      !window.confirm(
        `¿Deseas desbloquear el horario de las ${horaDetalle}? Quedará libre nuevamente para reservas.`
      )
    ) {
      return;
    }

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
      alert('No se pudo desbloquear el horario: ' + (e.message || 'Error de conexión'));
    }
  };

  // Filtrado de reservas por fecha seleccionada
  const reservasDelDia = useMemo(() => {
    return reservas.filter((r) => {
      if (!r.fecha_inicio) return false;
      const fechaCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
        timeZone: 'America/Bogota',
      });
      return fechaCita === fechaSeleccionada;
    });
  }, [reservas, fechaSeleccionada]);

  // Citas reales vs Bloqueos del día
  const citasClientesDelDia = useMemo(() => {
    return reservasDelDia.filter((r) => r.estado !== 'bloqueada' && r.estado !== 'cancelada');
  }, [reservasDelDia]);

  const bloqueosDelDia = useMemo(() => {
    return reservasDelDia.filter((r) => r.estado === 'bloqueada');
  }, [reservasDelDia]);

  // Reservas de toda la semana activa
  const reservasDeLaSemana = useMemo(() => {
    if (diasDeLaSemana.length === 0) return [];
    const fechasSet = new Set(diasDeLaSemana.map((d) => d.fechaIso));
    return reservas.filter((r) => {
      if (!r.fecha_inicio) return false;
      const fechaCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
        timeZone: 'America/Bogota',
      });
      return fechasSet.has(fechaCita);
    });
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
      } else {
        return fechaCita.startsWith(mesSeleccionado);
      }
    });
  }, [reservas, modoMetricas, fechaSeleccionada, mesSeleccionado]);

  // Métricas financieras calculadas para la Admin según el período seleccionado
  const metricasSpa = useMemo(() => {
    const lista = reservasFiltradasMetricas;
    const total = lista.length;
    const confirmadas = lista.filter((r) => r.estado === 'confirmada' || r.estado === 'completada');
    const completadas = lista.filter((r) => r.estado === 'completada');
    const canceladas = lista.filter((r) => r.estado === 'cancelada');
    const pendientes = lista.filter((r) => r.estado === 'pendiente_pago' || r.estado === 'confirmada');

    const ingresosTotales = confirmadas.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);

    // Desglose por manicurista en este período
    const porManicurista = canchas.map((c) => {
      const citasMani = lista.filter((r) => r.cancha_id === c.id);
      const confirmadasMani = citasMani.filter((r) => r.estado === 'confirmada' || r.estado === 'completada');
      const completadasMani = citasMani.filter((r) => r.estado === 'completada');
      const recaudado = confirmadasMani.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);
      return {
        cancha: c,
        total: citasMani.length,
        completadas: completadasMani.length,
        ingresos: recaudado,
      };
    });

    // Desglose por servicio en este período
    const porServicio = servicios.map((s) => {
      const citasSvc = lista.filter((r) => (r.notas || '').includes(s.nombre));
      const ingresosSvc = citasSvc
        .filter((r) => r.estado !== 'cancelada')
        .reduce((sum, r) => sum + Number(r.valor_total || s.precio), 0);
      return {
        servicio: s,
        cantidad: citasSvc.length,
        ingresos: ingresosSvc,
      };
    }).sort((a, b) => b.cantidad - a.cantidad);

    return {
      total,
      confirmadasCount: confirmadas.length,
      completadasCount: completadas.length,
      canceladasCount: canceladas.length,
      pendientesCount: pendientes.length,
      ingresosTotales,
      porManicurista,
      porServicio,
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
                      <div className="w-10 h-10 rounded-xl bg-[#FCE8EF] border border-[#F2C4D2] flex items-center justify-center text-xl">
                        {p.avatar}
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
                    <span className="text-[10px] text-[#7D6870] opacity-75">PIN: {p.pin}</span>
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
                    <span className="text-2xl">{modalPinPerfil.avatar}</span>
                    <div>
                      <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                        {modalPinPerfil.nombre}
                      </h3>
                      <p className="text-[11px] text-[#7D6870]">Ingresa tu clave de acceso</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setModalPinPerfil(null)}
                    className="p-1 rounded-full text-[#7D6870] hover:text-[#2D2529] cursor-pointer"
                  >
                    <IconX className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleConfirmarPin} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-[#7D6870] block mb-1">
                      PIN de Acceso (Predeterminado: 1234)
                    </label>
                    <div className="relative">
                      <IconLock className="w-4 h-4 text-[#C74B66] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={pinIngresado}
                        onChange={(e) => setPinIngresado(e.target.value)}
                        placeholder="1234"
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
                      onClick={() => setModalPinPerfil(null)}
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
    const estaEnHorario = horaActualNum >= 8 && horaActualNum < 20;
    const minutosDesde8AM = (horaActualNum - 8) * 60 + minutosActuales;
    const posicionYLinea = (minutosDesde8AM / 60) * ALTURA_HORA_PX;
    const horaMinutosActualStr = ahora.toLocaleTimeString('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });

    const ALTURA_TOTAL_TIMELINE = HORAS_TIMELINE.length * ALTURA_HORA_PX;
    const citasPosicionadas = calcularPosicionesCitas(citasManicurista);
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
                {fechaTextoTimeline} · <strong className="text-[#8C243B]">{citasManicurista.length} citas</strong> agendadas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#7D6870] hidden sm:inline">
              Horario: 8:00 a.m. a 7:00 p.m.
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
        <div className="relative p-4 sm:p-6 overflow-x-auto">
          <div className="min-w-[650px] relative">
            <div className="flex relative" style={{ height: `${ALTURA_TOTAL_TIMELINE}px` }}>
              {/* Columna de Horas a la izquierda (8 a 19) */}
              <div className="w-16 sm:w-24 pr-3 flex-shrink-0 relative select-none">
                {HORAS_TIMELINE.map((h, index) => (
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
              <div className="flex-1 relative border-l border-[#F2C4D2]/60">
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

                {/* Filas de fondo con guías horarias completas y de media hora */}
                <div className="absolute inset-0 flex flex-col pointer-events-none">
                  {HORAS_TIMELINE.map((h) => {
                    const hStr = `${String(h).padStart(2, '0')}:00`;
                    return (
                      <div
                        key={h}
                        className="relative group transition border-b border-[#F2C4D2]/60 hover:bg-[#FFF5F7]/30"
                        style={{ height: `${ALTURA_HORA_PX}px` }}
                      >
                        <div className="absolute left-0 right-0 top-1/2 border-b border-dashed border-[#F2C4D2]/35 pointer-events-none" />

                        {/* Botones de acción rápida al pasar el cursor */}
                        <div className="absolute right-3 top-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition z-10 pointer-events-auto">
                          {canchaId && (
                            <button
                              onClick={() => abrirModalBloquear(canchaId, hStr, fechaActualTimeline)}
                              className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold hover:bg-amber-100 cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1"
                              title="Bloquear este horario"
                            >
                              <IconLock className="w-3 h-3 text-amber-700" />
                              <span>Bloquear</span>
                            </button>
                          )}
                          {puedeAgendar && (
                            <button
                              onClick={() => abrirModalAgendar(canchaId || undefined, hStr, fechaActualTimeline)}
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

                    const leftPercent = (colIndex / totalCols) * 100;
                    const widthPercent = (1 / totalCols) * 100;

                    return (
                      <div
                        key={cita.id}
                        onMouseEnter={(e) => abrirPopoverCita(cita, e)}
                        onMouseLeave={cerrarPopoverCita}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: `calc(${leftPercent}% + 4px)`,
                          width: `calc(${widthPercent}% - 8px)`,
                        }}
                        className={`absolute z-20 pointer-events-auto rounded-2xl border transition-all shadow-xs hover:shadow-md flex flex-col justify-between overflow-hidden p-2.5 sm:p-3 cursor-pointer ${
                          esBloqueada
                            ? 'bg-gradient-to-r from-amber-50 to-orange-50/80 border-amber-300 shadow-amber-100/50'
                            : estaEnAtencion
                            ? 'bg-rose-50/90 border-[#8C243B] ring-2 ring-[#8C243B]/20 shadow-[#8C243B]/10'
                            : cita.estado === 'completada'
                            ? 'bg-emerald-50/80 border-emerald-300'
                            : cita.estado === 'cancelada'
                            ? 'bg-slate-50 border-slate-200 opacity-60'
                            : 'bg-white border-[#F2C4D2] hover:border-[#8C243B]'
                        }`}
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
                              <span>{horaInicio}{horaFin ? ` - ${horaFin}` : ''}</span>
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
                                  {cita.estado.toUpperCase()}
                                </span>

                                {telLimpio && (
                                  <a
                                    href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                                      nombreClienta
                                    )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20las%20${horaInicio}.`}
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
                                )}

                                {esAdmin && (
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleEliminarCita(cita.id, nombreClienta);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition shadow-2xs cursor-pointer active:scale-95"
                                    title="Eliminar cita definitivamente"
                                  >
                                    <IconTrash className="w-3 h-3" />
                                    <span className="hidden sm:inline">Eliminar</span>
                                  </button>
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
    const estaEnHorario = horaActualNum >= 8 && horaActualNum < 20;
    const minutosDesde8AM = (horaActualNum - 8) * 60 + minutosActuales;
    const posicionYLinea = (minutosDesde8AM / 60) * ALTURA_HORA_PX;
    const horaMinutosActualStr = ahora.toLocaleTimeString('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    const esSemanaActual = diasDeLaSemana.some((d) => d.esHoy);
    const ALTURA_TOTAL_TIMELINE = HORAS_TIMELINE.length * ALTURA_HORA_PX;
    const ahoraMs = ahora.getTime();

    return (
      <div className="bg-white rounded-3xl border border-[#F2C4D2] shadow-xs overflow-hidden">
        {/* Cabecera del Timeline Semanal */}
        <div className="p-4 bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border-b border-[#F2C4D2] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#F2C4D2] flex items-center justify-center font-bold text-base text-[#8C243B] shadow-2xs">
              {icono}
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[#2D2529] font-serif">
                {nombreTarget}
              </h3>
              <p className="text-xs text-[#7D6870]">
                {etiquetaSemana} · <strong className="text-[#8C243B]">{citasFiltradas.length} citas</strong> agendadas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#7D6870] hidden sm:inline">
              Horario: 8:00 a.m. a 7:00 p.m.
            </span>
            {esSemanaActual && estaEnHorario && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Ahora: {horaMinutosActualStr}
              </span>
            )}
          </div>
        </div>

        {/* Grilla Semanal dividida en 7 días y con horas de 8 a 19 */}
        <div className="relative p-4 sm:p-6 overflow-x-auto">
          <div className="min-w-[1050px]">
            {/* ENCABEZADOS DE LOS 7 DÍAS */}
            <div className="flex border-b border-[#F2C4D2] pb-3 mb-1">
              <div className="w-16 sm:w-24 pr-3 flex-shrink-0 text-right select-none">
                <span className="text-[11px] font-extrabold text-[#8C243B] uppercase tracking-wider">
                  HORA
                </span>
              </div>

              <div className="flex-1 grid grid-cols-7 divide-x divide-[#F2C4D2]/60">
                {diasDeLaSemana.map((d) => {
                  const citasDelDia = citasFiltradas.filter((r) => {
                    if (!r.fecha_inicio) return false;
                    const fCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
                      timeZone: 'America/Bogota',
                    });
                    return fCita === d.fechaIso && r.estado !== 'cancelada' && r.estado !== 'bloqueada';
                  });

                  return (
                    <div
                      key={d.fechaIso}
                      className={`px-1.5 py-1 text-center transition-colors rounded-xl mx-0.5 ${
                        d.esHoy ? 'bg-[#FFF5F7] ring-1 ring-[#8C243B]/25' : ''
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

            {/* CUERPO DEL TIMELINE CONTINUO POR COLUMNAS DE DÍAS (LUNES A DOMINGO) */}
            <div className="flex relative" style={{ height: `${ALTURA_TOTAL_TIMELINE}px` }}>
              {/* Columna de Horas a la izquierda */}
              <div className="w-16 sm:w-24 pr-3 flex-shrink-0 relative select-none">
                {HORAS_TIMELINE.map((h, index) => (
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
              <div className="flex-1 grid grid-cols-7 divide-x divide-[#F2C4D2]/60 relative border-l border-[#F2C4D2]/60">
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
                {diasDeLaSemana.map((d) => {
                  const citasDelDia = citasFiltradas.filter((r) => {
                    if (!r.fecha_inicio) return false;
                    const fCita = new Date(r.fecha_inicio).toLocaleDateString('en-CA', {
                      timeZone: 'America/Bogota',
                    });
                    return fCita === d.fechaIso && r.estado !== 'cancelada';
                  });

                  const posicionesDia = calcularPosicionesCitas(citasDelDia);

                  return (
                    <div
                      key={d.fechaIso}
                      className={`relative h-full ${d.esHoy ? 'bg-rose-50/10' : ''}`}
                    >
                      {/* Filas de fondo con guías horarias completas y de media hora */}
                      <div className="absolute inset-0 flex flex-col pointer-events-none">
                        {HORAS_TIMELINE.map((h) => (
                          <div
                            key={h}
                            className="relative border-b border-[#F2C4D2]/60"
                            style={{ height: `${ALTURA_HORA_PX}px` }}
                          >
                            <div className="absolute left-0 right-0 top-1/2 border-b border-dashed border-[#F2C4D2]/35" />
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

                          const leftPercent = (colIndex / totalCols) * 100;
                          const widthPercent = (1 / totalCols) * 100;

                          // Asegurar una altura visual mínima de 44px para evitar recortes
                          const alturaReal = Math.max(44, height);

                          return (
                            <div
                              key={cita.id}
                              onMouseEnter={(e) => abrirPopoverCita(cita, e)}
                              onMouseLeave={cerrarPopoverCita}
                              style={{
                                top: `${top}px`,
                                height: `${alturaReal}px`,
                                left: `calc(${leftPercent}% + 2px)`,
                                width: `calc(${widthPercent}% - 4px)`,
                              }}
                              className={`absolute z-20 pointer-events-auto rounded-xl border text-xs p-1.5 transition-all shadow-2xs hover:shadow-lg hover:scale-[1.02] hover:z-30 flex flex-col justify-between overflow-hidden cursor-pointer ${
                                esBloqueada
                                  ? 'bg-gradient-to-r from-amber-50 to-orange-50/80 border-amber-300 text-amber-900 shadow-amber-100/50'
                                  : estaEnAtencion
                                  ? 'bg-rose-50/90 border-[#8C243B] ring-2 ring-[#8C243B]/20 text-[#8C243B]'
                                  : cita.estado === 'completada'
                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                                  : cita.estado === 'cancelada'
                                  ? 'bg-slate-50 border-slate-200 opacity-60 text-slate-700'
                                  : 'bg-white border-[#F2C4D2] hover:border-[#8C243B] text-[#2D2529]'
                              }`}
                              title="Pasa el mouse para ver todos los detalles de esta cita"
                            >
                              {/* Fila 1: Hora exacta y Estado */}
                              <div className="flex items-center justify-between gap-1 leading-none">
                                <div className="font-mono font-bold text-[9px] truncate flex items-center gap-0.5">
                                  {esBloqueada ? (
                                    <IconLock className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                  ) : (
                                    <IconClock className="w-2.5 h-2.5 text-[#C74B66] shrink-0" />
                                  )}
                                  <span>{horaInicio}{horaFin ? `-${horaFin}` : ''}</span>
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
                                        : cita.estado === 'completada'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : cita.estado === 'cancelada'
                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                        : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                                    }`}
                                  >
                                    {esBloqueada ? 'BLOQ' : cita.estado === 'completada' ? 'LISTA' : 'CONF'}
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
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };


  // ============================================================================
  // VISTA 2: DASHBOARD PRINCIPAL (ADMIN O MANICURISTA)
  // ============================================================================
  return (
    <div className="min-h-screen bg-[#FFF5F7] text-[#2D2529] flex flex-col font-sans">
      {/* BARRA SUPERIOR ELEGANTE */}
      <header className="bg-white/95 backdrop-blur-md sticky top-0 z-40 border-b border-[#F2C4D2] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo y Nombre del Negocio */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FFF5F7] p-1 border border-[#F2C4D2] overflow-hidden shrink-0 flex items-center justify-center">
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
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm sm:text-base text-[#2D2529] font-serif leading-none">
                  JL Mímate Nails
                </h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${perfilActual.colorBadge}`}>
                  {perfilActual.avatar} {esAdmin ? 'Administradora' : perfilActual.nombre}
                </span>
              </div>
              <p className="text-[11px] text-[#7D6870] mt-0.5 hidden sm:block">
                Pereira, Cuba · Panel de Control de Turnos
              </p>
            </div>
          </div>

          {/* Navegación Admin (Pestañas Agenda / Métricas) */}
          {esAdmin && (
            <div className="flex items-center bg-[#FCE8EF] p-1 rounded-xl border border-[#F2C4D2]">
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
          )}

          {/* Botones de Acción */}
          <div className="flex items-center gap-2">
            {/* Botón Bloquear Horario (Disponible para Administradora y Manicuristas) */}
            <button
              onClick={() => abrirModalBloquear()}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
              title="Bloquear una o varias horas para que las clientas no puedan reservar"
            >
              <IconLock className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">
                {esAdmin ? 'Bloquear Horario' : 'Bloquear Mi Horario'}
              </span>
              <span className="sm:hidden">Bloquear</span>
            </button>

            {/* Botón Exclusivo para la Admin: Agendar Cita */}
            {esAdmin && (
              <button
                onClick={() => abrirModalAgendar()}
                className="flex items-center gap-1 px-3.5 py-2 bg-gradient-to-r from-[#8C243B] to-[#C74B66] hover:from-[#731D30] hover:to-[#B03C54] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
              >
                <IconPlus className="w-4 h-4 stroke-[3]" />
                <span className="hidden sm:inline">Agendar Cita</span>
                <span className="sm:hidden">Agendar</span>
              </button>
            )}

            {/* Botón Exclusivo para la Admin: Clientes con Bot Silenciado (Atención Humana) */}
            {esAdmin && (
              <button
                onClick={abrirModalExclusiones}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
                title="Gestionar clientes con bot silenciado para atención humana personalizada"
              >
                <IconLock className="w-3.5 h-3.5 text-[#8C243B]" />
                <span className="hidden sm:inline">Bot Restringido</span>
                <span className="sm:hidden">Restringidos</span>
                {exclusionesBot.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-[#8C243B] text-white text-[10px] font-mono font-bold">
                    {exclusionesBot.length}
                  </span>
                )}
              </button>
            )}

            {/* Recargar datos */}
            <button
              onClick={() => cargarReservas()}
              disabled={cargando}
              className="p-2 rounded-xl border border-[#F2C4D2] hover:bg-[#FCE8EF] text-[#7D6870] hover:text-[#8C243B] transition cursor-pointer"
              title="Actualizar datos"
            >
              <IconRefresh className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            </button>

            {/* Ver Web Pública */}
            <button
              onClick={onIrAWebReservas}
              className="p-2 rounded-xl border border-[#F2C4D2] hover:bg-[#FCE8EF] text-[#7D6870] hover:text-[#8C243B] transition cursor-pointer"
              title="Ver página de reservas de clientas"
            >
              <IconExternalLink className="w-4 h-4" />
            </button>

            {/* Cerrar Sesión */}
            <button
              onClick={handleCerrarSesion}
              className="flex items-center gap-1 p-2 sm:px-2.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#7D6870] text-xs font-semibold transition cursor-pointer"
              title="Cambiar de perfil / Cerrar sesión"
            >
              <IconLogout className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
        
        {/* BARRA DE FECHA CON FLECHAS DÍA ANTERIOR / SIGUIENTE (Solo en vista de agenda) */}
        {(!esAdmin || tabAdmin === 'agenda') && (
          <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center shrink-0">
                <IconClock className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#2D2529]">
                  {esAdmin
                    ? 'Agenda General del Spa'
                    : `Mi Agenda Personal (${perfilActual.nombre})`}
                </p>
                <p className="text-[11px] text-[#7D6870]">
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
            <div className="flex flex-wrap items-center gap-2.5">
              {/* SELECTOR DE VISTA: DÍA VS SEMANA */}
              <div className="flex items-center bg-[#FCE8EF] p-1 rounded-2xl border border-[#F2C4D2]">
                <button
                  onClick={() => setVistaAgenda('dia')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs ${
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs ${
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
                <div className="flex items-center gap-1.5 bg-[#FFF5F7] p-1.5 rounded-2xl border border-[#F2C4D2]">
                  {/* ACCESO RÁPIDO: Volver a Hoy a la izquierda */}
                  {fechaSeleccionada !== hoyStr && (
                    <button
                      onClick={() => setFechaSeleccionada(hoyStr)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white text-[#8C243B] hover:bg-[#FCE8EF] border border-[#F2C4D2] transition cursor-pointer shadow-2xs animate-in fade-in"
                      title="Volver a la fecha actual"
                    >
                      Ir a Hoy
                    </button>
                  )}

                  <button
                    onClick={() => cambiarDia(-1)}
                    className="p-2 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Día anterior"
                  >
                    <IconChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  {/* BOTÓN/ETIQUETA DINÁMICA: Hoy, Mañana, Ayer o Sáb, 10 oct */}
                  <button
                    onClick={() => setFechaSeleccionada(hoyStr)}
                    title={fechaSeleccionada === hoyStr ? 'Estás en el día de hoy' : 'Clic para volver al día de hoy'}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs bg-[#8C243B] text-white min-w-[70px] text-center hover:opacity-95 active:scale-95"
                  >
                    {etiquetaFechaRelativa}
                  </button>

                  <button
                    onClick={() => cambiarDia(1)}
                    className="p-2 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Día siguiente"
                  >
                    <IconChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <div className="relative pl-1">
                    <input
                      type="date"
                      value={fechaSeleccionada}
                      onChange={(e) => setFechaSeleccionada(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-[#F2C4D2] rounded-xl text-xs font-bold text-[#2D2529] outline-none cursor-pointer hover:border-[#8C243B] transition shadow-2xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-[#FFF5F7] p-1.5 rounded-2xl border border-[#F2C4D2]">
                  {/* ACCESO RÁPIDO: Volver a la Semana Actual */}
                  {!diasDeLaSemana.some((d) => d.esHoy) && (
                    <button
                      onClick={() => setFechaSeleccionada(hoyStr)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white text-[#8C243B] hover:bg-[#FCE8EF] border border-[#F2C4D2] transition cursor-pointer shadow-2xs animate-in fade-in"
                      title="Volver a la semana actual"
                    >
                      Esta Semana
                    </button>
                  )}

                  <button
                    onClick={() => cambiarSemana(-1)}
                    className="p-2 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Semana anterior"
                  >
                    <IconChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <button
                    onClick={() => setFechaSeleccionada(hoyStr)}
                    title="Semana activa. Clic para volver a la actual"
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs bg-[#8C243B] text-white min-w-[100px] text-center hover:opacity-95 active:scale-95"
                  >
                    {diasDeLaSemana.some((d) => d.esHoy)
                      ? 'Semana Actual'
                      : `Semana ${diasDeLaSemana[0]?.diaNum} - ${diasDeLaSemana[6]?.diaNum}`}
                  </button>

                  <button
                    onClick={() => cambiarSemana(1)}
                    className="p-2 rounded-xl bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] transition cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                    title="Semana siguiente"
                  >
                    <IconChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  <div className="relative pl-1">
                    <input
                      type="date"
                      value={fechaSeleccionada}
                      onChange={(e) => setFechaSeleccionada(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-[#F2C4D2] rounded-xl text-xs font-bold text-[#2D2529] outline-none cursor-pointer hover:border-[#8C243B] transition shadow-2xs"
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
                Horario: 8:00 a.m. a 7:00 p.m.
              </span>
            </div>

            {/* SELECTOR DE VISTA EN ADMINISTRADORA: 4 Columnas vs Timeline por Especialista */}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <button
                onClick={() => setEspecialistaSeleccionadaId('todas')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1.5 ${
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

              {canchas.map((cancha, i) => {
                const totalCitas =
                  vistaAgenda === 'dia'
                    ? reservasDelDia.filter((r) => r.cancha_id === cancha.id && r.estado !== 'cancelada').length
                    : citasClientesDeLaSemana.filter((r) => r.cancha_id === cancha.id).length;

                return (
                  <button
                    key={cancha.id}
                    onClick={() => setEspecialistaSeleccionadaId(cancha.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                      especialistaSeleccionadaId === cancha.id
                        ? 'bg-[#8C243B] text-white shadow-xs'
                        : 'bg-white text-[#7D6870] hover:text-[#2D2529] border border-[#F2C4D2]'
                    }`}
                  >
                    <span>{i === 0 ? '👑' : '💅'} {cancha.nombre}</span>
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
                  ? reservasDeLaSemana
                  : reservasDeLaSemana.filter((r) => r.cancha_id === especialistaSeleccionadaId),
                true,
                especialistaSeleccionadaId
              )
            ) : especialistaSeleccionadaId !== 'todas' ? (
              (() => {
                const targetCancha = canchas.find((c) => c.id === especialistaSeleccionadaId);
                const citasTarget = reservasDelDia.filter((r) => r.cancha_id === especialistaSeleccionadaId);
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
              {canchas.map((cancha, idx) => {
                const citasCancha = reservasDelDia.filter((r) => r.cancha_id === cancha.id);
                const esColumnaAdmin = idx === 0;

                return (
                  <div
                    key={cancha.id}
                    className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs flex flex-col justify-between overflow-hidden"
                  >
                    {/* Encabezado de la Manicurista */}
                    <div className="p-3.5 bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border-b border-[#F2C4D2] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white border border-[#F2C4D2] flex items-center justify-center font-bold text-xs text-[#8C243B]">
                          {esColumnaAdmin ? '👑' : `M${idx + 1}`}
                        </div>
                        <div>
                          <h3 className="font-bold text-xs text-[#2D2529] font-serif">
                            {cancha.nombre}
                          </h3>
                          <span className="text-[10px] text-[#7D6870]">
                            {esColumnaAdmin ? 'Admin & Manicurista' : 'Especialista'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#8C243B] border border-[#F2C4D2]">
                        {citasCancha.length} citas
                      </span>
                    </div>

                    {/* Lista de Citas Asignadas a esta Manicurista */}
                    <div className="p-3 space-y-2.5 flex-1 min-h-[220px]">
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
                              onMouseEnter={(e) => abrirPopoverCita(cita, e)}
                              onMouseLeave={cerrarPopoverCita}
                              className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition cursor-pointer hover:shadow-md hover:scale-[1.01] ${
                                esBloqueada
                                  ? 'bg-gradient-to-r from-amber-50 to-orange-50/70 border-amber-300 shadow-2xs'
                                  : estaEnAtencion
                                  ? 'bg-rose-50/90 border-[#8C243B] ring-2 ring-[#8C243B]/20 shadow-[#8C243B]/10'
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
                                  {horaInicio}{horaFin ? ` - ${horaFin}` : ''}
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

                                      {/* Botón Eliminar Cita (Admin) */}
                                      {esAdmin && (
                                        <button
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            handleEliminarCita(cita.id, nombreClienta);
                                          }}
                                          className="p-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100 transition cursor-pointer active:scale-95"
                                          title="Eliminar cita definitivamente"
                                        >
                                          <IconTrash className="w-3.5 h-3.5" />
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
                {/* Switch de modo: Día vs Mes */}
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
                    <span>Métricas por Día</span>
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
                    <span>Métricas por Mes</span>
                  </button>
                </div>

                {/* Si está en modo DÍA: Navegación de Días */}
                {modoMetricas === 'dia' && (
                  <div className="flex items-center gap-1 bg-[#FFF5F7] p-1 rounded-2xl border border-[#F2C4D2]">
                    {fechaSeleccionada !== hoyStr && (
                      <button
                        onClick={() => setFechaSeleccionada(hoyStr)}
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
                      onClick={() => setFechaSeleccionada(hoyStr)}
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
                    <input
                      type="date"
                      value={fechaSeleccionada}
                      onChange={(e) => setFechaSeleccionada(e.target.value)}
                      className="px-2 py-1 bg-white border border-[#F2C4D2] rounded-xl text-xs font-bold text-[#2D2529] outline-none cursor-pointer hover:border-[#8C243B] transition"
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
                    <input
                      type="month"
                      value={mesSeleccionado}
                      onChange={(e) => setMesSeleccionado(e.target.value)}
                      className="px-2 py-1 bg-white border border-[#F2C4D2] rounded-xl text-xs font-bold text-[#2D2529] outline-none cursor-pointer hover:border-[#8C243B] transition"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 4 TARJETAS PRINCIPALES DE RESUMEN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">
                  {modoMetricas === 'dia' ? 'Ingresos del Día' : 'Ingresos del Mes'}
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#8C243B]">
                  ${metricasSpa.ingresosTotales.toLocaleString('es-CO')}
                </p>
                <p className="text-[10px] text-[#7D6870]">
                  {metricasSpa.confirmadasCount} citas confirmadas y atendidas
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">
                  {modoMetricas === 'dia' ? 'Citas Agendadas Hoy' : 'Total Citas del Mes'}
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#2D2529]">
                  {metricasSpa.total}
                </p>
                <p className="text-[10px] text-[#7D6870]">
                  {modoMetricas === 'dia' ? `Para el ${fechaLegible}` : `En todo ${nombreMesLegible}`}
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
                  {modoMetricas === 'dia' ? 'Citas Pendientes / Turnos' : 'Efectividad Mensual'}
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#C74B66]">
                  {modoMetricas === 'dia' ? metricasSpa.pendientesCount : `${metricasSpa.total - metricasSpa.canceladasCount}`}
                </p>
                <p className="text-[10px] text-[#7D6870]">
                  {metricasSpa.canceladasCount > 0
                    ? `${metricasSpa.canceladasCount} cancelada(s)`
                    : '0 cancelaciones registradas'}
                </p>
              </div>
            </div>

            {/* TABLA 1: Rendimiento por Manicurista */}
            <div className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs overflow-hidden space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                  Rendimiento por Manicurista ({modoMetricas === 'dia' ? 'Día' : 'Mes'})
                </h3>
                <span className="text-[11px] text-[#7D6870]">
                  {modoMetricas === 'dia' ? fechaLegible : nombreMesLegible}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FFF5F7] text-[#7D6870] uppercase text-[10px] border-b border-[#F2C4D2]">
                    <tr>
                      <th className="py-2.5 px-3">Especialista</th>
                      <th className="py-2.5 px-3">Citas en el Período</th>
                      <th className="py-2.5 px-3">Completadas</th>
                      <th className="py-2.5 px-3">Recaudo Estimado</th>
                      <th className="py-2.5 px-3">% Recaudo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FCE8EF]">
                    {metricasSpa.porManicurista.map((m, i) => {
                      const porcentaje =
                        metricasSpa.ingresosTotales > 0
                          ? Math.round((m.ingresos / metricasSpa.ingresosTotales) * 100)
                          : 0;
                      return (
                        <tr key={m.cancha.id} className="hover:bg-[#FFF5F7]/50 transition">
                          <td className="py-3 px-3 font-bold text-[#2D2529] flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center text-[10px]">
                              {i === 0 ? '👑' : `M${i + 1}`}
                            </span>
                            <span>{m.cancha.nombre}</span>
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold">{m.total}</td>
                          <td className="py-3 px-3 font-mono text-emerald-600 font-bold">{m.completadas}</td>
                          <td className="py-3 px-3 font-mono font-bold text-[#8C243B]">
                            ${m.ingresos.toLocaleString('es-CO')}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#8C243B] border border-[#F2C4D2]">
                              {porcentaje}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABLA 2: Citas por Servicio */}
            <div className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs overflow-hidden space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                  Demanda por Servicio de Uñas ({modoMetricas === 'dia' ? 'Día' : 'Mes'})
                </h3>
                <span className="text-[11px] text-[#7D6870]">
                  {modoMetricas === 'dia' ? fechaLegible : nombreMesLegible}
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* CASO C: VISTA EXCLUSIVA DE LAS MANICURISTAS (2, 3 O 4)                */}
        {/* ==================================================================== */}
        {!esAdmin && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border border-[#F2C4D2] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
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
              <div className="flex items-center gap-2">
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
                reservasDeLaSemana.filter((r) => r.cancha_id === perfilActual.canchaId),
                false,
                perfilActual.canchaId
              )
            ) : (
              /* TIMELINE DIARIO CRONOLÓGICO DE LA MANICURISTA CON LÍNEA ROJA EN TIEMPO REAL */
              (() => {
                const misCitas = reservasDelDia.filter(
                  (r) => r.cancha_id === perfilActual.canchaId
                );

                return renderTimelineManicurista(
                  misCitas,
                  perfilActual.nombre,
                  perfilActual.canchaId,
                  false
                );
              })()
            )}

            {/* Aviso de permisos */}
            <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3 text-xs text-[#7D6870] text-center">
              🔒 Tu perfil está configurado para consultar tus citas personales. La administración y agendamiento general es gestionado por la encargada.
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL EXCLUSIVO DE LA ADMIN: AGENDAR CITA CON MENÚS DESPLEGABLES     */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {esAdmin && modalAgendarAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center font-bold text-sm">
                    💅
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                      Agendar Cita en el Spa
                    </h3>
                    <p className="text-[11px] text-[#7D6870]">
                      Acceso exclusivo Administradora
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalAgendarAbierto(false)}
                  className="p-1 rounded-full text-[#7D6870] hover:text-[#2D2529] cursor-pointer"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCrearCitaAdmin} className="space-y-3.5 text-xs">
                {/* 1. MENÚ DESPLEGABLE ELEGANTE: MANICURISTA */}
                <div className="relative">
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Especialista / Manicurista
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuManiAbierto(!menuManiAbierto);
                      setMenuServicioAbierto(false);
                      setMenuHoraAbierto(false);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center text-[10px]">
                        💅
                      </span>
                      <span>{manicuristaSeleccionadaForm?.nombre || 'Seleccionar Manicurista'}</span>
                    </span>
                    <IconChevronDown className={`w-4 h-4 text-[#8C243B] transition-transform ${menuManiAbierto ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {menuManiAbierto && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 space-y-1"
                      >
                        {canchas.map((c, i) => {
                          const estaSel = c.id === agendarManicuristaId;
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                setAgendarManicuristaId(c.id);
                                setMenuManiAbierto(false);
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

                {/* 2. MENÚ DESPLEGABLE ELEGANTE: SERVICIO DE UÑAS */}
                <div className="relative">
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Servicio de Uñas
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuServicioAbierto(!menuServicioAbierto);
                      setMenuManiAbierto(false);
                      setMenuHoraAbierto(false);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                  >
                    <div className="truncate pr-2">
                      <span>{servicioSeleccionadoForm?.nombre || 'Seleccionar Servicio'}</span>
                      <span className="text-[11px] font-mono text-[#8C243B] ml-2">
                        (${servicioSeleccionadoForm?.precio.toLocaleString('es-CO')} · {servicioSeleccionadoForm?.duracion} min)
                      </span>
                    </div>
                    <IconChevronDown className={`w-4 h-4 text-[#8C243B] shrink-0 transition-transform ${menuServicioAbierto ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {menuServicioAbierto && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 max-h-56 overflow-y-auto space-y-1"
                      >
                        {servicios.map((s) => {
                          const estaSel = s.id === agendarServicioId;
                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                setAgendarServicioId(s.id);
                                setMenuServicioAbierto(false);
                              }}
                              className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition ${
                                estaSel
                                  ? 'bg-[#FCE8EF] text-[#8C243B] font-bold'
                                  : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                              }`}
                            >
                              <div>
                                <p className="font-semibold">{s.nombre}</p>
                                <p className="text-[10px] text-[#7D6870]">
                                  {s.categoria} · {s.duracion} min
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#8C243B]">
                                  ${s.precio.toLocaleString('es-CO')}
                                </span>
                                {estaSel && <IconCheck className="w-4 h-4 text-[#8C243B]" />}
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 3. FECHA Y HORA (CON MENÚ ELEGANTE DE HORA) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-[#7D6870] block mb-1">Fecha</label>
                    <input
                      type="date"
                      value={agendarFecha}
                      onChange={(e) => setAgendarFecha(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl font-bold text-[#2D2529] outline-none cursor-pointer"
                    />
                  </div>

                  {/* Menú Desplegable Hora */}
                  <div className="relative">
                    <label className="font-bold text-[#7D6870] block mb-1">Hora</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuHoraAbierto(!menuHoraAbierto);
                        setMenuManiAbierto(false);
                        setMenuServicioAbierto(false);
                      }}
                      className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                    >
                      <span className="flex items-center gap-1 font-mono text-[#8C243B]">
                        <IconClock className="w-3.5 h-3.5 text-[#C74B66]" />
                        {agendarHora}
                      </span>
                      <IconChevronDown className={`w-3.5 h-3.5 text-[#8C243B] transition-transform ${menuHoraAbierto ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {menuHoraAbierto && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 max-h-48 overflow-y-auto space-y-1"
                        >
                          {horasDisponiblesAgendarAdmin.length === 0 ? (
                            <div className="p-2.5 text-center text-xs text-[#8C243B] bg-[#FFF5F7] rounded-xl font-medium">
                              No hay horarios disponibles (todos están ocupados o bloqueados).
                            </div>
                          ) : (
                            horasDisponiblesAgendarAdmin.map((h) => {
                              const estaSel = h === agendarHora;
                              return (
                                <div
                                  key={h}
                                  onClick={() => {
                                    setAgendarHora(h);
                                    setMenuHoraAbierto(false);
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer font-mono text-xs transition ${
                                    estaSel
                                      ? 'bg-[#FCE8EF] text-[#8C243B] font-bold'
                                      : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                                  }`}
                                >
                                  <span>{h}</span>
                                  {estaSel && <IconCheck className="w-3.5 h-3.5 text-[#8C243B]" />}
                                </div>
                              );
                            })
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* 4. DATOS DE LA CLIENTA */}
                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Nombre de la Clienta
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Camila Restrepo"
                    value={agendarNombre}
                    onChange={(e) => setAgendarNombre(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[#2D2529] font-medium outline-none focus:border-[#8C243B]"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-[#7D6870] block mb-1">
                    Teléfono WhatsApp (10 dígitos)
                  </label>
                  <input
                    type="tel"
                    placeholder="321 961 0896"
                    value={agendarTelefono}
                    onChange={(e) => setAgendarTelefono(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[#2D2529] font-mono outline-none focus:border-[#8C243B]"
                    required
                  />
                  <p className="text-[10px] text-[#7D6870] mt-0.5">
                    Se enviará el voucher de confirmación automáticamente a su WhatsApp.
                  </p>
                </div>

                {errorAgendar && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5 font-medium">
                    <IconAlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorAgendar}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalAgendarAbierto(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold rounded-xl transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoCita}
                    className="flex-1 py-2.5 bg-[#8C243B] hover:bg-[#731D30] text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {guardandoCita ? (
                      <>
                        <IconLoader2 className="w-4 h-4 animate-spin" />
                        <span>Agendando...</span>
                      </>
                    ) : (
                      <span>Confirmar Cita</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================================================================== */}
      {/* MODAL: BLOQUEAR HORARIO (ADMIN Y MANICURISTAS)                       */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {modalBloquearAbierto && (
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
                  onClick={() => setModalBloquearAbierto(false)}
                  className="p-1.5 rounded-full text-[#7D6870] hover:text-[#2D2529] hover:bg-[#FFF5F7] cursor-pointer transition"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCrearBloqueo} className="space-y-4 text-xs">
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
                    value={bloquearFecha}
                    onChange={(e) => setBloquearFecha(e.target.value)}
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
                            HORAS_OPCIONES_BLOQUEO.filter((h) => !horasYaOcupadasBloqueo.has(h))
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
                    {HORAS_OPCIONES_BLOQUEO.map((h) => {
                      const yaOcupada = horasYaOcupadasBloqueo.has(h);
                      const estaMarcada = bloquearHorasSeleccionadas.includes(h);
                      return (
                        <button
                          key={h}
                          type="button"
                          disabled={yaOcupada}
                          onClick={() => !yaOcupada && toggleHoraBloqueo(h)}
                          className={`py-2 px-2 rounded-xl font-mono text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border ${
                            yaOcupada
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
                          {yaOcupada && (
                            <span className="text-[9px] font-sans font-bold text-slate-500 uppercase tracking-tighter">
                              Ocupada
                            </span>
                          )}
                          {estaMarcada && !yaOcupada && (
                            <IconCheck className="w-3.5 h-3.5 stroke-[3]" />
                          )}
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
                    onClick={() => setModalBloquearAbierto(false)}
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

            {/* ==================================================================== */}
      {/* ==================================================================== */}
      {/* MODAL ELEGANTE: RESTRICCIÓN DE ACCESO AL BOT DE WHATSAPP             */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {esAdmin && modalExclusionesAbierto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95"
            >
              {/* Encabezado del Modal */}
              <div className="flex items-center justify-between border-b border-[#FCE8EF] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-800 border border-amber-300 flex items-center justify-center font-bold text-lg shadow-2xs">
                    <IconLock className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-[#2D2529] font-serif">
                        Restricción de Acceso al Bot
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        Control de Acceso
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7D6870]">
                      El bot NO responderá ni enviará enlaces de reserva a estos números
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setModalExclusionesAbierto(false)}
                  className="p-1.5 rounded-full text-[#7D6870] hover:text-[#2D2529] hover:bg-[#FFF5F7] cursor-pointer transition"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              {/* Formulario para Agregar Nuevo Número Restringido */}
              <form onSubmit={handleAgregarExclusion} className="p-3.5 bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl space-y-2.5">
                <p className="text-xs font-bold text-[#8C243B] flex items-center gap-1.5">
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Restringir nuevo número</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] font-semibold text-[#7D6870] block mb-1">
                      Teléfono WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej: 321 961 0896"
                      value={nuevoTelExclusion}
                      onChange={(e) => setNuevoTelExclusion(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#F2C4D2] rounded-xl font-mono text-xs text-[#2D2529] outline-none focus:border-[#8C243B] shadow-2xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#7D6870] block mb-1">
                      Motivo / Identificador (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Cancela seguido / No asiste"
                      value={nuevoNombreExclusion}
                      onChange={(e) => setNuevoNombreExclusion(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#F2C4D2] rounded-xl text-xs text-[#2D2529] outline-none focus:border-[#8C243B] shadow-2xs"
                    />
                  </div>
                </div>

                {errorExclusion && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <IconAlertCircle className="w-3.5 h-3.5" />
                    <span>{errorExclusion}</span>
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={guardandoExclusion}
                    className="px-4 py-2 bg-gradient-to-r from-[#8C243B] to-[#C74B66] hover:from-[#731D30] hover:to-[#B03C54] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                  >
                    {guardandoExclusion ? (
                      <>
                        <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <IconLock className="w-3.5 h-3.5" />
                        <span>Restringir Acceso al Bot</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Barra de Búsqueda y Contador */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="relative flex-1">
                  <IconSearch className="w-3.5 h-3.5 text-[#7D6870] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar en la lista..."
                    value={busquedaExclusion}
                    onChange={(e) => setBusquedaExclusion(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[#FFF5F7]/70 border border-[#F2C4D2] rounded-xl text-xs text-[#2D2529] outline-none focus:border-[#8C243B]"
                  />
                </div>
                <span className="text-[11px] text-[#7D6870] font-semibold shrink-0">
                  {exclusionesBot.length} {exclusionesBot.length === 1 ? 'número restringido' : 'números restringidos'}
                </span>
              </div>

              {/* Lista de Números Restringidos */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px] max-h-[300px]">
                {cargandoExclusiones ? (
                  <div className="py-8 text-center text-[#7D6870] text-xs flex items-center justify-center gap-2">
                    <IconLoader2 className="w-4 h-4 animate-spin text-[#8C243B]" />
                    <span>Cargando lista...</span>
                  </div>
                ) : (() => {
                  const filtradas = exclusionesBot.filter((item) => {
                    const q = busquedaExclusion.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      item.telefono.includes(q) ||
                      (item.nombre && item.nombre.toLowerCase().includes(q))
                    );
                  });

                  if (filtradas.length === 0) {
                    return (
                      <div className="text-center py-8 text-[#7D6870] space-y-1 bg-[#FFF5F7]/40 rounded-2xl border border-dashed border-[#F2C4D2]">
                        <p className="text-xs font-bold text-[#8C243B]">
                          {busquedaExclusion ? 'Sin resultados para la búsqueda' : 'No hay números restringidos'}
                        </p>
                        <p className="text-[11px] opacity-75">
                          {busquedaExclusion ? 'Intenta con otro término' : 'El bot está atendiendo normalmente a los usuarios.'}
                        </p>
                      </div>
                    );
                  }

                  return filtradas.map((item) => {
                    const telLimpio = item.telefono.replace(/\D/g, '');
                    return (
                      <div
                        key={item.telefono}
                        className="p-3 bg-white border border-[#F2C4D2] rounded-2xl flex items-center justify-between gap-3 shadow-2xs hover:border-[#8C243B] transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                            🔒
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#2D2529] truncate font-serif">
                              {item.nombre || 'Número restringido'}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-[#7D6870]">
                              <span className="font-mono">{item.telefono}</span>
                              <a
                                href={`https://wa.me/${telLimpio}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-0.5"
                                title="Abrir chat en WhatsApp"
                              >
                                <IconBrandWhatsapp className="w-3 h-3" />
                                <span>Abrir</span>
                              </a>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => solicitarReactivarBot(item.telefono, item.nombre)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 active:scale-95 shadow-2xs"
                          title="Levantar la restricción y permitir que el bot vuelva a responder"
                        >
                          <IconRefresh className="w-3 h-3 text-emerald-700" />
                          <span>Reactivar Bot</span>
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Pie del Modal */}
              <div className="pt-2 border-t border-[#FCE8EF] flex items-center justify-between text-[11px] text-[#7D6870]">
                <span>💡 Los números en esta lista no podrán solicitar enlaces ni agendar por el bot.</span>
                <button
                  type="button"
                  onClick={() => setModalExclusionesAbierto(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold rounded-xl transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      {/* MODAL ELEGANTE: CONFIRMAR ELIMINACIÓN DE CITA                        */}
      {/* ==================================================================== */}
      <AnimatePresence>
        {citaAEliminar && (
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
                  <div className="w-10 h-10 rounded-2xl bg-[#FFF5F7] text-[#8C243B] border border-[#F2C4D2] flex items-center justify-center font-bold text-lg shadow-2xs">
                    <IconTrash className="w-5 h-5 text-[#8C243B]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-[#2D2529] font-serif">
                      ¿Eliminar esta Cita?
                    </h3>
                    <p className="text-[11px] text-[#7D6870]">
                      Esta acción liberará el cupo en la agenda
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCitaAEliminar(null)}
                  className="p-1.5 rounded-full text-[#7D6870] hover:text-[#2D2529] hover:bg-[#FFF5F7] cursor-pointer transition"
                >
                  <IconX className="w-4 h-4" />
                </button>
              </div>

              {/* Tarjeta con los Datos de la Cita */}
              <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#7D6870]">Clienta:</span>
                  <span className="font-bold text-sm text-[#2D2529] font-serif">
                    {citaAEliminar.nombreClienta}
                  </span>
                </div>

                {citaAEliminar.servicio && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#7D6870]">Servicio:</span>
                    <span className="font-semibold text-[#8C243B]">
                      💅 {citaAEliminar.servicio}
                    </span>
                  </div>
                )}

                {citaAEliminar.hora && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#7D6870]">Horario:</span>
                    <span className="font-mono font-bold text-[#8C243B] bg-white px-2 py-0.5 rounded-lg border border-[#F2C4D2]">
                      ⏰ {citaAEliminar.hora}
                    </span>
                  </div>
                )}

                {citaAEliminar.especialista && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#7D6870]">Especialista:</span>
                    <span className="font-medium text-[#2D2529]">
                      ✨ {citaAEliminar.especialista}
                    </span>
                  </div>
                )}

                {citaAEliminar.fecha && (
                  <div className="flex items-center justify-between text-xs border-t border-[#F2C4D2]/60 pt-2">
                    <span className="text-[#7D6870]">Fecha:</span>
                    <span className="text-[#7D6870] font-medium capitalize">
                      📅 {citaAEliminar.fecha}
                    </span>
                  </div>
                )}
              </div>

              {/* Alerta Informativa */}
              <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
                <IconAlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Al eliminar la cita, el horario quedará nuevamente disponible para nuevas reservas.
                </span>
              </div>

              {/* Botones Cancelar y Confirmar Eliminar con Colores de la Marca */}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCitaAEliminar(null)}
                  disabled={eliminandoCita}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarEliminarCita}
                  disabled={eliminandoCita}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#8C243B] to-[#C74B66] hover:from-[#731D30] hover:to-[#B03C54] text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {eliminandoCita ? (
                    <>
                      <IconLoader2 className="w-4 h-4 animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <>
                      <IconTrash className="w-4 h-4" />
                      <span>Sí, Eliminar Cita</span>
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
      {popoverCita && (() => {
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
        const estaEnAtencion = !esBloqueada && cita.estado !== 'completada' && cita.estado !== 'cancelada' && ahoraMs >= inicioMs && ahoraMs < finMs;

        return (
          <div
            className="fixed z-50 pointer-events-auto transition-all duration-150"
            style={{ left: `${posX}px`, top: `${posY}px`, width: `${anchoPopover}px` }}
            onMouseEnter={mantenerPopoverCita}
            onMouseLeave={cerrarPopoverCita}
          >
            <div className="bg-white rounded-2xl border-2 border-[#8C243B]/25 shadow-2xl overflow-hidden p-4 space-y-3 backdrop-blur-md ring-8 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
              {/* Cabecera del Popover */}
              <div className="flex items-start justify-between gap-2 border-b border-[#F2C4D2]/70 pb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shadow-2xs shrink-0 ${
                    esBloqueada ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-[#FFF5F7] text-[#8C243B] border border-[#F2C4D2]'
                  }`}>
                    {esBloqueada ? '🔒' : '💅'}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm text-[#2D2529] font-serif truncate" title={esBloqueada ? motivoBloqueo : nombreClienta}>
                      {esBloqueada ? motivoBloqueo : nombreClienta}
                    </h4>
                    <p className="text-[11px] text-[#7D6870] truncate">
                      {esBloqueada ? `Bloqueado por: ${bloqueadoPor}` : (canchaCita ? `💅 ${canchaCita.nombre}` : 'JL Mímate Nails')}
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
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      esBloqueada
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : cita.estado === 'completada'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : cita.estado === 'cancelada'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                    }`}>
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
                    <span className="font-bold text-[#2D2529] text-right truncate max-w-[180px]">{servicioNombre}</span>
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
                      <span className="font-mono text-xs text-[#2D2529] font-medium">{cita.clientes.telefono_wa}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Botones de Acción Inmediata */}
              <div className="pt-2 border-t border-[#F2C4D2]/70 flex items-center gap-2">
                {esBloqueada ? (
                  puedeDesbloquear && (
                    <button
                      onClick={() => {
                        handleDesbloquearHorario(cita.id, horaInicio);
                        setPopoverCita(null);
                      }}
                      className="w-full py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                    >
                      <IconLockOpen className="w-3.5 h-3.5" />
                      <span>Desbloquear Horario</span>
                    </button>
                  )
                ) : (
                  <>
                    {telLimpio && (
                      <a
                        href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(nombreClienta)},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20las%20${horaInicio}.`}
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
                      <button
                        onClick={() => {
                          handleCambiarEstado(cita.id, 'completada');
                          setPopoverCita(null);
                        }}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                      >
                        <IconCheck className="w-3.5 h-3.5" />
                        <span>Completada</span>
                      </button>
                    )}

                    {esAdmin && telLimpio && (() => {
                      const solo10 = telLimpio.startsWith('57') && telLimpio.length === 12 ? telLimpio.slice(2) : telLimpio;
                      const estaSilenciado = exclusionesBot.some((e) => {
                        const eLimpio = e.telefono.replace(/\D/g, '');
                        return eLimpio === telLimpio || eLimpio === solo10 || (eLimpio.startsWith('57') && eLimpio.slice(2) === solo10);
                      });
                      return (
                        <button
                          onClick={() => handleToggleSilenciarDesdeCita(telLimpio, nombreClienta)}
                          className={`px-2.5 py-2 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95 ${
                            estaSilenciado
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2]'
                          }`}
                          title={estaSilenciado ? 'Acceso al bot actualmente restringido para este número. Clic para reactivar.' : 'Restringir bot para evitar que este número use reservas automáticas'}
                        >
                          <IconLock className="w-3.5 h-3.5 text-amber-700" />
                          <span className="hidden sm:inline">{estaSilenciado ? 'Bot Restringido' : 'Restringir Bot'}</span>
                        </button>
                      );
                    })()}

                    {esAdmin && (
                      <button
                        onClick={() => {
                          handleEliminarCita(cita.id, nombreClienta);
                          setPopoverCita(null);
                        }}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition shadow-2xs cursor-pointer"
                        title="Eliminar cita definitivamente"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
