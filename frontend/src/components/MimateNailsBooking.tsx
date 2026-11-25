import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconBrandWhatsapp,
  IconBrandInstagram,
  IconClock,
  IconMapPin,
  IconSparkles,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconLoader2,
  IconHeart,
  IconChevronDown,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { supabase } from '../config/supabase';
import { LegalModal, LegalTab } from './legal/LegalModal';
import { esTarifaDesdeDiciembre, obtenerPrecioServicioParaFecha } from '../utils/tarifas';

interface Servicio {
  id: number;
  nombre: string;
  categoria: string;
  duracion: number;
  precio: number;
  precioDiciembre?: number;
  descripcion: string;
}

interface Empleada {
  id: string;
  nombre: string;
  foto?: string | null;
}

const FOTOS_EQUIPO_MIMATE: Record<string, string> = {
  'lili': '/equipo/lili.jpg',
  'jhoana': '/equipo/jhoana.jpg',
  'manuela': '/equipo/manuela.jpg',
  'manicurista 1': '/equipo/lili.jpg',
  'manicurista 2': '/equipo/jhoana.jpg',
  'manicurista 3': '/equipo/manuela.jpg',
};

const REGEX_HORARIO_REAL = /\[HORARIO_REAL:([^|\]]+)\|([^\]]+)\]/i;

function hidratarHorarioRealReserva<T extends { fecha_inicio?: string; fecha_fin?: string; notas?: string | null }>(
  r: T
): T {
  if (!r) return r;
  const match = (r.notas || '').match(REGEX_HORARIO_REAL);
  if (match && match[1] && match[2]) {
    const iniMs = new Date(match[1].trim()).getTime();
    const finMs = new Date(match[2].trim()).getTime();
    if (!isNaN(iniMs) && !isNaN(finMs) && finMs > iniMs) {
      return {
        ...r,
        fecha_inicio: new Date(iniMs).toISOString(),
        fecha_fin: new Date(finMs).toISOString(),
      };
    }
  }
  return r;
}

const HORAS_ANCLA_CLIENTAS = ['09:30', '13:00', '15:00', '17:00'] as const;

function obtenerFechaYHoraBogota(epochMs: number): { fechaIso: string; hhmm: string } {
  const d = new Date(epochMs - 5 * 60 * 60 * 1000);
  const iso = d.toISOString();
  return {
    fechaIso: iso.slice(0, 10),
    hhmm: iso.slice(11, 16),
  };
}

function calcularSlotsClientaManicurista(params: {
  fechaIso: string;
  canchaId: string;
  duracionMinutos: number;
  reservasActivas: Array<{ cancha_id?: string; fecha_inicio?: string; fecha_fin?: string }>;
  horaAperturaMs: number;
  horaCierreMs: number;
  ahoraMs: number;
}): string[] {
  const { fechaIso, canchaId, duracionMinutos, reservasActivas, horaAperturaMs, horaCierreMs, ahoraMs } = params;
  const reservasMani = reservasActivas.filter((r) => r.cancha_id === canchaId && r.fecha_inicio);

  const candidatosSet = new Set<string>(HORAS_ANCLA_CLIENTAS);

  for (const r of reservasMani) {
    const rStart = new Date(r.fecha_inicio!).getTime();
    const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60 * 1000;
    if (!isNaN(rEnd)) {
      const { fechaIso: finFecha, hhmm: finHHMM } = obtenerFechaYHoraBogota(rEnd);
      if (finFecha === fechaIso && rEnd >= horaAperturaMs && rEnd < horaCierreMs) {
        candidatosSet.add(finHHMM);
      }
    }
  }

  const candidatosOrdenados = Array.from(candidatosSet).sort();
  const almuerzoStartMs = new Date(`${fechaIso}T12:00:00-05:00`).getTime();
  const almuerzoEndMs = new Date(`${fechaIso}T13:00:00-05:00`).getTime();
  const libres: string[] = [];

  for (const h of candidatosOrdenados) {
    const slotStartMs = new Date(`${fechaIso}T${h}:00-05:00`).getTime();
    const slotEndMs = slotStartMs + duracionMinutos * 60 * 1000;

    if (slotStartMs <= ahoraMs) continue;
    if (!isNaN(horaAperturaMs) && slotStartMs < horaAperturaMs) continue;
    if (!isNaN(horaCierreMs) && slotEndMs > horaCierreMs) continue;
    if (slotStartMs < almuerzoEndMs && slotEndMs > almuerzoStartMs) continue;

    const solapa = reservasMani.some((r) => {
      const rStart = new Date(r.fecha_inicio!).getTime();
      const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60 * 1000;
      return rStart < slotEndMs && rEnd > slotStartMs;
    });

    if (!solapa) {
      libres.push(h);
    }
  }

  return libres;
}

function normalizarNombreYFotoEmpleada(emp: { id: string; nombre: string; foto?: string | null }): Empleada {
  let nombre = emp.nombre;
  const nLower = nombre.trim().toLowerCase();
  if (nLower.includes('manicurista 1') || nLower === '1') nombre = 'Lili';
  else if (nLower.includes('manicurista 2') || nLower === '2') nombre = 'Jhoana';
  else if (nLower.includes('manicurista 3') || nLower === '3') nombre = 'Manuela';

  const foto = emp.foto || FOTOS_EQUIPO_MIMATE[nombre.toLowerCase()] || FOTOS_EQUIPO_MIMATE[emp.nombre.toLowerCase()] || null;
  return { id: emp.id, nombre, foto };
}

const SERVICIOS_DEFAULT: Servicio[] = [
  // --- TRADICIONAL ---
  {
    id: 1,
    nombre: 'Pies hombre',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 14000,
    precioDiciembre: 17000,
    descripcion: 'Cuidado completo para pies masculinos, limpieza profunda, recorte, limado y exfoliación.',
  },
  {
    id: 2,
    nombre: 'Manos hombre',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 14000,
    precioDiciembre: 15000,
    descripcion: 'Cuidado para manos masculinas, limpieza de cutícula, limado, exfoliación e hidratación.',
  },
  {
    id: 3,
    nombre: 'Manos y pies',
    categoria: 'Tradicional',
    duracion: 120,
    precio: 35000,
    precioDiciembre: 40000,
    descripcion: 'Combo completo tradicional de manicure y pedicure con exfoliación, hidratación y esmaltado clásico.',
  },
  {
    id: 4,
    nombre: 'Pies',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 20000,
    precioDiciembre: 22000,
    descripcion: 'Pedicure tradicional con limpieza profunda, exfoliación, masaje relajante y esmaltado clásico.',
  },
  {
    id: 5,
    nombre: 'Manos',
    categoria: 'Tradicional',
    duracion: 60,
    precio: 16000,
    precioDiciembre: 18000,
    descripcion: 'Manicure tradicional con limpieza de cutícula, limado, hidratación y esmaltado clásico.',
  },

  // --- RUBBER ---
  {
    id: 6,
    nombre: 'Retoque press',
    categoria: 'Rubber',
    duracion: 90,
    precio: 50000,
    precioDiciembre: 55000,
    descripcion: 'Mantenimiento y retoque profesional para tus uñas press on, dejándolas como nuevas.',
  },
  {
    id: 7,
    nombre: 'Press on',
    categoria: 'Rubber',
    duracion: 120,
    precio: 65000,
    precioDiciembre: 70000,
    descripcion: 'Aplicación completa de tips preformados de gel de alta calidad para largo y forma al instante.',
  },
  {
    id: 8,
    nombre: 'Dipping',
    categoria: 'Rubber',
    duracion: 90,
    precio: 55000,
    precioDiciembre: 55000,
    descripcion: 'Técnica de polvo de inmersión sin lámpara, extra resistente y con acabado ultra natural.',
  },
  {
    id: 9,
    nombre: 'Base Rubber',
    categoria: 'Rubber',
    duracion: 90,
    precio: 55000,
    precioDiciembre: 60000,
    descripcion: 'Nivelación y refuerzo estructural con base elástica de alta densidad para uñas frágiles.',
  },

  // --- SEMIPERMANENTE ---
  {
    id: 10,
    nombre: 'Retiro semi',
    categoria: 'Semipermanente',
    duracion: 15,
    precio: 6000,
    precioDiciembre: 8000,
    descripcion: 'Retiro seguro, cuidadoso y profesional de esmalte semipermanente sin maltratar la uña natural.',
  },
  {
    id: 11,
    nombre: 'Semi hombre',
    categoria: 'Semipermanente',
    duracion: 60,
    precio: 25000,
    precioDiciembre: 25000,
    descripcion: 'Esmaltado o tratamiento semipermanente protector y prolijo para caballeros.',
  },
  {
    id: 12,
    nombre: 'Semi Manos y Pies',
    categoria: 'Semipermanente',
    duracion: 150,
    precio: 75000,
    precioDiciembre: 80000,
    descripcion: 'Combo completo de manos y pies con esmaltado semipermanente de larga duración y secado LED.',
  },
  {
    id: 13,
    nombre: 'Semi pies',
    categoria: 'Semipermanente',
    duracion: 80,
    precio: 38000,
    precioDiciembre: 43000,
    descripcion: 'Pedicure spa con esmaltado semipermanente de alto brillo y secado inmediato en lámpara LED.',
  },
  {
    id: 14,
    nombre: 'Semipermanente',
    categoria: 'Semipermanente',
    duracion: 90,
    precio: 43000,
    precioDiciembre: 48000,
    descripcion: 'Esmaltado en gel curado en lámpara LED con brillo espejo y duración de hasta 21 días intacto.',
  },

  // --- ACRÍLICO ESCULPIDO ---
  {
    id: 15,
    nombre: 'Uña',
    categoria: 'Acrílico esculpido',
    duracion: 20,
    precio: 6000,
    precioDiciembre: 7000,
    descripcion: 'Reparación o montaje individual de una uña en acrílico o sistema esculpido.',
  },
  {
    id: 16,
    nombre: 'Retiro acrilico',
    categoria: 'Acrílico esculpido',
    duracion: 60,
    precio: 10000,
    precioDiciembre: 10000,
    descripcion: 'Retiro profesional y delicado de sistema acrílico cuidando la salud de tu uña natural.',
  },
  {
    id: 17,
    nombre: 'Retiro',
    categoria: 'Acrílico esculpido',
    duracion: 60,
    precio: 15000,
    precioDiciembre: 10000,
    descripcion: 'Retiro completo y seguro de sistemas artificiales con nutrición e hidratación profunda.',
  },
  {
    id: 18,
    nombre: 'Retoque',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 65000,
    precioDiciembre: 70000,
    descripcion: 'Mantenimiento y relleno de crecimiento para sistema acrílico esculpido.',
  },
  {
    id: 19,
    nombre: 'Barrido',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 65000,
    precioDiciembre: 75000,
    descripcion: 'Capa protectora de acrílico sobre el largo natural para aportar máxima firmeza y resistencia.',
  },
  {
    id: 20,
    nombre: 'Acrilico',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 90000,
    precioDiciembre: 95000,
    descripcion: 'Extensión completa artesanal de uñas acrílicas esculpidas con monómero y polímero para estructura perfecta.',
  },
  {
    id: 21,
    nombre: 'Polygel',
    categoria: 'Acrílico esculpido',
    duracion: 120,
    precio: 90000,
    precioDiciembre: 95000,
    descripcion: 'Extensión y moldeado profesional en Polygel ligero, flexible y de alta durabilidad.',
  },
];

const EMPLEADAS_DEFAULT: Empleada[] = [
  { id: 'f6010000-0000-0000-0000-000000000001', nombre: 'Manicurista 1' },
  { id: 'f6020000-0000-0000-0000-000000000002', nombre: 'Manicurista 2' },
  { id: 'f6030000-0000-0000-0000-000000000003', nombre: 'Manicurista 3' },
];

const CATEGORIAS = [
  'Todos',
  'Tradicional',
  'Rubber',
  'Semipermanente',
  'Acrílico esculpido',
];

export function formatearDuracion(minutos: number): string {
  if (!minutos || minutos <= 0) return '30 min';
  return `${minutos} min`;
}

const GOOGLE_MAPS_SPA_URL = 'https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8';
const APPLE_MAPS_SPA_URL = 'https://maps.apple.com/?q=M%C3%ADmate+Nails&ll=4.8067489,-75.7350633';

function obtenerUrlMapaSpa(): string {
  if (typeof navigator !== 'undefined') {
    const esApple =
      /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) &&
      !/Windows|Android/.test(navigator.userAgent);
    if (esApple) {
      return APPLE_MAPS_SPA_URL;
    }
  }
  return GOOGLE_MAPS_SPA_URL;
}

interface Props {
  onIrAlAdmin?: () => void;
}

export const MimateNailsBooking: React.FC<Props> = ({ onIrAlAdmin }) => {
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [servicios, setServicios] = useState<Servicio[]>(SERVICIOS_DEFAULT);
  const [empleadas, setEmpleadas] = useState<Empleada[]>(EMPLEADAS_DEFAULT);

  // Modal de reserva
  const [modalAbierto, setModalAbierto] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [servicioSeleccionado, setServicioSeleccionado] = useState<Servicio | null>(null);
  const [serviciosExtras, setServiciosExtras] = useState<Servicio[]>([]);
  const [selectorExtrasAbierto, setSelectorExtrasAbierto] = useState(false);

  // Lista combinada de todos los servicios incluidos en la cita
  const todosLosServicios = useMemo(() => {
    if (!servicioSeleccionado) return [];
    return [servicioSeleccionado, ...serviciosExtras];
  }, [servicioSeleccionado, serviciosExtras]);

  // Duración total combinada (minutos)
  const duracionTotal = useMemo(() => {
    return todosLosServicios.reduce((acc, s) => acc + (s.duracion || 60), 0);
  }, [todosLosServicios]);

  // Formulario de reserva
  const hoyStr = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }, []);
  const [fecha, setFecha] = useState(hoyStr);

  // Precio total combinado (COP) según fecha seleccionada (tarifa vigente desde el 1 de dic)
  const precioTotal = useMemo(() => {
    return todosLosServicios.reduce((acc, s) => acc + obtenerPrecioServicioParaFecha(s, fecha), 0);
  }, [todosLosServicios, fecha]);

  // Nombre de servicios combinados (ej. "Manos + Pies")
  const nombreServiciosCombinados = useMemo(() => {
    return todosLosServicios.map((s) => s.nombre).join(' + ');
  }, [todosLosServicios]);

  const toggleServicioExtra = (s: Servicio) => {
    setServiciosExtras((prev) => {
      const yaEsta = prev.some((x) => x.id === s.id);
      if (yaEsta) {
        return prev.filter((x) => x.id !== s.id);
      } else {
        return [...prev, s];
      }
    });
    setHoraSeleccionada(null);
  };
  const [faqAbierto, setFaqAbierto] = useState<number | null>(null);
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const contenedorCalendarioRef = useRef<HTMLDivElement>(null);

  const [añoVisualizado, setAñoVisualizado] = useState(() => {
    const [y] = hoyStr.split('-').map(Number);
    return y;
  });
  const [mesVisualizado, setMesVisualizado] = useState(() => {
    const [, m] = hoyStr.split('-').map(Number);
    return m - 1;
  });

  // Cuando se abre el calendario, sincronizar vista con la fecha seleccionada
  useEffect(() => {
    if (calendarioAbierto && fecha) {
      const [y, m] = fecha.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setAñoVisualizado(y);
        setMesVisualizado(m - 1);
      }
    }
  }, [calendarioAbierto, fecha]);

  // Cerrar al hacer clic fuera o presionar Escape
  useEffect(() => {
    if (!calendarioAbierto) return;
    const handleClickAfuera = (event: MouseEvent | TouchEvent) => {
      if (
        contenedorCalendarioRef.current &&
        !contenedorCalendarioRef.current.contains(event.target as Node)
      ) {
        setCalendarioAbierto(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarioAbierto(false);
    };
    document.addEventListener('mousedown', handleClickAfuera);
    document.addEventListener('touchstart', handleClickAfuera);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAfuera);
      document.removeEventListener('touchstart', handleClickAfuera);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [calendarioAbierto]);

  const [hoyYear, hoyMonth] = useMemo(() => {
    const [y, m] = hoyStr.split('-').map(Number);
    return [y, m - 1];
  }, [hoyStr]);

  // Restricción para clientes: Solo pueden ver/agendar el mes en transcurso y el siguiente
  const [maxYear, maxMonth] = useMemo(() => {
    let m = hoyMonth + 1;
    let y = hoyYear;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    return [y, m];
  }, [hoyYear, hoyMonth]);

  const maxFechaIso = useMemo(() => {
    // Último día del mes siguiente
    const ultimoDia = new Date(maxYear, maxMonth + 1, 0).getDate();
    const mStr = String(maxMonth + 1).padStart(2, '0');
    const dStr = String(ultimoDia).padStart(2, '0');
    return `${maxYear}-${mStr}-${dStr}`;
  }, [maxYear, maxMonth]);

  // Si la fecha seleccionada se sale del rango permitido, reajustarla automáticamente a hoy
  useEffect(() => {
    if (fecha && (fecha < hoyStr || fecha > maxFechaIso)) {
      setFecha(hoyStr);
    }
  }, [fecha, hoyStr, maxFechaIso]);

  const puedeIrMesAnterior = useMemo(() => {
    if (añoVisualizado > hoyYear) return true;
    if (añoVisualizado === hoyYear) return mesVisualizado > hoyMonth;
    return false;
  }, [añoVisualizado, mesVisualizado, hoyYear, hoyMonth]);

  const puedeIrMesSiguiente = useMemo(() => {
    if (añoVisualizado < maxYear) return true;
    if (añoVisualizado === maxYear) return mesVisualizado < maxMonth;
    return false;
  }, [añoVisualizado, mesVisualizado, maxYear, maxMonth]);

  const cambiarMes = (delta: number) => {
    if (delta > 0 && !puedeIrMesSiguiente) return;
    if (delta < 0 && !puedeIrMesAnterior) return;

    let nuevoMes = mesVisualizado + delta;
    let nuevoAño = añoVisualizado;
    if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAño -= 1;
    } else if (nuevoMes > 11) {
      nuevoMes = 0;
      nuevoAño += 1;
    }
    setAñoVisualizado(nuevoAño);
    setMesVisualizado(nuevoMes);
  };

  const irAHoy = () => {
    setAñoVisualizado(hoyYear);
    setMesVisualizado(hoyMonth);
    setFecha(hoyStr);
    setCalendarioAbierto(false);
  };

  const nombreMesAño = useMemo(() => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${meses[mesVisualizado]} ${añoVisualizado}`;
  }, [mesVisualizado, añoVisualizado]);

  const diasCalendario = useMemo(() => {
    const res: Array<{
      tipo: 'prev' | 'current' | 'next';
      diaNum: number;
      iso: string;
      dayOfWeek: number;
    }> = [];

    const primerDia = new Date(añoVisualizado, mesVisualizado, 1);
    const primerDiaSemana = (primerDia.getDay() + 6) % 7; // Lunes = 0, Domingo = 6
    const diasEnMes = new Date(añoVisualizado, mesVisualizado + 1, 0).getDate();
    const diasEnMesPrev = new Date(añoVisualizado, mesVisualizado, 0).getDate();

    // Días del mes previo
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
      const diaNum = diasEnMesPrev - i;
      res.push({
        tipo: 'prev',
        diaNum,
        iso: '',
        dayOfWeek: (primerDiaSemana - 1 - i + 1) % 7,
      });
    }

    // Días del mes actual
    for (let d = 1; d <= diasEnMes; d++) {
      const fechaObj = new Date(añoVisualizado, mesVisualizado, d);
      const yStr = añoVisualizado;
      const mStr = String(mesVisualizado + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const iso = `${yStr}-${mStr}-${dStr}`;
      res.push({
        tipo: 'current',
        diaNum: d,
        iso,
        dayOfWeek: fechaObj.getDay(),
      });
    }

    // Días del mes siguiente para completar la cuadrícula (múltiplo de 7)
    const sobrantes = (7 - (res.length % 7)) % 7;
    for (let d = 1; d <= sobrantes; d++) {
      res.push({
        tipo: 'next',
        diaNum: d,
        iso: '',
        dayOfWeek: (res.length) % 7,
      });
    }

    return res;
  }, [añoVisualizado, mesVisualizado]);

  const formatearFechaElegante = (fechaIso: string) => {
    if (!fechaIso) return '';
    const [y, m, d] = fechaIso.split('-').map(Number);
    const fechaObj = new Date(y, m - 1, d);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    const diaSemana = dias[fechaObj.getDay()];
    const diaNum = fechaObj.getDate();
    const mesNombre = meses[fechaObj.getMonth()];

    if (fechaIso === hoyStr) {
      return `Hoy · ${diaSemana}, ${diaNum} de ${mesNombre}`;
    }
    return `${diaSemana}, ${diaNum} de ${mesNombre}`;
  };

  const diasRapidos = useMemo(() => {
    const lista = [];
    const diasCortos = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const [y, m, d] = hoyStr.split('-').map(Number);
    const base = new Date(y, m - 1, d);

    for (let i = 0; i < 7; i++) {
      const cur = new Date(base);
      cur.setDate(base.getDate() + i);
      const dayOfWeek = cur.getDay();
      const esDiciembre = (cur.getMonth() + 1) === 12;
      const esDomingo = dayOfWeek === 0;
      const esDomingoCerrado = esDomingo && !esDiciembre;

      const yStr = cur.getFullYear();
      const mStr = String(cur.getMonth() + 1).padStart(2, '0');
      const dStr = String(cur.getDate()).padStart(2, '0');
      const isoStr = `${yStr}-${mStr}-${dStr}`;

      let label = '';
      if (i === 0) label = 'Hoy';
      else if (i === 1) label = 'Mañana';
      else label = `${diasCortos[dayOfWeek]} ${cur.getDate()}`;

      lista.push({
        iso: isoStr,
        label,
        diaNum: cur.getDate(),
        diaSemana: diasCortos[dayOfWeek],
        esDomingo,
        esDiciembre,
        esDomingoCerrado,
      });
    }
    return lista;
  }, [hoyStr]);

  const [horaSeleccionada, setHoraSeleccionada] = useState<string | null>(null);
  const [empleadaId, setEmpleadaId] = useState<string>(''); // Vacío = "Cualquiera disponible"
  const [menuEspecialistaAbierto, setMenuEspecialistaAbierto] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [avisoSlots, setAvisoSlots] = useState<string | null>(null);

  // Datos del cliente
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [enviandoReserva, setEnviandoReserva] = useState(false);
  const [aceptaPoliticas, setAceptaPoliticas] = useState(false);
  const [modalLegalTab, setModalLegalTab] = useState<LegalTab | null>(null);
  // Configuración de anticipos, cuentas bancarias y horario de atención
  const [spaConfig, setSpaConfig] = useState<{
    exigeAnticipo: boolean;
    montoAnticipoFijo: number;
    porcentajeAnticipo?: number;
    nequiNumero?: string;
    bancolombiaNumero?: string;
    llaveNumero?: string;
    titularCuenta?: string;
    horaApertura?: string;
    horaCierre?: string;
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

  const formatearHora12h = (hhmm?: string, fallback = '9:30 am') => {
    if (!hhmm) return fallback;
    const [hStr, mStr] = hhmm.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h)) return fallback;
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = isNaN(m) ? '00' : String(m).padStart(2, '0');
    return `${h12}:${mm} ${ampm}`;
  };

  const horarioTexto = useMemo(() => {
    const aper = formatearHora12h(spaConfig.horaApertura, '9:30 am');
    const cier = formatearHora12h(spaConfig.horaCierre, '5:30 pm');
    return `Lun–Sáb ${aper} – ${cier}`;
  }, [spaConfig.horaApertura, spaConfig.horaCierre]);

  const [reservaConfirmada, setReservaConfirmada] = useState<{
    codigo?: string;
    empleada: string;
    servicio: string;
    fecha: string;
    hora: string;
    precio: number;
    telefono: string;
    esPreReserva?: boolean;
    esReagendamiento?: boolean;
    abonoPrevioReconocido?: number;
    montoAnticipoFijo?: number;
    porcentajeAnticipo?: number;
    anticipoRequerido?: number;
    saldoRestante?: number;
    nequi?: string;
    bancolombia?: string;
    llave?: string;
    titular?: string;
  } | null>(null);

  // Parámetro de reagendamiento desde recordatorio WhatsApp (?reagendar=<id>)
  const [reagendarId, setReagendarId] = useState<string | null>(null);
  const [citaPreviaInfo, setCitaPreviaInfo] = useState<{
    id?: string;
    fecha?: string;
    hora?: string;
    servicio?: string;
    manicurista?: string;
    abonoPrevio?: number;
    precioTotal?: number;
  } | null>(null);

  // Cargar info del spa y detectar parámetro de reagendamiento
  useEffect(() => {
    // 0. Cache instantáneo en sessionStorage para evitar layout shift o parpadeo
    try {
      const enriquecerServicios = (lista: Servicio[]): Servicio[] => {
        const porId = new Map(SERVICIOS_DEFAULT.map((s) => [s.id, s]));
        const enriquecidos = lista.map((s) => {
          const def = porId.get(s.id);
          return def ? { ...s, precioDiciembre: s.precioDiciembre ?? def.precioDiciembre } : s;
        });
        for (const def of SERVICIOS_DEFAULT) {
          if (!enriquecidos.some((s) => s.id === def.id)) {
            enriquecidos.push(def);
          }
        }
        return enriquecidos;
      };

      const cached = sessionStorage.getItem('mimate_bootstrap');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Date.now() - (parsed._ts || 0) < 5 * 60 * 1000) {
          if (parsed.servicios && parsed.servicios.length > 0) {
            setServicios(enriquecerServicios(parsed.servicios));
          }
          if (parsed.equipo && parsed.equipo.length > 0) {
            setEmpleadas(
              parsed.equipo
                .filter((c: any) => {
                  const nLower = (c.nombre || '').toLowerCase();
                  return !nLower.includes('manicurista 4') && nLower !== '4';
                })
                .map(normalizarNombreYFotoEmpleada)
            );
          }
          if (parsed.config) {
            setSpaConfig((prev) => ({ ...prev, ...parsed.config }));
          }
        }
      }
    } catch {}

    // 1. Carga unificada de bootstrap (equipo, servicios y configuración de anticipos en 1 solo viaje de red)
    fetch(`/api/spa/info?_t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.servicios && d.servicios.length > 0) {
          const porId = new Map(SERVICIOS_DEFAULT.map((s) => [s.id, s]));
          const enriquecidos = (d.servicios as Servicio[]).map((s) => {
            const def = porId.get(s.id);
            return def ? { ...s, precioDiciembre: s.precioDiciembre ?? def.precioDiciembre } : s;
          });
          for (const def of SERVICIOS_DEFAULT) {
            if (!enriquecidos.some((s) => s.id === def.id)) {
              enriquecidos.push(def);
            }
          }
          setServicios(enriquecidos);
        }
        if (d.equipo && d.equipo.length > 0) {
          setEmpleadas(
            d.equipo
              .filter((c: any) => {
                const nLower = (c.nombre || '').toLowerCase();
                return !nLower.includes('manicurista 4') && nLower !== '4';
              })
              .map(normalizarNombreYFotoEmpleada)
          );
        }
        if (d.config) {
          setSpaConfig((prev) => ({ ...prev, ...d.config }));
        }
        try {
          sessionStorage.setItem('mimate_bootstrap', JSON.stringify({ ...d, _ts: Date.now() }));
        } catch {}
      })
      .catch(() => {});

    try {
      const params = new URLSearchParams(window.location.search);
      const urlTel = params.get('tel') || params.get('telefono');
      if (urlTel) {
        const cleanUrlTel = urlTel.replace(/\D/g, '').replace(/^57/, '');
        setTelefono(cleanUrlTel);
      }
      const urlNombre = params.get('nombre');
      if (urlNombre) {
        setNombre(decodeURIComponent(urlNombre));
      }

      const rId = params.get('reagendar');
      if (rId) {
        setReagendarId(rId);
        fetch(`/api/reservas/${rId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data && !data.error) {
              const cliente = data.clientes;
              if (cliente?.nombre) setNombre(cliente.nombre);
              if (cliente?.telefono_wa) {
                const telRaw = cliente.telefono_wa.replace(/^57/, '');
                setTelefono(telRaw);
              }
              const cancha = data.canchas;
              const fInicio = new Date(data.fecha_inicio);
              const fStr = fInicio.toLocaleDateString('es-CO', {
                timeZone: 'America/Bogota',
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              const hStr = fInicio.toLocaleTimeString('es-CO', {
                timeZone: 'America/Bogota',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });

              let svcNom = data.servicio_nombre;
              if (!svcNom && data.notas) {
                const m = data.notas.match(/Servicio:\s*([^|[\n]+)/i);
                if (m && m[1]) svcNom = m[1].trim();
              }

              // Solo tomar el abono real pagado (abono_previo viene validado desde el backend)
              const abono = Number(data.abono_previo ?? 0);

              setCitaPreviaInfo({
                id: rId,
                fecha: fStr,
                hora: hStr,
                servicio: svcNom,
                manicurista: cancha?.nombre,
                abonoPrevio: abono,
                precioTotal: Number(data.valor_total) || 0,
              });
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  const slotsCacheRef = useRef<Map<string, { slots: string[]; aviso: string | null; ts: number }>>(new Map());

  const cargarSlots = async (f = fecha, emp = empleadaId, dur = duracionTotal || servicioSeleccionado?.duracion || 45) => {
    if (!f) return;

    const duracion = Math.max(15, dur);
    const cacheKey = `${f}_${emp || 'all'}_${duracion}_${reagendarId || ''}`;
    const cached = slotsCacheRef.current.get(cacheKey);
    const ahora = Date.now();

    // Cache de 60 segundos: respuesta inmediata sin parpadeo si la clienta vuelve a tocar la misma fecha
    if (cached && ahora - cached.ts < 60000) {
      setSlots(cached.slots);
      setAvisoSlots(cached.aviso);
      setCargandoSlots(false);
      return;
    }

    setCargandoSlots(true);
    setAvisoSlots(null);

    const dObj = new Date(`${f}T12:00:00-05:00`);
    const esDiciembre = f ? /^\d{4}-12-/.test(f.trim()) : false;
    if (dObj.getDay() === 0 && !esDiciembre) {
      const aviso = `Los domingos regulares estamos cerrados. Atendemos con amor de ${horarioTexto} (en Diciembre sí trabajamos domingos) 💕`;
      setSlots([]);
      setAvisoSlots(aviso);
      setCargandoSlots(false);
      slotsCacheRef.current.set(cacheKey, { slots: [], aviso, ts: ahora });
      return;
    }

    try {
      // 1. Intentar endpoint en backend
      const query = new URLSearchParams({
        date: f,
        duracion_minutos: String(duracion),
      });
      if (emp) query.set('cancha_id', emp);
      if (reagendarId) query.set('reagendar_id', reagendarId);

      const res = await fetch(`/api/spa/slots?${query.toString()}`);
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.slots)) {
          setSlots(d.slots);
          if (d.aviso) setAvisoSlots(d.aviso);
          slotsCacheRef.current.set(cacheKey, { slots: d.slots, aviso: d.aviso || null, ts: Date.now() });
          setCargandoSlots(false);
          return;
        }
      }
    } catch {
      // Si la API falla o está en reposo, consultar directamente a Supabase
    }

    // 2. Consulta en tiempo real en Supabase (Garantiza que citas o bloqueos dejen de aparecer inmediatamente)
    try {
      const aperturaStr = (spaConfig.horaApertura || '08:00').slice(0, 5);
      const cierreStr = (spaConfig.horaCierre || '19:00').slice(0, 5);
      const ahoraMs = Date.now();
      const horaCierreMs = new Date(`${f}T${cierreStr}:00-05:00`).getTime();
      const horaAperturaMs = new Date(`${f}T${aperturaStr}:00-05:00`).getTime();

      let listaEmp = empleadas;
      if (listaEmp.length === 0) {
        const { data: canchasDb } = await supabase.from('canchas').select('id, nombre').eq('activa', true);
        if (canchasDb && canchasDb.length > 0) {
          const filtradas = canchasDb
            .filter((c: any) => {
              const nLower = (c.nombre || '').toLowerCase();
              return !nLower.includes('manicurista 4') && nLower !== '4';
            })
            .map(normalizarNombreYFotoEmpleada);
          listaEmp = filtradas;
          setEmpleadas(filtradas);
        }
      }

      const inicioBuffer = new Date(new Date(`${f}T00:00:00-05:00`).getTime() - 6 * 60 * 60 * 1000).toISOString();
      const finBuffer = new Date(new Date(`${f}T23:59:59-05:00`).getTime() + 6 * 60 * 60 * 1000).toISOString();

      const { data: reservasOcupadas } = await supabase
        .from('reservas')
        .select('id, cancha_id, fecha_inicio, fecha_fin, estado, notas')
        .neq('estado', 'cancelada')
        .gte('fecha_inicio', inicioBuffer)
        .lte('fecha_inicio', finBuffer);

      // Excluir la reserva previa a reprogramar e hidratar horarios reales de citas traslapadas
      const ocupadas = (reservasOcupadas || [])
        .filter((r) => !reagendarId || r.id !== reagendarId)
        .map(hidratarHorarioRealReserva);

      let slotsLibres: string[] = [];
      if (emp) {
        slotsLibres = calcularSlotsClientaManicurista({
          fechaIso: f,
          canchaId: emp,
          duracionMinutos: duracion,
          reservasActivas: ocupadas,
          horaAperturaMs,
          horaCierreMs,
          ahoraMs,
        });
      } else {
        const unionSlots = new Set<string>();
        for (const e of listaEmp) {
          const slotsEmp = calcularSlotsClientaManicurista({
            fechaIso: f,
            canchaId: e.id,
            duracionMinutos: duracion,
            reservasActivas: ocupadas,
            horaAperturaMs,
            horaCierreMs,
            ahoraMs,
          });
          for (const s of slotsEmp) unionSlots.add(s);
        }
        slotsLibres = Array.from(unionSlots).sort();
      }

      setSlots(slotsLibres);
      const avisoCalculado = slotsLibres.length === 0
        ? 'No hay horarios disponibles para esta fecha con la duración de este servicio. Prueba con otro día 💕'
        : null;
      setAvisoSlots(avisoCalculado);
      slotsCacheRef.current.set(cacheKey, { slots: slotsLibres, aviso: avisoCalculado, ts: Date.now() });
    } catch (errSupabase) {
      console.error('Error calculando slots en Supabase:', errSupabase);
      setSlots([]);
      setAvisoSlots('No fue posible consultar la disponibilidad. Por favor intenta nuevamente.');
    } finally {
      setCargandoSlots(false);
    }
  };

  // Cargar slots cuando cambia la fecha, la empleada o la duración combinada total en el modal
  useEffect(() => {
    if (!modalAbierto || !fecha) return;
    setHoraSeleccionada(null);
    cargarSlots(fecha, empleadaId, duracionTotal);
  }, [modalAbierto, fecha, empleadaId, duracionTotal]);

  const abrirModal = (s: Servicio) => {
    setServicioSeleccionado(s);
    setServiciosExtras([]);
    setSelectorExtrasAbierto(false);
    setPaso(1);
    setHoraSeleccionada(null);
    setAvisoSlots(null);
    setMenuEspecialistaAbierto(false);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setServiciosExtras([]);
    setSelectorExtrasAbierto(false);
    setPaso(1);
    setHoraSeleccionada(null);
    setReservaConfirmada(null);
    setMenuEspecialistaAbierto(false);
  };

  const esCitaDiciembre = useMemo(() => {
    if (!fecha) return false;
    const match = fecha.trim().match(/^\d{4}-(\d{2})-\d{2}/);
    return match ? match[1] === '12' : false;
  }, [fecha]);

  const exigeAnticipoEfectivo = useMemo(() => {
    return Boolean(spaConfig.exigeAnticipo || esCitaDiciembre);
  }, [spaConfig.exigeAnticipo, esCitaDiciembre]);

  const handleConfirmarReserva = async () => {
    if (!servicioSeleccionado || !fecha || !horaSeleccionada || !telefono.trim() || !nombre.trim() || !aceptaPoliticas) return;

    setEnviandoReserva(true);

    try {
      const res = await fetch('/api/spa/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicio_nombre: nombreServiciosCombinados,
          precio: precioTotal,
          duracion_minutos: duracionTotal,
          fecha,
          hora: horaSeleccionada,
          cancha_id: empleadaId || undefined,
          cliente_nombre: nombre.trim(),
          cliente_telefono: telefono.trim(),
          reagendar_reserva_id: reagendarId || undefined,
          acepta_politicas: true,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        try {
          supabase.channel('mimate-reservas-realtime').send({
            type: 'broadcast',
            event: 'cambio-reservas',
            payload: { eventType: 'INSERT', timestamp: Date.now() },
          }).catch(() => {});
        } catch (e) {}
        const esReag = Boolean(data.esReagendamiento || reagendarId);
        const abonoPrev = Number(data.abonoPrevio ?? citaPreviaInfo?.abonoPrevio ?? 0);
        const montoFijo = Number(data.montoAnticipoFijo ?? spaConfig.montoAnticipoFijo ?? data.porcentajeAnticipo ?? spaConfig.porcentajeAnticipo ?? 20000);
        const antTotalParaTurno = exigeAnticipoEfectivo ? Math.min(precioTotal, montoFijo) : 0;
        const antFaltanteCalc = esReag ? Math.max(0, antTotalParaTurno - abonoPrev) : antTotalParaTurno;

        const antReq = typeof data.anticipoRequerido === 'number' ? data.anticipoRequerido : antFaltanteCalc;
        const esPre = Boolean(data.esPreReserva ?? (antReq > 0));
        const salRest = typeof data.saldoRestante === 'number'
          ? data.saldoRestante
          : Math.max(0, precioTotal - abonoPrev - antReq);

        setReservaConfirmada({
          codigo: data.codigoReserva || data.reserva?.id,
          empleada: data.empleada || 'Manicurista asignada',
          servicio: nombreServiciosCombinados,
          fecha,
          hora: horaSeleccionada,
          precio: precioTotal,
          telefono: telefono.trim(),
          esPreReserva: esPre,
          esReagendamiento: esReag,
          abonoPrevioReconocido: abonoPrev,
          montoAnticipoFijo: montoFijo,
          porcentajeAnticipo: montoFijo,
          anticipoRequerido: antReq,
          saldoRestante: salRest,
          nequi: data.nequiNumero || spaConfig.nequiNumero,
          bancolombia: data.bancolombiaNumero || spaConfig.bancolombiaNumero,
          llave: data.llaveNumero || spaConfig.llaveNumero,
          titular: data.titularCuenta || spaConfig.titularCuenta,
        });
        setPaso(3);
        cargarSlots(fecha, empleadaId, duracionTotal);
      } else {
        alert(data.error || 'Ocurrió un error al agendar tu cita.');
        cargarSlots(fecha, empleadaId, duracionTotal);
      }
    } catch {
      // Fallback directo en Supabase si la API backend está temporalmente inactiva
      try {
        let cleanPhone = String(telefono.trim()).replace(/\D/g, '');
        if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
          cleanPhone = `57${cleanPhone}`;
        }

        let clienteId: string | null = null;
        const { data: clienteExistente } = await supabase
          .from('clientes')
          .select('id')
          .eq('telefono_wa', cleanPhone)
          .maybeSingle();

        if (clienteExistente) {
          clienteId = clienteExistente.id;
        } else {
          const { data: clienteCreado } = await supabase
            .from('clientes')
            .insert({ telefono_wa: cleanPhone, nombre: nombre.trim() })
            .select('id')
            .single();
          if (clienteCreado) clienteId = clienteCreado.id;
        }

        const dInicio = new Date(`${fecha}T${horaSeleccionada}:00-05:00`);
        const dFin = new Date(dInicio.getTime() + (Number(duracionTotal) || 60) * 60 * 1000);
        const slotStartMs = dInicio.getTime();
        const slotEndMs = dFin.getTime();

        // Validar estrictamente que las clientas solo agenden dentro del horario configurado del spa
        const aperturaStrFb = (spaConfig.horaApertura || '08:00').slice(0, 5);
        const cierreStrFb = (spaConfig.horaCierre || '19:00').slice(0, 5);
        const horaAperturaFbMs = new Date(`${fecha}T${aperturaStrFb}:00-05:00`).getTime();
        const horaCierreFbMs = new Date(`${fecha}T${cierreStrFb}:00-05:00`).getTime();
        if (
          !isNaN(horaAperturaFbMs) &&
          !isNaN(horaCierreFbMs) &&
          (slotStartMs < horaAperturaFbMs || slotEndMs > horaCierreFbMs)
        ) {
          alert('El horario seleccionado está fuera del horario de atención del spa. Por favor elige un turno disponible.');
          cargarSlots(fecha, empleadaId, duracionTotal);
          return;
        }

        // Validar estrictamente que clientas respeten horario del spa, almuerzo y turnos dinámicos en modo respaldo
        const almuerzoFbStartMs = new Date(`${fecha}T12:00:00-05:00`).getTime();
        const almuerzoFbEndMs = new Date(`${fecha}T13:00:00-05:00`).getTime();
        if (slotStartMs < almuerzoFbEndMs && slotEndMs > almuerzoFbStartMs) {
          alert('El horario de 12:00 PM a 1:00 PM está bloqueado por hora de almuerzo.');
          cargarSlots(fecha, empleadaId, duracionTotal);
          return;
        }

        const inicioDiaFbMs = new Date(`${fecha}T00:00:00-05:00`).getTime() - 6 * 60 * 60 * 1000;
        const finDiaFbMs = new Date(`${fecha}T23:59:59-05:00`).getTime() + 6 * 60 * 60 * 1000;
        const winStart = new Date(Math.min(slotStartMs - 12 * 60 * 60 * 1000, inicioDiaFbMs)).toISOString();
        const winEnd = new Date(Math.max(slotEndMs + 12 * 60 * 60 * 1000, finDiaFbMs)).toISOString();
        const { data: reservasDiaFallback } = await supabase
          .from('reservas')
          .select('id, cancha_id, fecha_inicio, fecha_fin, notas')
          .neq('estado', 'cancelada')
          .gte('fecha_inicio', winStart)
          .lte('fecha_inicio', winEnd);

        const reservasDiaFbHidratadas = (reservasDiaFallback || [])
          .filter((r) => !reagendarId || r.id !== reagendarId)
          .map(hidratarHorarioRealReserva);

        const ocupadasIdsFallback = reservasDiaFbHidratadas
          .filter((r) => {
            const rStart = new Date(r.fecha_inicio).getTime();
            const rEnd = r.fecha_fin ? new Date(r.fecha_fin).getTime() : rStart + 45 * 60000;
            return rStart < slotEndMs && rEnd > slotStartMs;
          })
          .map((r) => r.cancha_id);

        const duracionFbMin = Number(duracionTotal) || 60;
        const ahoraFbMs = Date.now();
        const tieneSlotFbHabilitado = (maniId: string): boolean => {
          const slotsMani = calcularSlotsClientaManicurista({
            fechaIso: fecha,
            canchaId: maniId,
            duracionMinutos: duracionFbMin,
            reservasActivas: reservasDiaFbHidratadas,
            horaAperturaMs: horaAperturaFbMs,
            horaCierreMs: horaCierreFbMs,
            ahoraMs: ahoraFbMs,
          });
          return slotsMani.includes(horaSeleccionada);
        };

        let empAsignada: Empleada | undefined;
        if (empleadaId) {
          if (ocupadasIdsFallback.includes(empleadaId) || !tieneSlotFbHabilitado(empleadaId)) {
            alert('La manicurista seleccionada ya no tiene este horario habilitado. Por favor elige otra hora o especialista.');
            cargarSlots(fecha, empleadaId, duracionTotal);
            return;
          }
          empAsignada = empleadas.find((e) => e.id === empleadaId);
        } else {
          empAsignada = empleadas.find((e) => !ocupadasIdsFallback.includes(e.id) && tieneSlotFbHabilitado(e.id));
          if (!empAsignada) {
            alert('Lo sentimos, todos los turnos para este horario ya fueron reservados. Por favor selecciona otro horario.');
            cargarSlots(fecha, empleadaId, duracionTotal);
            return;
          }
        }

        const esReag = Boolean(reagendarId);
        const abonoPrev = Number(citaPreviaInfo?.abonoPrevio || 0);
        const montoFijoFallback = Number(spaConfig.montoAnticipoFijo || spaConfig.porcentajeAnticipo || 20000);
        const antTotalFallback = exigeAnticipoEfectivo ? Math.min(precioTotal, montoFijoFallback) : 0;
        const antReqFallback = esReag ? Math.max(0, antTotalFallback - abonoPrev) : antTotalFallback;
        const esPreFallback = antReqFallback > 0;
        const salRest = Math.max(0, precioTotal - abonoPrev - antReqFallback);

        if (empAsignada && clienteId) {
          const { error: insertErr } = await supabase.from('reservas').insert({
            cancha_id: empAsignada.id,
            cliente_id: clienteId,
            fecha_inicio: dInicio.toISOString(),
            fecha_fin: dFin.toISOString(),
            valor_total: precioTotal,
            valor_anticipo_requerido: antReqFallback,
            estado: esPreFallback ? 'pendiente_pago' : 'confirmada',
            expiracion_reserva: esPreFallback ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
            notas: `💅 Servicio: ${nombreServiciosCombinados} | Duración: ${duracionTotal} min | Clienta: ${nombre.trim()} | ${esReag ? (esPreFallback ? '[CITA_REAGENDADA_PENDIENTE_ANTICIPO]' : '[CITA_REAGENDADA_CONFIRMADA]') : 'Reserva Web JL Mímate Nails'}`,
          });

          if (insertErr) {
            if (insertErr.code === '23P01') {
              alert('Lo sentimos, este horario ya está ocupado. Por favor elige otro turno.');
              cargarSlots(fecha, empleadaId, duracionTotal);
              return;
            }
            throw insertErr;
          }

          if (reagendarId) {
            await supabase.from('reservas').delete().eq('id', reagendarId);
          }
        }

        setReservaConfirmada({
          codigo: 'WEB-' + Math.floor(1000 + Math.random() * 9000),
          empleada: empAsignada?.nombre || 'Manicurista asignada',
          servicio: nombreServiciosCombinados,
          fecha,
          hora: horaSeleccionada,
          precio: precioTotal,
          telefono: telefono.trim(),
          esPreReserva: esPreFallback,
          esReagendamiento: esReag,
          abonoPrevioReconocido: abonoPrev,
          montoAnticipoFijo: montoFijoFallback,
          porcentajeAnticipo: montoFijoFallback,
          anticipoRequerido: antReqFallback,
          saldoRestante: salRest,
          nequi: spaConfig.nequiNumero,
          bancolombia: spaConfig.bancolombiaNumero,
          llave: spaConfig.llaveNumero,
          titular: spaConfig.titularCuenta,
        });
        setPaso(3);
        cargarSlots(fecha, empleadaId);
      } catch (errDb) {
        console.error('Error insertando en Supabase:', errDb);
        alert('Ocurrió un error al agendar tu cita. Por favor intenta de nuevo.');
      }
    } finally {
      setEnviandoReserva(false);
    }
  };

  const serviciosFiltrados = useMemo(
    () => servicios.filter((s) => categoriaActiva === 'Todos' || s.categoria === categoriaActiva),
    [servicios, categoriaActiva]
  );

  return (
    <div className="min-h-screen bg-[#FFF5F7] text-[#2D2529] font-sans antialiased selection:bg-[#F3C6D3] selection:text-[#8C243B] relative">
      {/* Botón superior para acceder a la administración y turnos (solo se queda arriba, no persigue la pantalla) */}
      {onIrAlAdmin && (
        <button
          onClick={onIrAlAdmin}
          className="absolute top-3 right-3 z-20 text-[10px] font-medium tracking-wide text-[#665158] hover:text-[#8C243B] bg-white/75 hover:bg-white border border-[#F2C4D2]/80 hover:border-[#F2C4D2] px-3 py-1.5 rounded-full shadow-2xs backdrop-blur-md transition cursor-pointer flex items-center gap-1 opacity-70 hover:opacity-100"
          title="Acceso exclusivo al panel de turnos del equipo"
        >
          <span>Portal del Equipo & Admin</span>
        </button>
      )}

      {/* HERO SECTION CON IDENTIDAD VISUAL DEL PDF */}
      <section className="relative text-center pt-14 pb-16 px-4 bg-gradient-to-b from-[#FCE8EF] via-[#FDF0F4] to-[#FFF5F7] overflow-hidden border-b border-[#F4C9D5]/60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(199,75,102,0.12),transparent_70%)] pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto space-y-4">
          {/* LOGOTIPO OFICIAL EXTRAÍDO DE LA PÁGINA 1 DEL PDF */}
          <div className="relative w-44 h-44 sm:w-52 sm:h-52 mx-auto rounded-3xl overflow-hidden shadow-lg border-2 border-[#F2C4D2] bg-[#F9D2D9] transition-transform hover:scale-105 duration-300">
            <img
              src="/mimate-nails-logo.webp"
              alt="JL Mímate Nails - Spa de Uñas en Pereira Cuba"
              width={640}
              height={640}
              decoding="async"
              fetchPriority="high"
              className="w-full h-full object-cover"
            />
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#2D2529] tracking-tight">
            JL Mímate Nails
            <span className="block text-base sm:text-xl font-bold text-[#8C243B] mt-1 font-serif">
              Spa de Uñas en Pereira
            </span>
          </h1>
          <p className="text-sm sm:text-base text-[#665158] max-w-md mx-auto italic font-medium leading-relaxed">
            "Mímate como te lo mereces. ¡Uñas acrílicas, semipermanente y rubber siempre perfectas!"
          </p>

          <div className="flex items-center justify-center gap-2.5 pt-1 text-xs sm:text-sm font-semibold text-[#8C243B] tracking-wide">
            <span className="w-8 sm:w-12 h-px bg-[#F2C4D2]" />
            <span className="flex items-center gap-1.5">
              <IconSparkles className="w-3.5 h-3.5 text-[#A8324F]" />
              <span>Reserva tu cita en segundos</span>
            </span>
            <span className="w-8 sm:w-12 h-px bg-[#F2C4D2]" />
          </div>
        </div>
      </section>

      {/* CONTENEDOR PRINCIPAL */}
      <main className="max-w-3xl mx-auto px-4 pb-20 -mt-6 relative z-20 space-y-8">
        {/* BANNER INFORMATIVO SI VIENE DESDE WHATSAPP PARA REAGENDAR */}
        {reagendarId && (
          <div className="bg-gradient-to-r from-[#8C243B] via-[#A82B47] to-[#C74B66] text-white p-4 sm:p-5 rounded-2xl shadow-md border border-[#F2C4D2] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-xl backdrop-blur-xs">
                🔄
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="font-extrabold text-sm sm:text-base">Modo Reagendamiento</p>
                  <span className="bg-emerald-500/90 text-white text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold">
                    Abono Reconocido ✓
                  </span>
                </div>
                <p className="text-xs text-pink-100 leading-relaxed">
                  {citaPreviaInfo ? (
                    <>
                      Cita previa: <strong>{citaPreviaInfo.fecha} a las {formatearHora12h(citaPreviaInfo.hora)}</strong> con {citaPreviaInfo.manicurista || 'especialista'}
                      {citaPreviaInfo.servicio ? ` (${citaPreviaInfo.servicio})` : ''}.{' '}
                      {citaPreviaInfo.abonoPrevio ? (
                        <span>Abono transferible: <strong>${citaPreviaInfo.abonoPrevio.toLocaleString('es-CO')} COP</strong>.{' '}</span>
                      ) : ''}
                    </>
                  ) : ''}
                  Elige tu nuevo horario o servicio abajo. ¡Tu abono se transfiere 100% y tu nueva cita se confirmará de inmediato sin pagar de nuevo!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* FILA DE 3 TARJETAS FLOTANTES DE INFORMACIÓN */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a
            href={obtenerUrlMapaSpa()}
            target="_blank"
            rel="noreferrer"
            className="bg-white border border-[#F2C4D2] hover:border-[#8C243B] rounded-2xl p-4 text-center shadow-xs space-y-1 block transition group cursor-pointer hover:shadow-sm"
            title="Toca para abrir la ubicación en Google Maps o Apple Maps"
          >
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#A8324F] block">
              Dónde
            </span>
            <p className="text-xs font-bold text-[#2D2529] group-hover:text-[#8C243B] flex items-center justify-center gap-1 transition">
              <IconMapPin className="w-3.5 h-3.5 text-[#A8324F] group-hover:scale-110 transition shrink-0" />
              Pereira, Cuba (Cl. 66 #26-57)
            </p>
            <p className="text-[11px] text-[#8C243B] font-semibold flex items-center justify-center gap-1 group-hover:underline">
              <span>Abrir en mapas</span>
              <span className="text-[10px]">📍</span>
            </p>
          </a>

          <div className="bg-white border border-[#F2C4D2] rounded-2xl p-4 text-center shadow-xs space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#A8324F] block">
              Horarios
            </span>
            <p className="text-xs font-bold text-[#2D2529] flex items-center justify-center gap-1">
              <IconClock className="w-3.5 h-3.5 text-[#A8324F] shrink-0" />
              {horarioTexto}
            </p>
            <p className="text-[11px] text-[#665158]">Domingos cerrado (Diciembre abierto)</p>
          </div>

          <div className="bg-white border border-[#F2C4D2] rounded-2xl p-4 text-center shadow-xs space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#A8324F] block">
              WhatsApp
            </span>
            <a
              href="https://wa.me/573219610896"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-[#8C243B] hover:text-[#A8324F] flex items-center justify-center gap-1 transition"
            >
              <IconBrandWhatsapp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              321 961 0896 💬
            </a>
            <p className="text-[11px] text-[#665158]">Atención y dudas</p>
          </div>
        </div>

        {/* SECCIÓN NUESTRO EQUIPO (LILI, JHOANA, MANUELA, MANICURISTA 4) */}
        <section className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-[#2D2529] flex items-center justify-center gap-2 font-serif">
              <span>Nuestro</span>
              <span className="italic text-[#A8324F] font-serif font-bold">equipo de especialistas</span>
            </h2>
            <p className="text-xs text-[#665158]">
              Profesionales dedicadas listas para consentirte y transformar tus uñas 💕
            </p>
          </div>

          <div className="flex items-center justify-center gap-3.5 sm:gap-7 overflow-x-auto pb-2 pt-1">
            {empleadas.map((emp) => {
              const foto = emp.foto || FOTOS_EQUIPO_MIMATE[emp.nombre.toLowerCase()];
              const estaSeleccionada = empleadaId === emp.id;
              return (
                <div
                  key={emp.id}
                  onClick={() => {
                    setEmpleadaId(emp.id);
                  }}
                  className="text-center w-20 sm:w-24 shrink-0 space-y-1.5 group cursor-pointer transition-transform hover:-translate-y-1"
                >
                  <div
                    className={`relative w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full p-0.5 shadow-md group-hover:shadow-lg transition aspect-square shrink-0 ${
                      estaSeleccionada
                        ? 'bg-[#8C243B] ring-2 ring-[#8C243B] ring-offset-2'
                        : 'bg-gradient-to-tr from-[#C74B66] via-[#F2C4D2] to-[#FFF5F7]'
                    }`}
                  >
                    <div className="w-full h-full bg-white rounded-full overflow-hidden flex items-center justify-center border-2 border-white aspect-square">
                      {foto ? (
                        <img
                          src={foto.replace(/\.jpe?g$/i, '.webp')}
                          alt={emp.nombre}
                          width={180}
                          height={180}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-center aspect-square group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#FFF5F7] flex flex-col items-center justify-center text-[#8C243B] font-bold aspect-square">
                          <span className="text-xl">💅</span>
                          <span className="text-[10px] text-[#665158] font-semibold">{emp.nombre}</span>
                        </div>
                      )}
                    </div>
                    <span className="absolute bottom-0 right-0 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white border border-[#F2C4D2] shadow-2xs flex items-center justify-center text-[9px] sm:text-[10px]">
                      ✨
                    </span>
                  </div>
                  <div>
                    <span
                      className={`text-xs sm:text-sm font-bold block leading-tight transition ${
                        estaSeleccionada ? 'text-[#8C243B]' : 'text-[#2D2529] group-hover:text-[#8C243B]'
                      }`}
                    >
                      {emp.nombre}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECCIÓN ELIGE TU SERVICIO + CATEGORÍAS */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-[#2D2529] flex items-center justify-center gap-1.5">
            <span>Elige tu</span>
            <span className="italic text-[#A8324F] font-serif font-bold">servicio</span>
          </h2>

          {/* Chips de Categorías con Scroll Horizontal */}
          <div className="sticky top-0 z-20 bg-[#FFF5F7]/95 backdrop-blur-md py-2 -mx-4 px-4 flex gap-2 overflow-x-auto border-b border-[#F2C4D2]/70 scrollbar-none">
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaActiva(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  categoriaActiva === cat
                    ? 'bg-[#8C243B] text-white shadow-xs'
                    : 'bg-white border border-[#F2C4D2] text-[#665158] hover:border-[#C74B66]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Lista de Servicios */}
          <div className="space-y-3">
            {serviciosFiltrados.map((s) => (
              <div
                key={s.id}
                className="bg-white border border-[#F2C4D2] hover:border-[#C74B66] rounded-2xl p-4 shadow-xs transition hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-[#2D2529]">
                      {s.nombre}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FCE8EF] text-[#8C243B]">
                      {formatearDuracion(s.duracion)}
                    </span>
                  </div>
                  <p className="text-xs text-[#665158] max-w-md leading-relaxed">
                    {s.descripcion}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#FCE8EF]">
                  <span className="text-base font-extrabold text-[#8C243B] font-mono">
                    ${obtenerPrecioServicioParaFecha(s).toLocaleString('es-CO')}
                  </span>
                  <button
                    onClick={() => abrirModal(s)}
                    className="px-4 py-2 bg-[#8C243B] hover:bg-[#731D30] text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Agendar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN SEO LOCAL: POR QUÉ ELEGIRNOS EN PEREIRA */}
        <section className="mt-14 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#2D2529]">
              El Mejor Spa de Uñas en Pereira (Cuba)
            </h2>
            <p className="text-xs sm:text-sm text-[#665158] max-w-xl mx-auto">
              En <strong className="text-[#8C243B]">JL Mímate Nails</strong> cuidamos la salud y estética de tus manos y pies con productos de alta gama y técnicas avanzadas en el corazón de Cuba, Pereira.
            </p>
          </div>

          {/* TARJETAS DE VALOR SEO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-4 rounded-2xl bg-white/80 border border-[#F2C4D2] shadow-xs space-y-1.5">
              <div className="flex items-center gap-2 text-[#8C243B] font-bold text-sm">
                <IconSparkles className="w-4 h-4 text-[#A8324F]" />
                <h3>Especialistas en Acrílico y Rubber</h3>
              </div>
              <p className="text-xs text-[#665158] leading-relaxed">
                Técnicas modernas en acrílico esculpido, nivelación base rubber, dipping y press on con acabado natural y máxima durabilidad.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/80 border border-[#F2C4D2] shadow-xs space-y-1.5">
              <div className="flex items-center gap-2 text-[#8C243B] font-bold text-sm">
                <IconCheck className="w-4 h-4 text-emerald-600" />
                <h3>Bioseguridad y Esterilización 100%</h3>
              </div>
              <p className="text-xs text-[#665158] leading-relaxed">
                Herramientas desinfectadas y esterilizadas rigurosamente bajo protocolos de grado hospitalario para garantizar tu seguridad y bienestar.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/80 border border-[#F2C4D2] shadow-xs space-y-1.5">
              <div className="flex items-center gap-2 text-[#8C243B] font-bold text-sm">
                <IconCalendar className="w-4 h-4 text-[#8C243B]" />
                <h3>Citas Online Inmediatas</h3>
              </div>
              <p className="text-xs text-[#665158] leading-relaxed">
                Agenda tu cita 24/7 en segundos sin esperas. Elige tu especialista, el servicio exacto y el horario que mejor se adapte a tu día.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/80 border border-[#F2C4D2] shadow-xs space-y-1.5">
              <div className="flex items-center gap-2 text-[#8C243B] font-bold text-sm">
                <IconMapPin className="w-4 h-4 text-[#A8324F]" />
                <h3>Ubicación Fácil y Accesible</h3>
              </div>
              <p className="text-xs text-[#665158] leading-relaxed">
                Calle 66 bis #26-57, Cuba, Pereira, Risaralda. Sector central, cómodo y de fácil acceso en transporte público o vehículo particular.
              </p>
            </div>
          </div>

          {/* PREGUNTAS FRECUENTES (FAQ ACORDION - SEO RICH SNIPPETS) */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white/90 border border-[#F2C4D2] shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <IconSparkles className="w-5 h-5 text-[#8C243B]" />
              <h3 className="text-base sm:text-lg font-extrabold text-[#2D2529]">
                Preguntas Frecuentes sobre Spa de Uñas en Pereira
              </h3>
            </div>

            <div className="divide-y divide-[#FCE8EF]">
              {[
                {
                  id: 1,
                  q: "¿Dónde queda ubicado el spa de uñas JL Mímate Nails en Pereira?",
                  a: "Estamos ubicados en Calle 66 bis #26-57, sector Cuba, Pereira, Risaralda, Colombia. Atendemos de Lunes a Sábado de 9:30 am a 5:30 pm con cita previa para garantizarte una atención exclusiva y puntual."
                },
                {
                  id: 2,
                  q: "¿Qué servicios de uñas ofrecen en JL Mímate Nails?",
                  a: "Ofrecemos manicure y pedicure tradicional, esmaltado semipermanente, nivelación con base rubber, dipping, press on y uñas acrílicas esculpidas (barrido, retoque y esculpido completo), además de servicios especializados para hombre y retiro seguro."
                },
                {
                  id: 3,
                  q: "¿Cómo puedo agendar una cita en JL Mímate Nails Pereira?",
                  a: "Puedes agendar directamente desde esta página web seleccionando tu servicio favorito, fecha y hora disponible. Si se requiere abono de confirmación, podrás realizarlo fácilmente a través de Nequi o Bancolombia para asegurar tu espacio de inmediato."
                },
                {
                  id: 4,
                  q: "¿Cuánto dura un servicio de uñas semipermanentes o acrílicas?",
                  a: "La duración varía según el procedimiento: un manicure semipermanente toma aproximadamente 90 minutos, mientras que las uñas acrílicas esculpidas toman 120 minutos. Cada reserva en nuestro sistema aparta el tiempo exacto para una aplicación impecable."
                }
              ].map(faq => (
                <div key={faq.id} className="py-3">
                  <button
                    onClick={() => setFaqAbierto(faqAbierto === faq.id ? null : faq.id)}
                    className="w-full flex items-center justify-between text-left gap-3 text-xs sm:text-sm font-bold text-[#2D2529] hover:text-[#8C243B] transition cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="text-[#8C243B] shrink-0 font-bold text-base">
                      {faqAbierto === faq.id ? '−' : '+'}
                    </span>
                  </button>
                  <p
                    className={
                      faqAbierto === faq.id
                        ? 'mt-2 text-xs text-[#665158] leading-relaxed pl-1 border-l-2 border-[#8C243B]'
                        : 'hidden'
                    }
                  >
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>

            {/* CAJA MAPS & CONTACTO */}
            <div className="pt-3 border-t border-[#FCE8EF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#665158]">
              <div className="flex items-center gap-1.5">
                <IconMapPin className="w-4 h-4 text-[#8C243B] shrink-0" />
                <span>Calle 66 bis #26-57, Cuba, Pereira</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href="https://maps.app.goo.gl/KdSvqi1b2iAe5xgg8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#8C243B] hover:underline flex items-center gap-1"
                >
                  <span>Ver en Google Maps</span>
                  <span>↗</span>
                </a>
                <span className="text-gray-300">|</span>
                <a
                  href="tel:+573219610896"
                  className="font-bold text-[#8C243B] hover:underline"
                >
                  +57 321 961 0896
                </a>
                <span className="text-gray-300">|</span>
                <a
                  href="https://www.instagram.com/mimate.nais/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#8C243B] hover:underline flex items-center gap-1"
                  title="Instagram @mimate.nais"
                >
                  <IconBrandInstagram className="w-3.5 h-3.5 text-[#A8324F]" />
                  <span>@mimate.nais</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="text-center py-8 px-4 text-xs text-[#665158] border-t border-[#F2C4D2]/60 space-y-3 bg-white/40">
        <p className="font-semibold text-[#8C243B] text-sm tracking-wide">
          JL Mímate Nails Spa ✦
        </p>

        {/* Enlaces Legales Discretos */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[#665158]">
          <button
            type="button"
            onClick={() => setModalLegalTab('datos')}
            className="hover:text-[#8C243B] hover:underline cursor-pointer transition-colors"
          >
            Tratamiento de Datos (Ley 1581)
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setModalLegalTab('terminos')}
            className="hover:text-[#8C243B] hover:underline cursor-pointer transition-colors"
          >
            Términos y Cancelaciones (Ley 1480)
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setModalLegalTab('aviso')}
            className="hover:text-[#8C243B] hover:underline cursor-pointer transition-colors"
          >
            Aviso Legal & PQR
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setModalLegalTab('seguridad')}
            className="hover:text-[#8C243B] hover:underline cursor-pointer transition-colors"
          >
            Seguridad (Ley 1273)
          </button>
        </div>

        <div className="flex items-center justify-center">
          <a
            href="https://www.instagram.com/mimate.nais/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#F2C4D2] hover:border-[#C74B66] text-[#8C243B] hover:text-[#A8324F] font-semibold text-xs transition-all shadow-xs hover:shadow-sm group cursor-pointer"
            title="Síguenos en Instagram @mimate.nais"
          >
            <IconBrandInstagram className="w-4 h-4 text-[#A8324F] group-hover:scale-110 transition-transform" />
            <span>@mimate.nais</span>
            <span className="text-[10px] text-[#665158] group-hover:text-[#A8324F] transition-colors">↗</span>
          </a>
        </div>

        <p className="text-[11px]">
          Calle 66 bis #26-57, Sector Cuba · Pereira, Risaralda · Colombia · {horarioTexto}
        </p>

        {/* Reconocimiento Devmake */}
        <div className="pt-2 border-t border-[#F2C4D2]/40 text-[11px] text-[#665158] flex items-center justify-center gap-1">
          <span>Desarrollado y gestionado por</span>
          <a
            href="https://devmake.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#8C243B] hover:text-[#A8324F] underline transition-colors"
          >
            Devmake (Developers Maven Kernel)
          </a>
        </div>
      </footer>

      {/* MODAL BOTTOM SHEET DE RESERVA (IDÉNTICO A LASHES PEREIRA) */}
      <AnimatePresence>
        {modalAbierto && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-[#FFF5F7] border border-[#F2C4D2] w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
            >
              {/* Header Modal */}
              <div className="p-4 sm:p-5 border-b border-[#F2C4D2] bg-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold tracking-widest uppercase text-[#A8324F] block">
                    {paso === 3 ? '¡Listo!' : `Paso ${paso} de 2`}
                  </span>
                  <h3 className="font-bold text-sm sm:text-base text-[#2D2529]">
                    {servicioSeleccionado?.nombre}
                  </h3>
                </div>
                <button
                  onClick={cerrarModal}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                >
                  <IconX className="w-5 h-5" />
                </button>
              </div>

              {/* Contenido según el paso */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
                {/* PASO 1: SELECCIÓN DE FECHA Y HORARIO */}
                {paso === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-[#2D2529] flex items-center gap-1.5">
                        <span>¿Cuándo te</span>
                        <span className="italic text-[#A8324F] font-serif font-bold">esperamos?</span>
                      </h2>
                      <p className="text-xs text-[#665158]">
                        Elige tu especialista, servicios adicionales y fecha deseada 💕
                      </p>
                    </div>

                    {/* SECCIÓN SERVICIOS EXTRA / ADICIONALES */}
                    <div className="bg-[#FFF5F7] border-2 border-[#F2C4D2] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
                      {/* Cabecera y Servicios seleccionados (intercambiado arriba) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm sm:text-base font-extrabold text-[#8C243B] flex items-center gap-2">
                            <span className="text-lg">💅</span>
                            <span>Servicios en tu cita</span>
                            <span className="bg-[#FCE8EF] text-[#8C243B] text-xs font-black px-2.5 py-0.5 rounded-full border border-[#F2C4D2]">
                              {todosLosServicios.length}
                            </span>
                          </span>
                        </div>

                        {/* Chips de servicios ya seleccionados (arriba donde antes estaba el botón) */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {/* Principal */}
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#F2C4D2] text-[#2D2529] rounded-xl text-xs sm:text-sm font-semibold shadow-xs">
                            <span className="text-[#A8324F]">✨</span>
                            <span className="font-bold">{servicioSeleccionado?.nombre}</span>
                            <span className="text-xs text-[#665158] font-medium bg-[#FFF5F7] px-2 py-0.5 rounded-md border border-[#F2C4D2]/60">
                              {formatearDuracion(servicioSeleccionado?.duracion || 60)} · ${obtenerPrecioServicioParaFecha(servicioSeleccionado, fecha).toLocaleString('es-CO')}
                            </span>
                          </div>

                          {/* Extras */}
                          {serviciosExtras.map((extra) => (
                            <div
                              key={extra.id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FCE8EF] border border-[#C74B66]/40 text-[#8C243B] rounded-xl text-xs sm:text-sm font-semibold shadow-xs animate-in fade-in duration-200"
                            >
                              <span className="font-bold">+</span>
                              <span className="font-bold">{extra.nombre}</span>
                              <span className="text-xs text-[#8C243B]/80 font-medium bg-white/80 px-2 py-0.5 rounded-md border border-[#F2C4D2]">
                                +{extra.duracion} min · +${obtenerPrecioServicioParaFecha(extra, fecha).toLocaleString('es-CO')}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleServicioExtra(extra)}
                                className="w-5 h-5 rounded-full bg-white/80 hover:bg-red-50 text-[#8C243B] hover:text-red-700 font-bold flex items-center justify-center text-xs transition cursor-pointer ml-1"
                                title="Eliminar este servicio"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Botón para agregar otro servicio (intercambiado en la posición principal de servicios) */}
                      <button
                        type="button"
                        onClick={() => setSelectorExtrasAbierto(!selectorExtrasAbierto)}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer border-2 ${
                          selectorExtrasAbierto
                            ? 'bg-[#8C243B] text-white border-[#8C243B] shadow-sm'
                            : 'bg-white hover:bg-[#FDF0F4] text-[#8C243B] border-[#F2C4D2] hover:border-[#8C243B]'
                        }`}
                      >
                        <span className="text-lg leading-none font-extrabold">+</span>
                        <span className="tracking-wide">Agregar otro servicio</span>
                        <IconChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            selectorExtrasAbierto ? 'rotate-180 text-white' : 'text-[#8C243B]'
                          }`}
                        />
                      </button>

                      {/* Selector desplegable de extras */}
                      <AnimatePresence>
                        {selectorExtrasAbierto && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-white border-2 border-[#F2C4D2] rounded-2xl p-2.5 max-h-60 overflow-y-auto space-y-2 shadow-md"
                          >
                            <p className="text-xs font-bold text-[#665158] px-2 py-1">
                              Toca para agregar o quitar servicios adicionales a tu cita:
                            </p>
                            {servicios
                              .filter((s) => s.id !== servicioSeleccionado?.id)
                              .map((s) => {
                                const yaAgregado = serviciosExtras.some((x) => x.id === s.id);
                                return (
                                  <div
                                    key={s.id}
                                    onClick={() => toggleServicioExtra(s)}
                                    className={`p-3 rounded-xl flex items-center justify-between text-sm cursor-pointer transition border ${
                                      yaAgregado
                                        ? 'bg-[#FCE8EF] border-[#8C243B] text-[#8C243B] font-bold shadow-2xs'
                                        : 'hover:bg-[#FFF5F7] border-transparent hover:border-[#F2C4D2] text-[#2D2529]'
                                    }`}
                                  >
                                    <div>
                                      <p className="font-bold text-sm sm:text-base text-[#2D2529]">{s.nombre}</p>
                                      <p className="text-xs text-[#665158]">
                                        {s.categoria} · {s.duracion} min
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono font-bold text-sm sm:text-base text-[#8C243B]">
                                        +${obtenerPrecioServicioParaFecha(s, fecha).toLocaleString('es-CO')}
                                      </span>
                                      <span
                                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm transition ${
                                          yaAgregado
                                            ? 'bg-[#8C243B] text-white shadow-xs'
                                            : 'bg-white border-2 border-[#F2C4D2] text-[#665158]'
                                        }`}
                                      >
                                        {yaAgregado ? '✓' : '+'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Barra de Total en Vivo */}
                      <div className="pt-3 border-t border-[#F2C4D2] flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-[#665158] font-bold text-xs sm:text-sm">
                          Total estimado de tu cita:
                        </span>
                        <div className="flex items-center gap-3 sm:gap-4 font-bold">
                          <span className="text-[#2D2529] flex items-center gap-1.5 font-mono text-xs sm:text-sm bg-white px-2.5 py-1 rounded-lg border border-[#F2C4D2]">
                            <IconClock className="w-4 h-4 text-[#A8324F]" />
                            {formatearDuracion(duracionTotal)}
                          </span>
                          <span className="text-[#8C243B] font-mono text-base sm:text-lg font-black">
                            ${precioTotal.toLocaleString('es-CO')} COP
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 relative">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#665158] block">
                        Especialista de uñas
                      </label>
                      <button
                        type="button"
                        onClick={() => setMenuEspecialistaAbierto(!menuEspecialistaAbierto)}
                        className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#2D2529] flex items-center justify-between hover:border-[#C74B66] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20 transition shadow-xs cursor-pointer text-left"
                      >
                        <span className="truncate flex items-center gap-2">
                          {(() => {
                            const empSel = empleadas.find((e) => e.id === empleadaId);
                            if (!empSel) return <span>Cualquiera disponible (Recomendado)</span>;
                            const foto = empSel.foto || FOTOS_EQUIPO_MIMATE[empSel.nombre.toLowerCase()];
                            return (
                              <>
                                {foto ? (
                                  <img src={foto} alt={empSel.nombre} className="w-5 h-5 rounded-full object-cover border border-[#F2C4D2] shrink-0" />
                                ) : (
                                  <span>💅</span>
                                )}
                                <span>{empSel.nombre}</span>
                              </>
                            );
                          })()}
                        </span>
                        <IconChevronDown
                          className={`w-4 h-4 text-[#A8324F] shrink-0 transition-transform duration-200 ${
                            menuEspecialistaAbierto ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <AnimatePresence>
                        {menuEspecialistaAbierto && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#F2C4D2] rounded-xl shadow-lg z-30 py-1.5 max-h-48 overflow-y-auto"
                          >
                            <div
                              onClick={() => {
                                setEmpleadaId('');
                                setMenuEspecialistaAbierto(false);
                              }}
                              className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                                !empleadaId
                                  ? 'bg-[#FCE8EF] text-[#8C243B] font-bold'
                                  : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                              }`}
                            >
                              <span>Cualquiera disponible (Recomendado)</span>
                              {!empleadaId && <IconCheck className="w-4 h-4 text-[#8C243B]" />}
                            </div>
                            {empleadas.map((emp) => {
                              const sel = empleadaId === emp.id;
                              const foto = emp.foto || FOTOS_EQUIPO_MIMATE[emp.nombre.toLowerCase()];
                              return (
                                <div
                                  key={emp.id}
                                  onClick={() => {
                                    setEmpleadaId(emp.id);
                                    setMenuEspecialistaAbierto(false);
                                  }}
                                  className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                                    sel
                                      ? 'bg-[#FCE8EF] text-[#8C243B] font-bold'
                                      : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    {foto ? (
                                      <img src={foto} alt={emp.nombre} className="w-6 h-6 rounded-full object-cover border border-[#F2C4D2] shrink-0" />
                                    ) : (
                                      <span className="w-6 h-6 rounded-full bg-[#FFF5F7] text-[#8C243B] text-xs flex items-center justify-center shrink-0">💅</span>
                                    )}
                                    <span>{emp.nombre}</span>
                                  </div>
                                  {sel && <IconCheck className="w-4 h-4 text-[#8C243B]" />}
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Selector de fecha responsive con atajos y calendario nativo */}
                    <div className="space-y-2 relative" ref={contenedorCalendarioRef}>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#665158] block">
                          Fecha
                        </label>
                        <span className="text-[10px] text-[#A8324F] font-medium hidden sm:inline">
                          Toca para cambiar de día
                        </span>
                      </div>

                      {/* Botón interactivo táctil para abrir/cerrar calendario */}
                      <button
                        type="button"
                        onClick={() => setCalendarioAbierto((prev) => !prev)}
                        className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#2D2529] flex items-center justify-between shadow-xs transition cursor-pointer active:scale-[0.99] ${
                          calendarioAbierto
                            ? 'border-[#8C243B] ring-2 ring-[#C74B66]/20'
                            : 'border-[#F2C4D2] hover:border-[#C74B66]'
                        }`}
                        aria-label="Seleccionar fecha"
                        aria-expanded={calendarioAbierto}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <IconCalendar className="w-4 h-4 text-[#A8324F] shrink-0" />
                          <span className="font-bold text-[#2D2529] truncate capitalize">
                            {formatearFechaElegante(fecha)}
                          </span>
                        </div>
                        <IconChevronDown
                          className={`w-4 h-4 text-[#665158] shrink-0 transition-transform duration-200 ${
                            calendarioAbierto ? 'rotate-180 text-[#8C243B]' : ''
                          }`}
                        />
                      </button>

                      {/* Dropdown de Calendario con los tonos oficiales de JL Mímate Nails */}
                      <AnimatePresence>
                        {calendarioAbierto && (
                          <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 right-0 sm:left-auto sm:right-auto sm:w-[350px] mt-2 bg-white/98 backdrop-blur-md border border-[#F2C4D2] rounded-2xl shadow-2xl z-50 p-4 space-y-3"
                          >
                            {/* Cabecera del mes y controles */}
                            <div className="flex items-center justify-between pb-2 border-b border-[#FCE8EF]">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#FFF0F4] text-[#8C243B] flex items-center justify-center">
                                  <IconCalendar className="w-4 h-4 text-[#A8324F]" />
                                </div>
                                <span className="font-serif font-bold text-sm text-[#2D2529] capitalize">
                                  {nombreMesAño}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => cambiarMes(-1)}
                                  disabled={!puedeIrMesAnterior}
                                  className={`p-1.5 rounded-lg transition ${
                                    puedeIrMesAnterior
                                      ? 'hover:bg-[#FCE8EF] text-[#8C243B] cursor-pointer active:scale-95'
                                      : 'text-gray-300 cursor-not-allowed'
                                  }`}
                                  title="Mes anterior"
                                >
                                  <IconChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={irAHoy}
                                  className="px-2 py-1 text-[10px] font-bold text-[#8C243B] bg-[#FFF0F4] hover:bg-[#8C243B] hover:text-white rounded-md transition cursor-pointer"
                                  title="Ir al día de hoy"
                                >
                                  Hoy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cambiarMes(1)}
                                  disabled={!puedeIrMesSiguiente}
                                  className={`p-1.5 rounded-lg transition ${
                                    puedeIrMesSiguiente
                                      ? 'hover:bg-[#FCE8EF] text-[#8C243B] cursor-pointer active:scale-95'
                                      : 'text-gray-300 cursor-not-allowed opacity-35'
                                  }`}
                                  title={puedeIrMesSiguiente ? 'Siguiente mes' : 'Solo puedes reservar para el mes actual y el siguiente'}
                                >
                                  <IconChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Días de la semana */}
                            <div className="grid grid-cols-7 text-center text-[10px] font-extrabold uppercase tracking-wider text-[#665158]">
                              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, idx) => (
                                <div
                                  key={d}
                                  className={`py-1 ${idx === 6 ? 'text-[#A8324F]' : ''}`}
                                >
                                  {d}
                                </div>
                              ))}
                            </div>

                            {/* Cuadrícula de fechas */}
                            <div className="grid grid-cols-7 gap-1">
                              {diasCalendario.map((d, idx) => {
                                if (d.tipo === 'prev' || d.tipo === 'next') {
                                  return (
                                    <div
                                      key={`filler-${idx}`}
                                      className="h-9 flex items-center justify-center text-xs text-slate-300 font-medium select-none"
                                    >
                                      {d.diaNum}
                                    </div>
                                  );
                                }

                                const esPasado = d.iso < hoyStr;
                                const esFuturoBloqueado = d.iso > maxFechaIso;
                                const deshabilitado = esPasado || esFuturoBloqueado;
                                const esSeleccionado = d.iso === fecha;
                                const esHoy = d.iso === hoyStr;
                                const esDiciembre = d.iso ? /^\d{4}-12-/.test(d.iso) : false;
                                const esDomingo = d.dayOfWeek === 0;
                                const esDomingoCerrado = esDomingo && !esDiciembre;

                                return (
                                  <button
                                    key={d.iso}
                                    type="button"
                                    disabled={deshabilitado}
                                    onClick={() => {
                                      setFecha(d.iso);
                                      setCalendarioAbierto(false);
                                    }}
                                    className={`relative h-9 w-full rounded-xl flex flex-col items-center justify-center text-xs transition ${
                                      deshabilitado ? 'cursor-not-allowed' : 'cursor-pointer'
                                    } ${
                                      esSeleccionado
                                        ? 'bg-gradient-to-tr from-[#8C243B] to-[#C74B66] text-white font-extrabold shadow-sm scale-105 z-10'
                                        : deshabilitado
                                        ? 'text-gray-300 opacity-30 select-none'
                                        : esDomingoCerrado
                                        ? 'text-slate-400 hover:bg-slate-50 border border-dashed border-slate-200'
                                        : 'text-[#2D2529] hover:bg-[#FFF0F4] hover:text-[#8C243B] font-semibold'
                                    } ${
                                      esHoy && !esSeleccionado
                                        ? 'border border-[#C74B66] text-[#8C243B] bg-[#FFF5F7] font-bold'
                                        : ''
                                    }`}
                                    title={
                                      esPasado
                                        ? 'Fecha pasada'
                                        : esFuturoBloqueado
                                        ? 'Solo disponible para el mes en curso y el siguiente'
                                        : esDomingoCerrado
                                        ? 'Domingo (Cerrado)'
                                        : esDomingo && esDiciembre
                                        ? 'Domingo (Habilitado temporada Diciembre)'
                                        : d.iso
                                    }
                                  >
                                    <span className="leading-none">{d.diaNum}</span>
                                    {esDomingoCerrado && !esSeleccionado && !deshabilitado && (
                                      <span className="text-[7px] leading-none text-slate-400 mt-0.5">cerrado</span>
                                    )}
                                    {esDomingo && esDiciembre && !esSeleccionado && !deshabilitado && (
                                      <span className="text-[7px] leading-none text-amber-700 font-bold mt-0.5">abierto</span>
                                    )}
                                    {esHoy && !esSeleccionado && !esDomingoCerrado && (
                                      <span className="w-1 h-1 rounded-full bg-[#C74B66] mt-0.5" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Pie de leyenda */}
                            <div className="pt-2 border-t border-[#FCE8EF] flex items-center justify-between text-[11px] text-[#665158]">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[#C74B66]" />
                                <span>Lun–Sáb disponible</span>
                              </div>
                              <span className="text-[10px] text-[#8C243B] bg-[#FFF0F4] px-2 py-0.5 rounded-full font-medium">
                                Agenda abierta: Mes actual y siguiente 💕
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Píldoras rápidas de fechas (scroll horizontal) */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-0.5 px-0.5">
                        {diasRapidos.map((d) => {
                          const activa = fecha === d.iso;
                          return (
                            <button
                              key={d.iso}
                              type="button"
                              onClick={() => setFecha(d.iso)}
                              className={`shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center min-w-[54px] cursor-pointer border ${
                                activa
                                  ? 'bg-[#8C243B] text-white border-[#8C243B] shadow-xs'
                                  : d.esDomingoCerrado
                                  ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-60'
                                  : 'bg-white text-[#2D2529] border-[#F2C4D2] hover:border-[#C74B66]'
                              }`}
                              title={d.esDomingoCerrado ? 'Domingo cerrado' : d.esDomingo && d.esDiciembre ? 'Domingo (Habilitado en Diciembre)' : d.label}
                            >
                              <span className="text-[10px] uppercase font-extrabold tracking-wider leading-none">
                                {d.diaSemana}
                              </span>
                              <span className="text-sm font-bold leading-tight mt-0.5">
                                {d.diaNum}
                              </span>
                              {d.esDomingoCerrado ? (
                                <span className="text-[8px] font-normal leading-none mt-0.5">
                                  Cerrado
                                </span>
                              ) : d.esDomingo && d.esDiciembre ? (
                                <span className="text-[8px] font-bold text-amber-700 leading-none mt-0.5">
                                  Abierto
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Grid de Horarios */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#665158] block">
                        Horarios Disponibles ({horarioTexto})
                      </label>

                      {cargandoSlots ? (
                        <div className="py-8 text-center text-xs text-[#665158] flex items-center justify-center gap-2">
                          <IconLoader2 className="w-4 h-4 animate-spin text-[#A8324F]" />
                          <span>Consultando horarios libres...</span>
                        </div>
                      ) : avisoSlots ? (
                        <div className="p-4 bg-white border border-[#F2C4D2] rounded-xl text-center text-xs text-[#8C243B] font-medium">
                          {avisoSlots}
                        </div>
                      ) : slots.length === 0 ? (
                        <div className="p-4 bg-white border border-[#F2C4D2] rounded-xl text-center text-xs text-[#665158]">
                          No hay turnos disponibles para esta fecha.
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {slots.map((s) => (
                            <button
                              key={s}
                              onClick={() => setHoraSeleccionada(s)}
                              className={`py-2.5 sm:py-2 text-xs font-bold rounded-xl border transition cursor-pointer text-center ${
                                horaSeleccionada === s
                                  ? 'bg-[#8C243B] text-white border-[#8C243B] shadow-xs'
                                  : 'bg-white border-[#F2C4D2] text-[#2D2529] hover:border-[#C74B66]'
                              }`}
                            >
                              {formatearHora12h(s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Botón continuar */}
                    <div className="pt-2">
                      <button
                        disabled={!horaSeleccionada}
                        onClick={() => setPaso(2)}
                        className="w-full py-3 bg-[#8C243B] hover:bg-[#731D30] disabled:opacity-40 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                )}

                {/* PASO 2: TUS DATOS */}
                {paso === 2 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-[#2D2529] flex items-center gap-1.5">
                        <span>Tus</span>
                        <span className="italic text-[#A8324F] font-serif font-bold">datos</span>
                      </h2>
                      <p className="text-xs text-[#665158]">
                        {nombreServiciosCombinados} · {formatearDuracion(duracionTotal)} · {fecha} · {formatearHora12h(horaSeleccionada || '')}
                      </p>
                    </div>

                    {/* Resumen de servicios en Step 2 */}
                    <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#8C243B]">Resumen de tu cita:</span>
                        {esTarifaDesdeDiciembre(fecha) && !esTarifaDesdeDiciembre(hoyStr) && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            Tarifa desde el 1 de dic
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {todosLosServicios.map((s, idx) => (
                          <div key={s.id} className="flex justify-between items-center text-[11px] text-[#2D2529]">
                            <span>{idx === 0 ? '💅' : '✨'} {s.nombre} ({formatearDuracion(s.duracion)})</span>
                            <span className="font-mono font-semibold">
                              ${obtenerPrecioServicioParaFecha(s, fecha).toLocaleString('es-CO')}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-[#F2C4D2] pt-1.5 flex justify-between items-center font-bold text-xs">
                        <span className="text-[#2D2529]">Total ({formatearDuracion(duracionTotal)}):</span>
                        <span className="text-[#8C243B] font-mono">${precioTotal.toLocaleString('es-CO')} COP</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#665158] block">
                          WhatsApp de contacto
                        </label>
                        <input
                          type="tel"
                          maxLength={15}
                          autoComplete="tel"
                          placeholder="300 123 4567"
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3 py-2 text-base sm:text-xs font-semibold text-[#2D2529] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#665158] block">
                          Nombre completo
                        </label>
                        <input
                          type="text"
                          maxLength={70}
                          autoComplete="name"
                          placeholder="Tu nombre y apellido"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3 py-2 text-base sm:text-xs font-semibold text-[#2D2529] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20"
                        />
                      </div>
                    </div>

                    {/* Aviso de cobro o anticipo */}
                    {reagendarId ? (
                      <div className="bg-[#FFF0F4] border border-[#F2C4D2] rounded-2xl p-4 space-y-3 text-xs">
                        <div className="flex items-center gap-1.5 text-[#8C243B] font-bold">
                          <span className="text-base">🔄</span>
                          <span>
                            {Number(citaPreviaInfo?.abonoPrevio || 0) > 0
                              ? 'Reagendamiento: Tu abono previo queda reconocido'
                              : 'Reagendamiento de Cita'}
                          </span>
                        </div>

                        {(() => {
                          const prec = precioTotal;
                          const abono = Number(citaPreviaInfo?.abonoPrevio || 0);
                          const montoFijo = Number(spaConfig.montoAnticipoFijo || spaConfig.porcentajeAnticipo || 20000);
                          const anticipoTotalRequerido = exigeAnticipoEfectivo ? Math.min(prec, montoFijo) : 0;
                          const anticipoFaltante = Math.max(0, anticipoTotalRequerido - abono);
                          const saldo = Math.max(0, prec - abono - anticipoFaltante);
                          const mismoServicio = citaPreviaInfo?.servicio &&
                            citaPreviaInfo.servicio.toLowerCase().trim() === (servicioSeleccionado?.nombre || '').toLowerCase().trim();

                          if (anticipoFaltante > 0) {
                            return (
                              <div className="space-y-3">
                                {esCitaDiciembre && (
                                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1.5">
                                    <span>🎄</span>
                                    <span>
                                      {abono === 0
                                        ? 'Temporada de Diciembre: Como tu cita previa no tenía abono, se requiere transferir el anticipo para apartar tu turno en diciembre (30 min).'
                                        : `Temporada de Diciembre: Se reconoce tu abono previo de $${abono.toLocaleString('es-CO')}. Para tu cita de diciembre debes transferir la diferencia de $${anticipoFaltante.toLocaleString('es-CO')}.`}
                                    </span>
                                  </div>
                                )}

                                <div className="grid grid-cols-3 gap-2 text-center font-medium">
                                  <div className="bg-white p-2 rounded-xl border border-[#F2C4D2]">
                                    <span className="text-[10px] text-[#665158] uppercase font-bold tracking-wider block">
                                      Servicio
                                    </span>
                                    <span className="font-extrabold text-[#2D2529] text-xs font-mono">
                                      ${prec.toLocaleString('es-CO')}
                                    </span>
                                  </div>
                                  <div className="bg-white p-2 rounded-xl border border-amber-300 bg-amber-50/50">
                                    <span className="text-[10px] text-amber-900 uppercase font-bold tracking-wider block">
                                      Anticipo Req.
                                    </span>
                                    <span className="font-extrabold text-[#8C243B] text-xs font-mono">
                                      ${anticipoFaltante.toLocaleString('es-CO')}
                                    </span>
                                  </div>
                                  <div className="bg-white p-2 rounded-xl border border-[#F2C4D2]">
                                    <span className="text-[10px] text-[#665158] uppercase font-bold tracking-wider block">
                                      En el Spa
                                    </span>
                                    <span className="font-extrabold text-[#665158] text-xs font-mono">
                                      ${saldo.toLocaleString('es-CO')}
                                    </span>
                                  </div>
                                </div>

                                {/* Cuentas de recaudo para el anticipo faltante */}
                                <div className="p-3 bg-white rounded-xl border border-[#F2C4D2] space-y-2">
                                  <div className="flex items-center justify-between text-[#8C243B] font-bold text-[11px]">
                                    <span>Cuentas oficiales para el abono:</span>
                                    <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                                      Ventana de 30 min
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                                    <div className="p-2 bg-[#FFF5F7] rounded-lg border border-[#F2C4D2] flex justify-between items-center">
                                      <span className="text-[#665158]">📲 Nequi:</span>
                                      <strong className="text-[#2D2529] select-all">{spaConfig.nequiNumero || '321 961 0896'}</strong>
                                    </div>
                                    <div className="p-2 bg-[#FFF5F7] rounded-lg border border-[#F2C4D2] flex justify-between items-center">
                                      <span className="text-[#665158]">🏦 Bancolombia:</span>
                                      <strong className="text-[#2D2529] select-all">{spaConfig.bancolombiaNumero || 'Ahorros 245-000123-88'}</strong>
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-[#665158] italic">
                                    Titular: <strong>{spaConfig.titularCuenta || 'JL Mímate Nails Spa'}</strong> · Tu nuevo turno se apartará por 30 min mientras envías el comprobante por WhatsApp.
                                  </p>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-2">
                              <div className="grid grid-cols-3 gap-2 text-center font-medium">
                                <div className="bg-white p-2 rounded-xl border border-[#F2C4D2]">
                                  <span className="text-[10px] text-[#665158] uppercase font-bold tracking-wider block">
                                    Nuevo Servicio
                                  </span>
                                  <span className="font-extrabold text-[#2D2529] text-xs font-mono">
                                    ${prec.toLocaleString('es-CO')}
                                  </span>
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-emerald-200">
                                  <span className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider block">
                                    {abono > 0 ? 'Abono Previo ✓' : 'Abono Previo'}
                                  </span>
                                  <span className="font-extrabold text-emerald-600 text-xs font-mono">
                                    {abono > 0 ? `-$${abono.toLocaleString('es-CO')}` : '$0'}
                                  </span>
                                </div>
                                <div className="bg-white p-2 rounded-xl border border-[#F2C4D2]">
                                  <span className="text-[10px] text-[#665158] uppercase font-bold tracking-wider block">
                                    Excedente en Spa
                                  </span>
                                  <span className="font-extrabold text-[#8C243B] text-xs font-mono">
                                    ${saldo.toLocaleString('es-CO')}
                                  </span>
                                </div>
                              </div>

                              <div className="p-2.5 bg-white rounded-xl border border-[#F2C4D2] text-[11px] text-[#665158] leading-snug">
                                {abono > 0 ? (
                                  mismoServicio ? (
                                    <p>🌸 Mantienes el mismo servicio (<strong>{servicioSeleccionado?.nombre}</strong>). Se transfiere tu abono de ${abono.toLocaleString('es-CO')} y el excedente a pagar en el spa se mantiene igual.</p>
                                  ) : (
                                    <p>💅 Elegiste un servicio diferente (<strong>{servicioSeleccionado?.nombre}</strong>). Se restó tu abono previo (${abono.toLocaleString('es-CO')}). Tu nuevo excedente a pagar en el spa es de <strong>${saldo.toLocaleString('es-CO')}</strong>.</p>
                                  )
                                ) : (
                                  <p>✨ Reagendamiento directo sin abono previo. Tu cita previa queda cancelada y pagarás los <strong>${prec.toLocaleString('es-CO')}</strong> directamente en el spa.</p>
                                )}
                                <p className="mt-1 text-emerald-700 font-semibold">
                                  ✨ No debes transferir ningún anticipo ahora. Tu cita se confirmará de inmediato.
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : exigeAnticipoEfectivo ? (
                      <div className="bg-[#FFF0F4] border border-[#F2C4D2] rounded-2xl p-4 space-y-2.5 text-xs">
                        {(() => {
                          const prec = precioTotal;
                          const montoFijo = Number(spaConfig.montoAnticipoFijo || spaConfig.porcentajeAnticipo || 20000);
                          const ant = Math.min(prec, montoFijo);
                          const res = Math.max(0, prec - ant);
                          const cubreTotal = prec <= montoFijo;
                          return (
                            <div className="space-y-2.5">
                              {esCitaDiciembre && !spaConfig.exigeAnticipo && (
                                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1.5">
                                  <span>🎄</span>
                                  <span>Temporada de Diciembre: Para todas las citas de diciembre se requiere abono previo para asegurar tu cupo.</span>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 text-[#8C243B] font-bold">
                                <IconSparkles className="w-4 h-4 text-[#A8324F] shrink-0" />
                                <span>
                                  {cubreTotal
                                    ? 'Valor a transferir para confirmar cupo:'
                                    : 'Abono requerido para pre-confirmar:'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-center font-medium">
                                <div className="bg-white p-2.5 rounded-xl border border-[#F2C4D2]">
                                  <span className="text-[10px] text-[#665158] uppercase font-bold tracking-wider block">
                                    {cubreTotal ? 'Total a transferir (100%)' : 'Abono fijo requerido'}
                                  </span>
                                  <span className="font-extrabold text-[#8C243B] text-sm font-mono">
                                    ${ant.toLocaleString('es-CO')}
                                  </span>
                                </div>
                                <div className="bg-white p-2.5 rounded-xl border border-[#F2C4D2]">
                                  <span className="text-[10px] text-[#665158] uppercase font-bold tracking-wider block">
                                    Saldo en el spa
                                  </span>
                                  <span className="font-extrabold text-[#2D2529] text-sm font-mono">
                                    {res === 0 ? '$0 (Total cubierto)' : `$${res.toLocaleString('es-CO')}`}
                                  </span>
                                </div>
                              </div>

                              {cubreTotal && (
                                <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 leading-tight">
                                  ✨ Como este servicio vale menos que la tarifa fija de abono, únicamente transfieres su valor total (<strong>${prec.toLocaleString('es-CO')}</strong>) y tu cita queda completamente paga.
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        <p className="text-[11px] text-[#665158] leading-snug">
                          🔒 Tu turno quedará <strong>pre-apartado por 30 minutos</strong> mientras realizas la transferencia y envías el comprobante a nuestro WhatsApp.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white border border-[#F2C4D2] rounded-xl p-3 flex items-start gap-2 text-xs text-[#665158]">
                        <IconHeart className="w-4 h-4 text-[#A8324F] shrink-0 mt-0.5" />
                        <p className="leading-snug">
                          <strong>Sin cobro anticipado:</strong> Cancelas el valor de tu servicio (${precioTotal.toLocaleString('es-CO')} COP) el día de tu cita directamente en el spa.
                        </p>
                      </div>
                    )}

                    {/* Indicación de Precios Claros (Ley 1480 de 2011) */}
                    <div className="flex items-center justify-between text-[11px] text-[#665158] px-1 pt-0.5">
                      <span>Tarifas en pesos colombianos (COP)</span>
                      <span className="font-semibold text-[#8C243B]">Precio final · Exento de IVA</span>
                    </div>

                    {/* Checkbox de Autorización de Datos y Términos (Ley 1581 / Dcto 1377 / Ley 1480) */}
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-[#F2C4D2] cursor-pointer hover:border-[#8C243B] transition-colors text-xs text-[#665158] shadow-2xs">
                      <input
                        type="checkbox"
                        checked={aceptaPoliticas}
                        onChange={(e) => setAceptaPoliticas(e.target.checked)}
                        className="mt-0.5 rounded border-[#F2C4D2] text-[#8C243B] focus:ring-[#8C243B] w-4 h-4 cursor-pointer accent-[#8C243B]"
                      />
                      <span className="leading-snug select-none">
                        Autorizo el{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setModalLegalTab('datos');
                          }}
                          className="font-bold text-[#8C243B] hover:text-[#A8324F] underline inline cursor-pointer"
                        >
                          Tratamiento de mis Datos Personales
                        </button>{' '}
                        (Ley 1581 de 2012) y acepto los{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setModalLegalTab('terminos');
                          }}
                          className="font-bold text-[#8C243B] hover:text-[#A8324F] underline inline cursor-pointer"
                        >
                          Términos y Cancelaciones
                        </button>{' '}
                        de JL Mímate Nails Spa.
                      </span>
                    </label>

                    {!aceptaPoliticas && telefono.trim() && nombre.trim() && (
                      <p className="text-[11px] text-[#A8324F] text-center font-medium animate-in fade-in duration-150">
                        Por favor autoriza el tratamiento de datos para confirmar tu cita.
                      </p>
                    )}

                    {/* Botones volver y confirmar */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setPaso(1)}
                        className="p-3 bg-white border border-[#F2C4D2] text-[#665158] hover:text-[#2D2529] rounded-xl transition cursor-pointer"
                        title="Volver"
                      >
                        <IconArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        disabled={enviandoReserva || !telefono.trim() || !nombre.trim() || !aceptaPoliticas}
                        onClick={handleConfirmarReserva}
                        className="flex-1 py-3 bg-[#8C243B] hover:bg-[#731D30] disabled:opacity-40 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {enviandoReserva ? (
                          <>
                            <IconLoader2 className="w-4 h-4 animate-spin" />
                            <span>
                              {(() => {
                                const prec = precioTotal;
                                const abono = Number(citaPreviaInfo?.abonoPrevio || 0);
                                const montoFijo = Number(spaConfig.montoAnticipoFijo || spaConfig.porcentajeAnticipo || 20000);
                                const antTotal = exigeAnticipoEfectivo ? Math.min(prec, montoFijo) : 0;
                                const faltante = reagendarId ? Math.max(0, antTotal - abono) : antTotal;
                                if (faltante > 0) return 'Apartando pre-reserva (30 min)...';
                                return reagendarId ? 'Confirmando reagendamiento...' : 'Confirmando cita...';
                              })()}
                            </span>
                          </>
                        ) : (
                          <span>
                            {(() => {
                              const prec = precioTotal;
                              const abono = Number(citaPreviaInfo?.abonoPrevio || 0);
                              const montoFijo = Number(spaConfig.montoAnticipoFijo || spaConfig.porcentajeAnticipo || 20000);
                              const antTotal = exigeAnticipoEfectivo ? Math.min(prec, montoFijo) : 0;
                              const faltante = reagendarId ? Math.max(0, antTotal - abono) : antTotal;

                              if (faltante > 0) {
                                return reagendarId
                                  ? `Reagendar y Enviar Comprobante ($${faltante.toLocaleString('es-CO')})`
                                  : `Agendar y Enviar Comprobante ($${faltante.toLocaleString('es-CO')})`;
                              }
                              return reagendarId ? 'Confirmar cambio de cita' : 'Confirmar reserva';
                            })()}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* PASO 3: CONFIRMACIÓN EXITOSA / PRE-CONFIRMADA */}
                {paso === 3 && reservaConfirmada && (
                  <div className="text-center space-y-4 py-2">
                    <div
                      className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-white shadow-md ${
                        reservaConfirmada.esPreReserva
                          ? 'bg-gradient-to-tr from-amber-500 to-[#C74B66]'
                          : 'bg-gradient-to-tr from-[#C74B66] to-[#F2C4D2]'
                      }`}
                    >
                      {reservaConfirmada.esPreReserva ? (
                        <IconClock className="w-8 h-8 stroke-[2.5]" />
                      ) : (
                        <IconCheck className="w-8 h-8 stroke-[3]" />
                      )}
                    </div>

                    <div className="space-y-1">
                      {reservaConfirmada.esPreReserva && (
                        <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 mb-1">
                          <span>⏳ {reservaConfirmada.esReagendamiento ? 'Reagendamiento pre-apartado por 30 min' : 'Pre-apartada por 30 minutos'}</span>
                        </div>
                      )}
                      {!reservaConfirmada.esPreReserva && reservaConfirmada.esReagendamiento && (
                        <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 mb-1">
                          <span>✓ Cita Reagendada y Confirmada</span>
                        </div>
                      )}
                      <h2 className="text-xl font-bold text-[#2D2529]">
                        ¡Cita{' '}
                        <span className="italic text-[#8C243B] font-serif">
                          {reservaConfirmada.esPreReserva
                            ? (reservaConfirmada.esReagendamiento ? 'reagendada y pre-confirmada!' : 'pre-confirmada!')
                            : reservaConfirmada.esReagendamiento
                            ? 'reagendada con éxito!'
                            : 'confirmada!'}
                        </span>
                      </h2>
                      <p className="text-xs text-[#665158] max-w-sm mx-auto leading-relaxed pt-1">
                        {reservaConfirmada.esPreReserva ? (
                          <>
                            ¡Listo, reina! Enviamos los datos y cuentas de transferencia a tu WhatsApp{' '}
                            <strong className="text-[#8C243B]">{reservaConfirmada.telefono}</strong>.
                          </>
                        ) : (
                          <>
                            ¡Listo, reina! Enviamos tu comprobante oficial actualizado al WhatsApp{' '}
                            <strong className="text-[#8C243B]">{reservaConfirmada.telefono}</strong>.
                          </>
                        )}
                      </p>
                    </div>

                    {reservaConfirmada.esPreReserva && (
                      <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl p-4 text-xs text-left space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#8C243B] flex items-center gap-1.5">
                            <IconBrandWhatsapp className="w-4 h-4 text-emerald-600" />
                            <span>Cuentas oficiales para el abono:</span>
                          </span>
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                            Límite: 30 minutos
                          </span>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-[#F2C4D2] space-y-1.5 font-mono text-[11px]">
                          {(reservaConfirmada.nequi || spaConfig.nequiNumero) && (
                            <div className="flex justify-between items-center">
                              <span className="text-[#665158]">📲 Número Nequi / Daviplata:</span>
                              <span className="font-bold text-[#2D2529] select-all">
                                {reservaConfirmada.nequi || spaConfig.nequiNumero}
                              </span>
                            </div>
                          )}
                          {(reservaConfirmada.bancolombia || spaConfig.bancolombiaNumero) && (
                            <div className="flex justify-between items-center">
                              <span className="text-[#665158]">🏦 Cuenta Bancolombia:</span>
                              <span className="font-bold text-[#2D2529] select-all">
                                {reservaConfirmada.bancolombia || spaConfig.bancolombiaNumero}
                              </span>
                            </div>
                          )}
                          {(reservaConfirmada.llave || spaConfig.llaveNumero) && (
                            <div className="flex justify-between items-center">
                              <span className="text-[#665158]">🔑 Llave:</span>
                              <span className="font-bold text-[#2D2529] select-all">
                                {reservaConfirmada.llave || spaConfig.llaveNumero}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center border-t border-[#FCE8EF] pt-1.5">
                            <span className="text-[#665158]">Titular de la cuenta:</span>
                            <span className="font-bold text-[#8C243B]">
                              {reservaConfirmada.titular || spaConfig.titularCuenta || 'JL Mímate Nails Spa'}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-[#665158] leading-snug">
                          📸 <strong>Paso final:</strong> Envía la foto o captura del comprobante al chat de WhatsApp. Nuestro sistema lo verificará para proteger tu turno. Si no se envía en 30 minutos, el espacio se liberará.
                        </p>
                      </div>
                    )}

                    {reservaConfirmada.esReagendamiento && (
                      reservaConfirmada.esPreReserva ? (
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs flex items-center justify-center gap-2 font-medium">
                          <span>⏳</span>
                          <span>
                            {(reservaConfirmada.abonoPrevioReconocido || 0) > 0
                              ? `Se reconoce tu abono previo de $${(reservaConfirmada.abonoPrevioReconocido || 0).toLocaleString('es-CO')}. Para asegurar tu cupo en diciembre, por favor transfiere el anticipo de $${(reservaConfirmada.anticipoRequerido || 0).toLocaleString('es-CO')} en los próximos 30 minutos.`
                              : `Para asegurar tu cupo en diciembre, por favor transfiere el anticipo de $${(reservaConfirmada.anticipoRequerido || 0).toLocaleString('es-CO')} en los próximos 30 minutos.`}
                          </span>
                        </div>
                      ) : (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs flex items-center justify-center gap-2 font-medium">
                          <span>✓</span>
                          <span>
                            {(reservaConfirmada.abonoPrevioReconocido || 0) > 0
                              ? `Tu cita previa fue cancelada y tu abono de $${(reservaConfirmada.abonoPrevioReconocido || 0).toLocaleString('es-CO')} quedó transferido a este nuevo turno.`
                              : 'Tu cita previa fue cancelada y tu nuevo turno fue reagendado con éxito.'}
                          </span>
                        </div>
                      )
                    )}

                    {/* Tarjeta de recordatorio automático 1 día antes */}
                    <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3 text-left flex items-start gap-2.5 text-xs">
                      <IconBrandWhatsapp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-[#8C243B]">Recordatorio automático</p>
                        <p className="text-[11px] text-[#665158] leading-relaxed">
                          Te enviaremos un mensaje de recordatorio a tu WhatsApp <strong>1 día antes</strong> de tu cita.
                        </p>
                      </div>
                    </div>

                    {/* Resumen */}
                    <div className="bg-white border border-[#F2C4D2] rounded-2xl p-4 text-xs text-left space-y-2 shadow-xs">
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#665158]">Servicio:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.servicio}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#665158]">Especialista:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.empleada}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#665158]">Fecha:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.fecha}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#665158]">Hora:</span>
                        <span className="font-bold text-[#2D2529]">{formatearHora12h(reservaConfirmada.hora)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-[#FCE8EF] pb-1.5 gap-2">
                        <span className="text-[#665158] shrink-0">Lugar:</span>
                        <a
                          href={obtenerUrlMapaSpa()}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-[#8C243B] hover:underline flex items-center gap-1 text-right text-xs"
                          title="Abrir ubicación en el mapa"
                        >
                          <span>Pereira, Cuba (Cl. 66 #26-57)</span>
                          <span className="text-[9px] bg-[#FCE8EF] text-[#8C243B] px-1.5 py-0.5 rounded border border-[#F2C4D2] shrink-0 font-bold">
                            Ver mapa 📍
                          </span>
                        </a>
                      </div>

                      {reservaConfirmada.esPreReserva ? (
                        <>
                          <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5 pt-0.5">
                            <span className="text-[#665158]">Precio del servicio:</span>
                            <span className="font-semibold text-[#2D2529] font-mono text-xs">
                              ${reservaConfirmada.precio.toLocaleString('es-CO')}
                            </span>
                          </div>
                          {(reservaConfirmada.abonoPrevioReconocido || 0) > 0 && (
                            <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5 pt-0.5">
                              <span className="text-emerald-700 font-bold">Abono anterior reconocido:</span>
                              <span className="font-extrabold text-emerald-600 font-mono text-xs">
                                -${(reservaConfirmada.abonoPrevioReconocido || 0).toLocaleString('es-CO')}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5 pt-0.5">
                            <span className="text-[#8C243B] font-bold">
                              Anticipo a transferir (30 min):
                            </span>
                            <span className="font-extrabold text-[#8C243B] font-mono text-xs">
                              ${(reservaConfirmada.anticipoRequerido || 0).toLocaleString('es-CO')}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1">
                            <span className="text-[#665158] font-bold">Restante a pagar en el spa:</span>
                            <span className="font-extrabold text-[#2D2529] font-mono text-sm">
                              {(reservaConfirmada.saldoRestante || 0) === 0 ? '$0 (Servicio cubierto)' : `$${(reservaConfirmada.saldoRestante || 0).toLocaleString('es-CO')}`}
                            </span>
                          </div>
                        </>
                      ) : reservaConfirmada.esReagendamiento ? (
                        <>
                          <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5 pt-0.5">
                            <span className="text-[#665158]">Precio del servicio:</span>
                            <span className="font-semibold text-[#2D2529] font-mono text-xs">
                              ${reservaConfirmada.precio.toLocaleString('es-CO')}
                            </span>
                          </div>
                          {(reservaConfirmada.abonoPrevioReconocido || 0) > 0 ? (
                            <>
                              <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5 pt-0.5">
                                <span className="text-emerald-700 font-bold">Abono anterior transferido:</span>
                                <span className="font-extrabold text-emerald-600 font-mono text-xs">
                                  -${(reservaConfirmada.abonoPrevioReconocido || 0).toLocaleString('es-CO')}
                                </span>
                              </div>
                              <div className="flex justify-between pt-1">
                                <span className="text-[#665158] font-bold">Excedente a pagar en el spa:</span>
                                <span className="font-extrabold text-[#8C243B] font-mono text-sm">
                                  ${(reservaConfirmada.saldoRestante ?? Math.max(0, reservaConfirmada.precio - (reservaConfirmada.abonoPrevioReconocido || 0))).toLocaleString('es-CO')}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between pt-1">
                              <span className="text-[#665158] font-bold">Total a pagar en el spa:</span>
                              <span className="font-extrabold text-[#8C243B] font-mono text-sm">
                                ${(reservaConfirmada.saldoRestante ?? reservaConfirmada.precio).toLocaleString('es-CO')}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex justify-between pt-1">
                          <span className="text-[#665158] font-bold">Total a pagar en el spa:</span>
                          <span className="font-extrabold text-[#8C243B] font-mono text-sm">
                            ${reservaConfirmada.precio.toLocaleString('es-CO')}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={cerrarModal}
                      className="w-full py-3 bg-[#8C243B] hover:bg-[#731D30] text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
                    >
                      Entendido, muchas gracias
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL LEGAL Y NORMATIVO COLOMBIANO */}
      <LegalModal
        abierto={modalLegalTab !== null}
        tabInicial={modalLegalTab || 'datos'}
        onClose={() => setModalLegalTab(null)}
      />
    </div>
  );
};
