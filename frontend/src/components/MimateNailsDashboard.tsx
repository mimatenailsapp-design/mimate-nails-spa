import React, { useState, useEffect, useMemo } from 'react';
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
  IconRefresh,
  IconAlertCircle,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
} from '@tabler/icons-react';

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
  const matchNom = (cita.notas || '').match(/Clienta:\s*([^|[\n]+)/i);
  if (matchNom && matchNom[1]) {
    return matchNom[1].trim();
  }
  return cita.clientes?.nombre || 'Clienta';
}

// Función auxiliar para extraer el nombre del servicio de la cita
function obtenerServicioCita(cita: Reserva): string {
  const matchSvc = (cita.notas || '').match(/Servicio:\s*([^|[\n]+)/i);
  if (matchSvc && matchSvc[1]) {
    return matchSvc[1].trim();
  }
  return 'Servicio de Uñas';
}

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

function obtenerHoraEnteraBogota(isoStr: string): number {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 8;
    const hStr = d.toLocaleTimeString('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(hStr, 10);
  } catch {
    return 8;
  }
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

  // Estados para dropdowns bonitos en el modal
  const [menuManiAbierto, setMenuManiAbierto] = useState(false);
  const [menuServicioAbierto, setMenuServicioAbierto] = useState(false);
  const [menuHoraAbierto, setMenuHoraAbierto] = useState(false);

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

  // Abrir modal de Agendar Cita con una manicurista preseleccionada
  const abrirModalAgendar = (manicuristaId?: string, horaInicial?: string) => {
    setAgendarManicuristaId(manicuristaId || canchas[0]?.id || '');
    setAgendarFecha(fechaSeleccionada);
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

  // Métricas financieras calculadas para la Admin
  const metricasSpa = useMemo(() => {
    const total = reservas.length;
    const confirmadas = reservas.filter((r) => r.estado === 'confirmada' || r.estado === 'completada');
    const completadas = reservas.filter((r) => r.estado === 'completada');
    const canceladas = reservas.filter((r) => r.estado === 'cancelada');

    const ingresosTotales = confirmadas.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);

    // Desglose por manicurista
    const porManicurista = canchas.map((c) => {
      const citasMani = reservas.filter((r) => r.cancha_id === c.id);
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

    // Desglose por servicio
    const porServicio = servicios.map((s) => {
      const citasSvc = reservas.filter((r) => (r.notas || '').includes(s.nombre));
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
      ingresosTotales,
      porManicurista,
      porServicio,
    };
  }, [reservas, canchas, servicios]);

  const esAdmin = perfilActual?.rol === 'admin';

  // Objeto de la manicurista actualmente seleccionada en el formulario
  const manicuristaSeleccionadaForm = useMemo(() => {
    return canchas.find((c) => c.id === agendarManicuristaId) || canchas[0];
  }, [canchas, agendarManicuristaId]);

  // Objeto del servicio actualmente seleccionado en el formulario
  const servicioSeleccionadoForm = useMemo(() => {
    return servicios.find((s) => s.id === Number(agendarServicioId)) || servicios[0];
  }, [servicios, agendarServicioId]);

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
    puedeAgendar: boolean = false
  ) => {
    const esHoy = fechaSeleccionada === hoyStr;
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
                {fechaLegible} · <strong className="text-[#8C243B]">{citasManicurista.length} citas</strong> agendadas
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

        {/* Grilla de Tiempo con Horas de 8 a 19 */}
        <div className="relative p-4 sm:p-6 overflow-x-auto">
          {/* FRONTAL: Línea roja de la hora actual en tiempo real */}
          {esHoy && estaEnHorario && (
            <div
              className="absolute left-16 sm:left-24 right-4 sm:right-6 z-30 pointer-events-none flex items-center transition-all duration-700"
              style={{ top: `${posicionYLinea + 24}px` }}
            >
              {/* Píldora roja estilo iOS / Google Calendar con la hora exacta */}
              <span className="absolute -left-14 sm:-left-16 -top-2.5 bg-red-500 text-white text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                {horaMinutosActualStr}
              </span>
              {/* Punto circular en el borde izquierdo */}
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 ring-2 ring-white shadow-xs" />
              {/* Línea horizontal roja continua */}
              <div className="flex-1 h-[2px] bg-red-500 shadow-xs" />
            </div>
          )}

          {/* Filas de 1 hora de 8 a 19 */}
          <div className="relative divide-y divide-[#F2C4D2]/60 border-b border-[#F2C4D2]/60">
            {HORAS_TIMELINE.map((h) => {
              const citasEnHora = citasManicurista.filter((cita) => {
                const hCita = obtenerHoraEnteraBogota(cita.fecha_inicio);
                return hCita === h;
              });

              return (
                <div
                  key={h}
                  className="flex relative group transition hover:bg-[#FFF5F7]/30"
                  style={{ minHeight: `${ALTURA_HORA_PX}px` }}
                >
                  {/* Columna de la hora a la izquierda */}
                  <div className="w-16 sm:w-24 pr-3 -mt-2.5 flex-shrink-0 text-right select-none">
                    <span className="text-[11px] sm:text-xs font-semibold text-[#7D6870]">
                      {formatearHora12(h)}
                    </span>
                  </div>

                  {/* Espacio del turno a la derecha */}
                  <div className="flex-1 pl-3 sm:pl-4 py-2 flex flex-col justify-center">
                    {citasEnHora.length > 0 ? (
                      <div className="space-y-2">
                        {citasEnHora.map((cita) => {
                          const horaInicio = obtenerHoraMinutosBogota(cita.fecha_inicio);
                          const horaFin = cita.fecha_fin ? obtenerHoraMinutosBogota(cita.fecha_fin) : '';
                          const nombreClienta = obtenerNombreClienta(cita);
                          const servicioNombre = obtenerServicioCita(cita);
                          const telLimpio = String(cita.clientes?.telefono_wa || '').replace(/\D/g, '');

                          return (
                            <div
                              key={cita.id}
                              className={`p-3 rounded-2xl border transition shadow-xs flex flex-wrap items-center justify-between gap-3 ${
                                cita.estado === 'completada'
                                  ? 'bg-emerald-50/70 border-emerald-300'
                                  : cita.estado === 'cancelada'
                                  ? 'bg-slate-50 border-slate-200 opacity-60'
                                  : 'bg-white border-[#F2C4D2] hover:border-[#8C243B] hover:shadow-sm'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="px-2.5 py-1 rounded-xl bg-[#FFF5F7] border border-[#F2C4D2] text-[#8C243B] font-mono font-bold text-xs flex items-center gap-1 shadow-2xs">
                                  <IconClock className="w-3.5 h-3.5 text-[#C74B66]" />
                                  {horaInicio} - {horaFin}
                                </div>
                                <div>
                                  <p className="font-bold text-sm text-[#2D2529]">
                                    {nombreClienta}
                                  </p>
                                  <p className="text-xs text-[#7D6870]">
                                    💅 {servicioNombre} · <span className="font-bold text-[#8C243B]">${Number(cita.valor_total || 25000).toLocaleString('es-CO')}</span>
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
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
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition shadow-2xs"
                                    title="Escribir por WhatsApp"
                                  >
                                    <IconBrandWhatsapp className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">WhatsApp</span>
                                  </a>
                                )}

                                {cita.estado !== 'completada' && cita.estado !== 'cancelada' && (
                                  <button
                                    onClick={() => handleCambiarEstado(cita.id, 'completada')}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
                                    title="Marcar como atendida"
                                  >
                                    <IconCheck className="w-3.5 h-3.5" />
                                    <span>Completada</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-full min-h-[50px] flex items-center justify-between text-xs text-[#7D6870]/60 px-2 rounded-xl transition hover:bg-[#FFF5F7]/50">
                        <span className="text-[11px] font-medium text-[#7D6870]/50 italic">
                          Espacio libre
                        </span>
                        {puedeAgendar && canchaId && (
                          <button
                            onClick={() => abrirModalAgendar(canchaId, `${String(h).padStart(2, '0')}:00`)}
                            className="opacity-0 group-hover:opacity-100 transition px-2.5 py-1 rounded-xl bg-white border border-[#F2C4D2] text-[#8C243B] text-[11px] font-bold hover:bg-[#FCE8EF] cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1"
                          >
                            <IconPlus className="w-3 h-3" />
                            <span>Agendar turno</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
        
        {/* BARRA DE FECHA CON FLECHAS DÍA ANTERIOR / SIGUIENTE */}
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
                {fechaLegible} · <strong className="text-[#8C243B]">{reservasDelDia.length} citas</strong> programadas
              </p>
            </div>
          </div>

          {/* CONTROLES DE FECHA CON FLECHAS */}
          <div className="flex items-center gap-1.5 bg-[#FFF5F7] p-1.5 rounded-2xl border border-[#F2C4D2]">
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

            {/* ACCESO RÁPIDO: Volver a Hoy si está en otra fecha */}
            {fechaSeleccionada !== hoyStr && (
              <button
                onClick={() => setFechaSeleccionada(hoyStr)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white text-[#8C243B] hover:bg-[#FCE8EF] border border-[#F2C4D2] transition cursor-pointer shadow-2xs animate-in fade-in"
                title="Volver a la fecha actual"
              >
                Ir a Hoy
              </button>
            )}

            <div className="relative pl-1">
              <input
                type="date"
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="px-3 py-1.5 bg-white border border-[#F2C4D2] rounded-xl text-xs font-bold text-[#2D2529] outline-none cursor-pointer hover:border-[#8C243B] transition shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* CASO A: VISTA DE LA ADMINISTRADORA (TABLA DE TODAS LAS MANICURISTAS)  */}
        {/* ==================================================================== */}
        {esAdmin && tabAdmin === 'agenda' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-[#2D2529] font-serif">
                Turnos por Especialista · {fechaLegible}
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
                <span>👑 Resumen 4 Especialistas</span>
              </button>

              {canchas.map((cancha, i) => (
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
                    {reservasDelDia.filter((r) => r.cancha_id === cancha.id).length}
                  </span>
                </button>
              ))}
            </div>

            {/* SI SELECCIONÓ UNA ESPECIALISTA ESPECÍFICA: TIMELINE DIARIO POR HORAS CON LÍNEA ROJA */}
            {especialistaSeleccionadaId !== 'todas' ? (
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
                          const nombreClienta = obtenerNombreClienta(cita);
                          const servicioNombre = obtenerServicioCita(cita);
                          const telLimpio = String(cita.clientes?.telefono_wa || '').replace(/\D/g, '');

                          return (
                            <div
                              key={cita.id}
                              className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition ${
                                cita.estado === 'completada'
                                  ? 'bg-emerald-50/60 border-emerald-200'
                                  : cita.estado === 'cancelada'
                                  ? 'bg-slate-50 border-slate-200 opacity-60'
                                  : 'bg-white border-[#F2C4D2] shadow-2xs hover:border-[#8C243B]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-[#8C243B] text-[11px] flex items-center gap-1">
                                  <IconClock className="w-3 h-3 text-[#C74B66]" />
                                  {horaInicio}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                                    cita.estado === 'completada'
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : cita.estado === 'cancelada'
                                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                                      : 'bg-[#FCE8EF] text-[#8C243B] border-[#F2C4D2]'
                                  }`}
                                >
                                  {cita.estado.toUpperCase()}
                                </span>
                              </div>

                              <div>
                                <p className="font-bold text-[#2D2529] text-xs">
                                  {nombreClienta}
                                </p>
                                <p className="text-[11px] text-[#7D6870] truncate">
                                  💅 {servicioNombre}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-1 border-t border-[#FCE8EF] text-[10px]">
                                <span className="font-mono font-bold text-[#2D2529]">
                                  ${Number(cita.valor_total || 25000).toLocaleString('es-CO')}
                                </span>

                                <div className="flex items-center gap-1">
                                  {/* Botón WhatsApp con nombre correcto de clienta */}
                                  {telLimpio && (
                                    <a
                                      href={`https://wa.me/${telLimpio}?text=Hola%20${encodeURIComponent(
                                        nombreClienta
                                      )},%20te%20saludamos%20de%20JL%20M%C3%ADmate%20Nails%20respecto%20a%20tu%20cita%20de%20hoy.`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                                      title="Escribir por WhatsApp"
                                    >
                                      <IconBrandWhatsapp className="w-3.5 h-3.5" />
                                    </a>
                                  )}

                                  {/* Botón Marcar Completada */}
                                  {cita.estado !== 'completada' && cita.estado !== 'cancelada' && (
                                    <button
                                      onClick={() => handleCambiarEstado(cita.id, 'completada')}
                                      className="p-1 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition cursor-pointer"
                                      title="Marcar como atendida / completada"
                                    >
                                      <IconCheck className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Botón Agendar para esta Manicurista */}
                    <div className="p-2 bg-[#FFF5F7] border-t border-[#F2C4D2]">
                      <button
                        onClick={() => abrirModalAgendar(cancha.id)}
                        className="w-full py-1.5 bg-white hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <IconPlus className="w-3.5 h-3.5" />
                        <span>Agendar con {cancha.nombre.split(' ')[0]}</span>
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
            <h2 className="text-base sm:text-lg font-bold text-[#2D2529] font-serif">
              Resumen de Rendimiento & Métricas Financieras
            </h2>

            {/* Tarjetas Principales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">Ingresos Estimados</span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#8C243B]">
                  ${metricasSpa.ingresosTotales.toLocaleString('es-CO')}
                </p>
                <p className="text-[10px] text-[#7D6870]">Reservas confirmadas y completadas</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">Citas Agendadas</span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#2D2529]">
                  {metricasSpa.total}
                </p>
                <p className="text-[10px] text-[#7D6870]">Total acumulado en el sistema</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">Citas Completadas</span>
                <p className="text-xl sm:text-2xl font-black font-mono text-emerald-600">
                  {metricasSpa.completadasCount}
                </p>
                <p className="text-[10px] text-emerald-700">Atendidas satisfactoriamente</p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-[#F2C4D2] shadow-xs space-y-1">
                <span className="text-[11px] font-bold text-[#7D6870] uppercase">Citas del Día</span>
                <p className="text-xl sm:text-2xl font-black font-mono text-[#C74B66]">
                  {reservasDelDia.length}
                </p>
                <p className="text-[10px] text-[#7D6870]">Turnos para {fechaLegible}</p>
              </div>
            </div>

            {/* TABLA 1: Rendimiento por Manicurista */}
            <div className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs overflow-hidden space-y-3 p-4">
              <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                Rendimiento por Manicurista
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FFF5F7] text-[#7D6870] uppercase text-[10px] border-b border-[#F2C4D2]">
                    <tr>
                      <th className="py-2.5 px-3">Especialista</th>
                      <th className="py-2.5 px-3">Total Citas</th>
                      <th className="py-2.5 px-3">Completadas</th>
                      <th className="py-2.5 px-3">Recaudo Estimado</th>
                      <th className="py-2.5 px-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FCE8EF]">
                    {metricasSpa.porManicurista.map((m, i) => (
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
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            Activa
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABLA 2: Citas por Servicio */}
            <div className="bg-white rounded-2xl border border-[#F2C4D2] shadow-xs overflow-hidden space-y-3 p-4">
              <h3 className="font-bold text-sm text-[#2D2529] font-serif">
                Demanda por Servicio de Uñas
              </h3>
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
            <div className="bg-gradient-to-r from-[#FFF5F7] to-[#FCE8EF] border border-[#F2C4D2] rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#2D2529] font-serif">
                  ¡Hola, {perfilActual.nombre}! 💅
                </h2>
                <p className="text-xs text-[#7D6870]">
                  Turnos asignados a tu puesto para el {fechaLegible}.
                </p>
              </div>
              <span className="text-xs font-bold text-[#8C243B] bg-white px-3 py-1 rounded-full border border-[#F2C4D2]">
                {
                  reservasDelDia.filter((r) => r.cancha_id === perfilActual.canchaId).length
                }{' '}
                citas hoy
              </span>
            </div>

            {/* TIMELINE DIARIO CRONOLÓGICO DE LA MANICURISTA CON LÍNEA ROJA EN TIEMPO REAL */}
            {(() => {
              const misCitas = reservasDelDia.filter(
                (r) => r.cancha_id === perfilActual.canchaId
              );

              return renderTimelineManicurista(
                misCitas,
                perfilActual.nombre,
                perfilActual.canchaId,
                false
              );
            })()}

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
                          {HORAS_JORNADA.map((h) => {
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
                          })}
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
    </div>
  );
};
