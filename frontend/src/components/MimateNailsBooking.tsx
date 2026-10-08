import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconBrandWhatsapp,
  IconClock,
  IconMapPin,
  IconSparkles,
  IconCheck,
  IconX,
  IconArrowLeft,
  IconLoader2,
  IconHeart,
  IconChevronDown,
} from '@tabler/icons-react';
import { supabase } from '../config/supabase';

interface Servicio {
  id: number;
  nombre: string;
  categoria: string;
  duracion: number;
  precio: number;
  descripcion: string;
}

interface Empleada {
  id: string;
  nombre: string;
}

const SERVICIOS_DEFAULT: Servicio[] = [
  {
    id: 1,
    nombre: 'Manicura tradicional',
    categoria: 'Tradicional',
    duracion: 45,
    precio: 25000,
    descripcion: 'Limpieza profunda, corte, limado, exfoliación, hidratación y esmaltado tradicional.',
  },
  {
    id: 2,
    nombre: 'Pedicure tradicional',
    categoria: 'Tradicional',
    duracion: 50,
    precio: 30000,
    descripcion: 'Cuidado completo de pies, retiro de callosidades, exfoliación, masaje y esmaltado.',
  },
  {
    id: 3,
    nombre: 'Semipermanente',
    categoria: 'Semipermanente & Ruber',
    duracion: 60,
    precio: 45000,
    descripcion: 'Esmaltado en gel curado en lámpara LED con brillo espejo y duración de hasta 21 días intacto.',
  },
  {
    id: 4,
    nombre: 'Base ruber',
    categoria: 'Semipermanente & Ruber',
    duracion: 60,
    precio: 55000,
    descripcion: 'Nivelación y refuerzo estructural con base elástica de alta densidad para uñas frágiles o quebradizas.',
  },
  {
    id: 5,
    nombre: 'Dipping',
    categoria: 'Dipping & Press On',
    duracion: 60,
    precio: 60000,
    descripcion: 'Técnica de polvo de inmersión sin lámpara, extra resistente y acabado ultra natural.',
  },
  {
    id: 6,
    nombre: 'Uñas press on',
    categoria: 'Dipping & Press On',
    duracion: 60,
    precio: 50000,
    descripcion: 'Tips preformados de gel aplicados con adhesivo curable para largo y forma al instante.',
  },
  {
    id: 7,
    nombre: 'Acrilico esculpido',
    categoria: 'Esculpidas & Polygel',
    duracion: 90,
    precio: 85000,
    descripcion: 'Extensión artesanal esculpida a mano con monómero y polímero para estructura perfecta y duradera.',
  },
  {
    id: 8,
    nombre: 'Uñas polygel',
    categoria: 'Esculpidas & Polygel',
    duracion: 90,
    precio: 80000,
    descripcion: 'Fusión híbrida de gel y acrílico, liviano, sin olor y con máxima flexibilidad y durabilidad.',
  },
  {
    id: 9,
    nombre: 'Recubrimiento uña natural',
    categoria: 'Recubrimiento & Cuidado',
    duracion: 75,
    precio: 65000,
    descripcion: 'Capa protectora de acrílico o gel sobre el largo propio para evitar rupturas y permitir crecimiento.',
  },
];

const EMPLEADAS_DEFAULT: Empleada[] = [
  { id: 'f6010000-0000-0000-0000-000000000001', nombre: 'Manicurista 1' },
  { id: 'f6020000-0000-0000-0000-000000000002', nombre: 'Manicurista 2' },
  { id: 'f6030000-0000-0000-0000-000000000003', nombre: 'Manicurista 3' },
  { id: 'f6040000-0000-0000-0000-000000000004', nombre: 'Manicurista 4' },
];

const CATEGORIAS = [
  'Todos',
  'Tradicional',
  'Semipermanente & Ruber',
  'Dipping & Press On',
  'Esculpidas & Polygel',
  'Recubrimiento & Cuidado',
];

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
  const [servicios] = useState<Servicio[]>(SERVICIOS_DEFAULT);
  const [empleadas, setEmpleadas] = useState<Empleada[]>(EMPLEADAS_DEFAULT);

  // Modal de reserva
  const [modalAbierto, setModalAbierto] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [servicioSeleccionado, setServicioSeleccionado] = useState<Servicio | null>(null);

  // Formulario de reserva
  const hoyStr = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(hoyStr);
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
  const [reservaConfirmada, setReservaConfirmada] = useState<{
    codigo?: string;
    empleada: string;
    servicio: string;
    fecha: string;
    hora: string;
    precio: number;
    telefono: string;
  } | null>(null);

  // Parámetro de reagendamiento desde recordatorio WhatsApp (?reagendar=<id>)
  const [reagendarId, setReagendarId] = useState<string | null>(null);
  const [citaPreviaInfo, setCitaPreviaInfo] = useState<{
    fecha?: string;
    hora?: string;
    servicio?: string;
    manicurista?: string;
  } | null>(null);

  // Cargar info del spa y detectar parámetro de reagendamiento
  useEffect(() => {
    fetch('/api/spa/info')
      .then((r) => r.json())
      .then((d) => {
        if (d.equipo && d.equipo.length > 0) {
          setEmpleadas(d.equipo);
        }
      })
      .catch(() => {});

    try {
      const params = new URLSearchParams(window.location.search);
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
              setCitaPreviaInfo({
                fecha: fStr,
                hora: hStr,
                manicurista: cancha?.nombre,
              });
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  const cargarSlots = async (f = fecha, emp = empleadaId, dur = servicioSeleccionado?.duracion || 45) => {
    if (!f) return;
    setCargandoSlots(true);
    setAvisoSlots(null);

    const dObj = new Date(`${f}T12:00:00-05:00`);
    if (dObj.getDay() === 0) {
      setSlots([]);
      setAvisoSlots('Los domingos estamos cerrados. Atendemos con amor de Lunes a Sábado de 9:30 am a 5:30 pm 💕');
      setCargandoSlots(false);
      return;
    }

    const duracion = Math.max(15, dur);

    try {
      // 1. Intentar endpoint en backend
      const query = new URLSearchParams({
        date: f,
        duracion_minutos: String(duracion),
      });
      if (emp) query.set('cancha_id', emp);

      const res = await fetch(`/api/spa/slots?${query.toString()}`);
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.slots)) {
          setSlots(d.slots);
          if (d.aviso) setAvisoSlots(d.aviso);
          setCargandoSlots(false);
          return;
        }
      }
    } catch {
      // Si la API falla o está en reposo, consultar directamente a Supabase
    }

    // 2. Consulta en tiempo real en Supabase (Garantiza que citas o bloqueos dejen de aparecer inmediatamente)
    try {
      const horasBase = [
        '09:30', '10:00', '10:30', '11:00', '11:30',
        '12:00', '12:30', '13:00', '13:30', '14:00',
        '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
      ];
      const ahoraMs = Date.now();
      const horaCierreMs = new Date(`${f}T17:30:00-05:00`).getTime();

      let listaEmp = empleadas;
      if (listaEmp.length === 0) {
        const { data: canchasDb } = await supabase.from('canchas').select('id, nombre').eq('activa', true);
        if (canchasDb && canchasDb.length > 0) {
          listaEmp = canchasDb;
          setEmpleadas(canchasDb);
        }
      }

      const inicioBuffer = new Date(new Date(`${f}T00:00:00-05:00`).getTime() - 6 * 60 * 60 * 1000).toISOString();
      const finBuffer = new Date(new Date(`${f}T23:59:59-05:00`).getTime() + 6 * 60 * 60 * 1000).toISOString();

      const { data: reservasOcupadas } = await supabase
        .from('reservas')
        .select('id, cancha_id, fecha_inicio, fecha_fin, estado')
        .neq('estado', 'cancelada')
        .gte('fecha_inicio', inicioBuffer)
        .lte('fecha_inicio', finBuffer);

      // Excluir la reserva previa a reprogramar para no autobloquearse
      const ocupadas = (reservasOcupadas || []).filter(
        (r) => !reagendarId || r.id !== reagendarId
      );

      // Candidatos dinámicos: horas base + puntos exactos de fin de citas previas
      const candidatosSet = new Set<string>(horasBase);
      for (const r of ocupadas) {
        if (r.fecha_fin) {
          try {
            const dFin = new Date(r.fecha_fin);
            const hhmmFin = dFin.toLocaleTimeString('es-CO', {
              timeZone: 'America/Bogota',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
            const finMs = new Date(`${f}T${hhmmFin}:00-05:00`).getTime();
            const aperturaMs = new Date(`${f}T09:00:00-05:00`).getTime();
            if (finMs >= aperturaMs && finMs < horaCierreMs) {
              candidatosSet.add(hhmmFin);
            }
          } catch {
            // Ignorar fecha inválida
          }
        }
      }

      const candidatosOrdenados = Array.from(candidatosSet).sort();
      const slotsLibres: string[] = [];

      for (const h of candidatosOrdenados) {
        const slotStartMs = new Date(`${f}T${h}:00-05:00`).getTime();
        const slotEndMs = slotStartMs + duracion * 60 * 1000;

        // Si es hoy y la hora ya pasó, no se puede agendar
        if (slotStartMs <= ahoraMs) {
          continue;
        }

        // Si la cita se sale del horario de cierre del spa, descartar
        if (slotEndMs > horaCierreMs) {
          continue;
        }

        // Buscar qué manicuristas están ocupadas (cita agendada o bloqueo de horario)
        const ocupadasEnHora = ocupadas
          .filter((r) => {
            const rStart = new Date(r.fecha_inicio).getTime();
            const rEnd = new Date(r.fecha_fin).getTime();
            return rStart < slotEndMs && rEnd > slotStartMs;
          })
          .map((r) => r.cancha_id);

        if (emp) {
          // Si eligió manicurista específica: si esa manicurista está ocupada o bloqueada, NO aparece
          if (!ocupadasEnHora.includes(emp)) {
            slotsLibres.push(h);
          }
        } else {
          // Si eligió cualquiera disponible: debe haber al menos una libre
          const hayLibre = listaEmp.some((e) => !ocupadasEnHora.includes(e.id));
          if (hayLibre) {
            slotsLibres.push(h);
          }
        }
      }

      setSlots(slotsLibres);
      setAvisoSlots(
        slotsLibres.length === 0
          ? 'No hay horarios disponibles para esta fecha con la duración de este servicio. Prueba con otro día 💕'
          : null
      );
    } catch (errSupabase) {
      console.error('Error calculando slots en Supabase:', errSupabase);
      setSlots([]);
      setAvisoSlots('No fue posible consultar la disponibilidad. Por favor intenta nuevamente.');
    } finally {
      setCargandoSlots(false);
    }
  };

  // Cargar slots cuando cambia la fecha, la empleada o el servicio en el modal
  useEffect(() => {
    if (!modalAbierto || !fecha) return;
    setHoraSeleccionada(null);
    cargarSlots(fecha, empleadaId, servicioSeleccionado?.duracion);
  }, [modalAbierto, fecha, empleadaId, servicioSeleccionado?.id, servicioSeleccionado?.duracion]);

  const abrirModal = (s: Servicio) => {
    setServicioSeleccionado(s);
    setPaso(1);
    setHoraSeleccionada(null);
    setAvisoSlots(null);
    setMenuEspecialistaAbierto(false);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setPaso(1);
    setHoraSeleccionada(null);
    setReservaConfirmada(null);
    setMenuEspecialistaAbierto(false);
  };

  const handleConfirmarReserva = async () => {
    if (!servicioSeleccionado || !fecha || !horaSeleccionada || !telefono.trim() || !nombre.trim()) return;

    setEnviandoReserva(true);

    try {
      const res = await fetch('/api/spa/reservar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servicio_nombre: servicioSeleccionado.nombre,
          precio: servicioSeleccionado.precio,
          duracion_minutos: servicioSeleccionado.duracion,
          fecha,
          hora: horaSeleccionada,
          cancha_id: empleadaId || undefined,
          cliente_nombre: nombre.trim(),
          cliente_telefono: telefono.trim(),
          reagendar_reserva_id: reagendarId || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setReservaConfirmada({
          codigo: data.codigoReserva,
          empleada: data.empleada || 'Manicurista asignada',
          servicio: servicioSeleccionado.nombre,
          fecha,
          hora: horaSeleccionada,
          precio: servicioSeleccionado.precio,
          telefono: telefono.trim(),
        });
        setPaso(3);
        cargarSlots(fecha, empleadaId);
      } else {
        alert(data.error || 'Ocurrió un error al agendar tu cita.');
        cargarSlots(fecha, empleadaId);
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

        const empAsignada = empleadas.find((e) => e.id === empleadaId) || empleadas[0];
        const dInicio = new Date(`${fecha}T${horaSeleccionada}:00-05:00`);
        const dFin = new Date(dInicio.getTime() + (Number(servicioSeleccionado.duracion) || 60) * 60 * 1000);

        if (empAsignada && clienteId) {
          await supabase.from('reservas').insert({
            cancha_id: empAsignada.id,
            cliente_id: clienteId,
            fecha_inicio: dInicio.toISOString(),
            fecha_fin: dFin.toISOString(),
            valor_total: servicioSeleccionado.precio,
            valor_anticipo_requerido: 0,
            estado: 'confirmada',
            notas: `💅 Servicio: ${servicioSeleccionado.nombre} | Clienta: ${nombre.trim()} | Reserva Web JL Mímate Nails`,
          });

          if (reagendarId) {
            await supabase.from('reservas').delete().eq('id', reagendarId);
          }
        }

        setReservaConfirmada({
          codigo: 'WEB-' + Math.floor(1000 + Math.random() * 9000),
          empleada: empAsignada?.nombre || 'Manicurista asignada',
          servicio: servicioSeleccionado.nombre,
          fecha,
          hora: horaSeleccionada,
          precio: servicioSeleccionado.precio,
          telefono: telefono.trim(),
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

  const serviciosFiltrados = servicios.filter(
    (s) => categoriaActiva === 'Todos' || s.categoria === categoriaActiva
  );

  return (
    <div className="min-h-screen bg-[#FFF5F7] text-[#2D2529] font-sans antialiased selection:bg-[#F3C6D3] selection:text-[#8C243B] relative">
      {/* Botón superior para acceder a la administración y turnos (solo se queda arriba, no persigue la pantalla) */}
      {onIrAlAdmin && (
        <button
          onClick={onIrAlAdmin}
          className="absolute top-3 right-3 z-20 text-[10px] font-medium tracking-wide text-[#7D6870] hover:text-[#8C243B] bg-white/75 hover:bg-white border border-[#F2C4D2]/80 hover:border-[#F2C4D2] px-3 py-1.5 rounded-full shadow-2xs backdrop-blur-md transition cursor-pointer flex items-center gap-1 opacity-70 hover:opacity-100"
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
              src="/mimate-nails-logo.png"
              alt="JL Mímate Nails Logo Oficial"
              className="w-full h-full object-cover"
            />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2D2529] tracking-tight">
            JL Mímate Nails
          </h1>
          <p className="text-sm sm:text-base text-[#7D6870] max-w-md mx-auto italic font-medium leading-relaxed">
            "Mímate como te lo mereces. ¡Uñas hermosas, siempre perfectas!"
          </p>

          <div className="inline-flex items-center gap-2 bg-white/80 border border-[#F2C4D2] px-4 py-1.5 rounded-full shadow-xs text-xs font-bold text-[#8C243B]">
            <IconSparkles className="w-3.5 h-3.5 text-[#C74B66]" />
            <span>★ Reserva tu cita en segundos</span>
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
                  <span className="bg-white/25 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold">
                    Paso Activo
                  </span>
                </div>
                <p className="text-xs text-pink-100 leading-relaxed">
                  {citaPreviaInfo
                    ? `Cita previa: ${citaPreviaInfo.fecha} a las ${citaPreviaInfo.hora} con ${citaPreviaInfo.manicurista || 'especialista'}. `
                    : ''}
                  Elige tu nuevo horario o servicio abajo. Tu cita anterior seguirá activa y guardada hasta que confirmes la nueva fecha.
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
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#C74B66] block">
              Dónde
            </span>
            <p className="text-xs font-bold text-[#2D2529] group-hover:text-[#8C243B] flex items-center justify-center gap-1 transition">
              <IconMapPin className="w-3.5 h-3.5 text-[#C74B66] group-hover:scale-110 transition shrink-0" />
              Pereira, Cuba (Cl. 66 #26-57)
            </p>
            <p className="text-[11px] text-[#8C243B] font-semibold flex items-center justify-center gap-1 group-hover:underline">
              <span>Abrir en mapas</span>
              <span className="text-[10px]">📍</span>
            </p>
          </a>

          <div className="bg-white border border-[#F2C4D2] rounded-2xl p-4 text-center shadow-xs space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#C74B66] block">
              Horarios
            </span>
            <p className="text-xs font-bold text-[#2D2529] flex items-center justify-center gap-1">
              <IconClock className="w-3.5 h-3.5 text-[#C74B66] shrink-0" />
              Lun–Sáb 9:30 am – 5:30 pm
            </p>
            <p className="text-[11px] text-[#7D6870]">Domingos cerrado</p>
          </div>

          <div className="bg-white border border-[#F2C4D2] rounded-2xl p-4 text-center shadow-xs space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#C74B66] block">
              WhatsApp
            </span>
            <a
              href="https://wa.me/573219610896"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-[#8C243B] hover:text-[#C74B66] flex items-center justify-center gap-1 transition"
            >
              <IconBrandWhatsapp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              321 961 0896 💬
            </a>
            <p className="text-[11px] text-[#7D6870]">Atención y dudas</p>
          </div>
        </div>

        {/* SECCIÓN NUESTRO EQUIPO (4 EMPLEADAS) */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-[#2D2529] flex items-center gap-1.5">
            <span>Nuestro</span>
            <span className="italic text-[#C74B66] font-serif font-bold">equipo</span>
          </h2>

          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {empleadas.map((emp, i) => (
              <div key={emp.id} className="text-center w-20 shrink-0 space-y-1.5">
                <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-tr from-[#C74B66] to-[#F2C4D2] p-0.5 shadow-xs">
                  <div className="w-full h-full bg-white rounded-full flex items-center justify-center font-bold text-xs text-[#8C243B]">
                    {`M${i + 1}`}
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#5C4851] block leading-tight">
                  {emp.nombre}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN ELIGE TU SERVICIO + CATEGORÍAS */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-[#2D2529] flex items-center gap-1.5">
            <span>Elige tu</span>
            <span className="italic text-[#C74B66] font-serif font-bold">servicio</span>
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
                    : 'bg-white border border-[#F2C4D2] text-[#7D6870] hover:border-[#C74B66]'
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
                      {s.duracion} min
                    </span>
                  </div>
                  <p className="text-xs text-[#7D6870] max-w-md leading-relaxed">
                    {s.descripcion}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#FCE8EF]">
                  <span className="text-base font-extrabold text-[#8C243B] font-mono">
                    ${s.precio.toLocaleString('es-CO')}
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
      </main>

      {/* FOOTER */}
      <footer className="text-center py-8 text-xs text-[#7D6870] border-t border-[#F2C4D2]/60 space-y-1">
        <p className="font-semibold text-[#8C243B]">
          JL Mímate Nails✦
        </p>
        <p className="text-[11px] opacity-80">
          Lunes a Sábado 9:30 am a 5:30 pm
        </p>
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
                  <span className="text-[10px] font-extrabold tracking-widest uppercase text-[#C74B66] block">
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
              <div className="p-5 overflow-y-auto space-y-5">
                {/* PASO 1: SELECCIÓN DE FECHA Y HORARIO */}
                {paso === 1 && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-[#2D2529] flex items-center gap-1.5">
                        <span>¿Cuándo te</span>
                        <span className="italic text-[#C74B66] font-serif font-bold">esperamos?</span>
                      </h2>
                      <p className="text-xs text-[#7D6870]">
                        {servicioSeleccionado?.duracion} min · ${servicioSeleccionado?.precio.toLocaleString('es-CO')} COP
                      </p>
                    </div>

                    {/* Selector opcional de manicurista */}
                    <div className="space-y-1.5 relative">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#7D6870] block">
                        Especialista de uñas
                      </label>
                      <button
                        type="button"
                        onClick={() => setMenuEspecialistaAbierto(!menuEspecialistaAbierto)}
                        className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#2D2529] flex items-center justify-between hover:border-[#C74B66] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20 transition shadow-xs cursor-pointer text-left"
                      >
                        <span className="truncate">
                          {empleadas.find((e) => e.id === empleadaId)?.nombre || 'Cualquiera disponible (Recomendado)'}
                        </span>
                        <IconChevronDown
                          className={`w-4 h-4 text-[#C74B66] shrink-0 transition-transform duration-200 ${
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
                                  <span>{emp.nombre}</span>
                                  {sel && <IconCheck className="w-4 h-4 text-[#8C243B]" />}
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Selector de fecha */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#7D6870] block">
                        Fecha
                      </label>
                      <input
                        type="date"
                        min={hoyStr}
                        value={fecha}
                        onChange={(e) => setFecha(e.target.value)}
                        className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3 py-2 text-xs font-semibold text-[#2D2529] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20"
                      />
                    </div>

                    {/* Grid de Horarios */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-[#7D6870] block">
                        Horarios Disponibles (Lun–Sáb 9:30 am – 5:30 pm)
                      </label>

                      {cargandoSlots ? (
                        <div className="py-8 text-center text-xs text-[#7D6870] flex items-center justify-center gap-2">
                          <IconLoader2 className="w-4 h-4 animate-spin text-[#C74B66]" />
                          <span>Consultando horarios libres...</span>
                        </div>
                      ) : avisoSlots ? (
                        <div className="p-4 bg-white border border-[#F2C4D2] rounded-xl text-center text-xs text-[#8C243B] font-medium">
                          {avisoSlots}
                        </div>
                      ) : slots.length === 0 ? (
                        <div className="p-4 bg-white border border-[#F2C4D2] rounded-xl text-center text-xs text-[#7D6870]">
                          No hay turnos disponibles para esta fecha.
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {slots.map((s) => (
                            <button
                              key={s}
                              onClick={() => setHoraSeleccionada(s)}
                              className={`py-2 text-xs font-bold rounded-xl border transition cursor-pointer text-center ${
                                horaSeleccionada === s
                                  ? 'bg-[#8C243B] text-white border-[#8C243B] shadow-xs'
                                  : 'bg-white border-[#F2C4D2] text-[#2D2529] hover:border-[#C74B66]'
                              }`}
                            >
                              {s}
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
                        <span className="italic text-[#C74B66] font-serif font-bold">datos</span>
                      </h2>
                      <p className="text-xs text-[#7D6870]">
                        {servicioSeleccionado?.nombre} · {fecha} · {horaSeleccionada}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#7D6870] block">
                          WhatsApp de contacto
                        </label>
                        <input
                          type="tel"
                          placeholder="300 123 4567"
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3 py-2 text-xs font-semibold text-[#2D2529] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#7D6870] block">
                          Nombre completo
                        </label>
                        <input
                          type="text"
                          placeholder="Tu nombre y apellido"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="w-full bg-white border border-[#F2C4D2] rounded-xl px-3 py-2 text-xs font-semibold text-[#2D2529] focus:outline-none focus:ring-2 focus:ring-[#C74B66]/20"
                        />
                      </div>
                    </div>

                    {/* Aviso de no cobro anticipado */}
                    <div className="bg-white border border-[#F2C4D2] rounded-xl p-3 flex items-start gap-2 text-xs text-[#7D6870]">
                      <IconHeart className="w-4 h-4 text-[#C74B66] shrink-0 mt-0.5" />
                      <p className="leading-snug">
                        <strong>Sin cobro anticipado:</strong> Cancelas el valor de tu servicio (${servicioSeleccionado?.precio.toLocaleString('es-CO')} COP) el día de tu cita directamente en el spa.
                      </p>
                    </div>

                    {reagendarId && (
                      <div className="bg-[#FFF0F4] border border-[#F2C4D2] rounded-xl p-3 flex items-start gap-2 text-xs text-[#8C243B]">
                        <span className="text-base shrink-0">🔄</span>
                        <p className="leading-snug">
                          <strong>Reagendamiento:</strong> Al confirmar esta nueva cita, tu cita previa se cancelará automáticamente y quedará vigente este nuevo horario.
                        </p>
                      </div>
                    )}

                    {/* Botones volver y confirmar */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => setPaso(1)}
                        className="p-3 bg-white border border-[#F2C4D2] text-[#7D6870] hover:text-[#2D2529] rounded-xl transition cursor-pointer"
                        title="Volver"
                      >
                        <IconArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        disabled={enviandoReserva || !telefono.trim() || !nombre.trim()}
                        onClick={handleConfirmarReserva}
                        className="flex-1 py-3 bg-[#8C243B] hover:bg-[#731D30] disabled:opacity-40 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {enviandoReserva ? (
                          <>
                            <IconLoader2 className="w-4 h-4 animate-spin" />
                            <span>Confirmando cita...</span>
                          </>
                        ) : (
                          <span>Confirmar reserva</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* PASO 3: CONFIRMACIÓN EXITOSA */}
                {paso === 3 && reservaConfirmada && (
                  <div className="text-center space-y-4 py-2">
                    <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-[#C74B66] to-[#F2C4D2] flex items-center justify-center text-white shadow-md">
                      <IconCheck className="w-8 h-8 stroke-[3]" />
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-[#2D2529]">
                        ¡Cita <span className="italic text-[#C74B66] font-serif">confirmada!</span>
                      </h2>
                      <p className="text-xs text-[#7D6870] max-w-sm mx-auto leading-relaxed pt-1">
                        ¡Listo, reina! Enviamos tu comprobante oficial al WhatsApp{' '}
                        <strong className="text-[#8C243B]">{reservaConfirmada.telefono}</strong>.
                      </p>
                    </div>

                    {reagendarId && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs flex items-center justify-center gap-2 font-medium">
                        <span>✓</span>
                        <span>Tu cita previa fue cancelada y reemplazada con éxito por este nuevo turno.</span>
                      </div>
                    )}

                    {/* Tarjeta de recordatorio automático 1 día antes */}
                    <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3 text-left flex items-start gap-2.5 text-xs">
                      <IconBrandWhatsapp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-[#8C243B]">Recordatorio automático</p>
                        <p className="text-[11px] text-[#7D6870] leading-relaxed">
                          Te enviaremos un mensaje de recordatorio a tu WhatsApp <strong>1 día antes</strong> de tu cita.
                        </p>
                      </div>
                    </div>

                    {/* Resumen */}
                    <div className="bg-white border border-[#F2C4D2] rounded-2xl p-4 text-xs text-left space-y-2 shadow-xs">
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#7D6870]">Servicio:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.servicio}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#7D6870]">Especialista:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.empleada}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#7D6870]">Fecha:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.fecha}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FCE8EF] pb-1.5">
                        <span className="text-[#7D6870]">Hora:</span>
                        <span className="font-bold text-[#2D2529]">{reservaConfirmada.hora}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-[#FCE8EF] pb-1.5 gap-2">
                        <span className="text-[#7D6870] shrink-0">Lugar:</span>
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
                      <div className="flex justify-between pt-1">
                        <span className="text-[#7D6870] font-bold">Total a pagar en el spa:</span>
                        <span className="font-extrabold text-[#8C243B] font-mono text-sm">
                          ${reservaConfirmada.precio.toLocaleString('es-CO')}
                        </span>
                      </div>
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
    </div>
  );
};
