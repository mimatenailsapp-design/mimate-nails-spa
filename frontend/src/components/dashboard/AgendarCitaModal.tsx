import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SelectorFechaMimate } from './SelectorFechaMimate';
import { supabase } from '../../config/supabase';
import { formatearHora12 } from '../../utils/formatoHora';
import { esTarifaDesdeDiciembre, obtenerPrecioServicioParaFecha } from '../../utils/tarifas';
import {
  IconX,
  IconClock,
  IconCheck,
  IconChevronDown,
  IconAlertCircle,
  IconLoader2,
  IconSparkles,
} from '@tabler/icons-react';

interface ClienteSugerido {
  id: string;
  nombre: string;
  telefono: string;
}

const normalizarTextoCliente = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const formatearTelefonoLocal = (telefono: string): string => {
  const digits = telefono.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('573')) {
    return digits.substring(2);
  }
  return digits || telefono.trim();
};

export interface AgendarCitaModalProps {
  abierto: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  canchas: Array<{ id: string; nombre: string }>;
  servicios: Array<{
    id: number;
    nombre: string;
    categoria: string;
    duracion: number;
    precio: number;
    precioDiciembre?: number;
    descripcion?: string;
  }>;
  agendarManicuristaId: string;
  setAgendarManicuristaId: (id: string) => void;
  menuManiAbierto: boolean;
  setMenuManiAbierto: (open: boolean) => void;
  manicuristaSeleccionadaForm?: { id: string; nombre: string };
  agendarServicioId: number;
  setAgendarServicioId: (id: number) => void;
  menuServicioAbierto: boolean;
  setMenuServicioAbierto: (open: boolean) => void;
  servicioSeleccionadoForm?: {
    id: number;
    nombre: string;
    categoria: string;
    duracion: number;
    precio: number;
    precioDiciembre?: number;
  };
  // Servicios extras adicionales
  agendarServiciosExtrasIds: number[];
  setAgendarServiciosExtrasIds: React.Dispatch<React.SetStateAction<number[]>>;
  duracionTotalAdmin: number;
  precioTotalAdmin: number;
  // Campos de formulario
  agendarFecha: string;
  setAgendarFecha: (f: string) => void;
  agendarHora: string;
  setAgendarHora: (h: string) => void;
  menuHoraAbierto: boolean;
  setMenuHoraAbierto: (open: boolean) => void;
  horasDisponiblesAgendarAdmin: string[];
  agendarNombre: string;
  setAgendarNombre: (n: string) => void;
  agendarTelefono: string;
  setAgendarTelefono: (t: string) => void;
  errorAgendar: string | null;
  guardandoCita: boolean;
}

export const AgendarCitaModal: React.FC<AgendarCitaModalProps> = ({
  abierto,
  onClose,
  onSubmit,
  canchas,
  servicios,
  agendarManicuristaId,
  setAgendarManicuristaId,
  menuManiAbierto,
  setMenuManiAbierto,
  manicuristaSeleccionadaForm,
  agendarServicioId,
  setAgendarServicioId,
  menuServicioAbierto,
  setMenuServicioAbierto,
  servicioSeleccionadoForm,
  agendarServiciosExtrasIds,
  setAgendarServiciosExtrasIds,
  duracionTotalAdmin,
  precioTotalAdmin,
  agendarFecha,
  setAgendarFecha,
  agendarHora,
  setAgendarHora,
  menuHoraAbierto,
  setMenuHoraAbierto,
  horasDisponiblesAgendarAdmin,
  agendarNombre,
  setAgendarNombre,
  agendarTelefono,
  setAgendarTelefono,
  errorAgendar,
  guardandoCita,
}) => {
  const [menuExtrasAbierto, setMenuExtrasAbierto] = useState(false);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteEncontrado, setClienteEncontrado] = useState<ClienteSugerido | null>(null);
  const [sugerenciasClientes, setSugerenciasClientes] = useState<ClienteSugerido[]>([]);
  const ultimoNombreBuscado = useRef<string>('');
  const nombreSeleccionadoManual = useRef<string>('');

  // Resetear estados al cerrar modal
  useEffect(() => {
    if (!abierto) {
      setClienteEncontrado(null);
      setSugerenciasClientes([]);
      setBuscandoCliente(false);
      ultimoNombreBuscado.current = '';
      nombreSeleccionadoManual.current = '';
    }
  }, [abierto]);

  const seleccionarClienteSugerido = (cliente: ClienteSugerido) => {
    const clave = normalizarTextoCliente(cliente.nombre);
    nombreSeleccionadoManual.current = clave;
    ultimoNombreBuscado.current = clave;
    setAgendarNombre(cliente.nombre);
    setAgendarTelefono(cliente.telefono);
    setClienteEncontrado(cliente);
    setSugerenciasClientes([]);
  };

  // Asociación automática de nombre -> teléfono en la base de datos (solo en vista de administradoras y especialistas)
  useEffect(() => {
    if (!abierto) return;
    const raw = agendarNombre.trim();
    const clave = normalizarTextoCliente(raw);

    if (clave.length < 2) {
      setClienteEncontrado(null);
      setSugerenciasClientes([]);
      setBuscandoCliente(false);
      ultimoNombreBuscado.current = '';
      nombreSeleccionadoManual.current = '';
      return;
    }

    if (nombreSeleccionadoManual.current && nombreSeleccionadoManual.current === clave) {
      return;
    }

    if (ultimoNombreBuscado.current === clave) return;

    const timer = setTimeout(async () => {
      ultimoNombreBuscado.current = clave;
      setBuscandoCliente(true);
      try {
        const qEscapado = raw.replace(/[%_]/g, '\\$&');
        const { data } = await supabase
          .from('clientes')
          .select('id, nombre, telefono_wa')
          .ilike('nombre', `%${qEscapado}%`)
          .not('telefono_wa', 'is', null)
          .limit(25);

        const unicosMap = new Map<string, ClienteSugerido>();
        for (const row of data || []) {
          const nombreRow = (row.nombre || '').trim();
          const telLocal = formatearTelefonoLocal(row.telefono_wa || '');
          if (!nombreRow || !telLocal) continue;
          const dedupKey = `${normalizarTextoCliente(nombreRow)}::${telLocal}`;
          if (!unicosMap.has(dedupKey)) {
            unicosMap.set(dedupKey, {
              id: String(row.id),
              nombre: nombreRow,
              telefono: telLocal,
            });
          }
        }

        const todos = Array.from(unicosMap.values());
        // Si hay coincidencias exactas con ese nombre, mostrar exclusivamente las opciones asociadas a ese nombre
        const exactos = todos.filter((c) => normalizarTextoCliente(c.nombre) === clave);
        const candidatos = exactos.length > 0 ? exactos : todos;

        if (candidatos.length === 1) {
          const unico = candidatos[0];
          setAgendarTelefono(unico.telefono);
          setClienteEncontrado(unico);
          setSugerenciasClientes([]);
        } else if (candidatos.length > 1) {
          setClienteEncontrado(null);
          setSugerenciasClientes(candidatos);
        } else {
          setClienteEncontrado(null);
          setSugerenciasClientes([]);
        }
      } catch (err) {
        console.error('Error buscando clienta por nombre:', err);
        setClienteEncontrado(null);
        setSugerenciasClientes([]);
      } finally {
        setBuscandoCliente(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [abierto, agendarNombre, setAgendarTelefono]);

  return (
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 border border-[#F2C4D2] shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
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
                    Registro rápido de cita en cabina
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full text-[#7D6870] hover:text-[#2D2529] cursor-pointer"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
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
                    setMenuExtrasAbierto(false);
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                >
                  <span className="flex items-center gap-2">
                    {(() => {
                      const foto = manicuristaSeleccionadaForm && (
                        (manicuristaSeleccionadaForm as any).foto ||
                        (manicuristaSeleccionadaForm.nombre.toLowerCase().includes('lili') ? '/equipo/lili.jpg' :
                         manicuristaSeleccionadaForm.nombre.toLowerCase().includes('jhoana') ? '/equipo/jhoana.jpg' :
                         manicuristaSeleccionadaForm.nombre.toLowerCase().includes('manuela') ? '/equipo/manuela.jpg' : null)
                      );
                      return foto ? (
                        <img src={foto} alt={manicuristaSeleccionadaForm?.nombre} className="w-6 h-6 rounded-full object-cover border border-[#F2C4D2]" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-[#FCE8EF] text-[#8C243B] flex items-center justify-center text-[10px]">💅</span>
                      );
                    })()}
                    <span>{manicuristaSeleccionadaForm?.nombre || 'Seleccionar Manicurista'}</span>
                  </span>
                  <IconChevronDown
                    className={`w-4 h-4 text-[#8C243B] transition-transform ${
                      menuManiAbierto ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {menuManiAbierto && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#F2C4D2] rounded-2xl shadow-xl p-1.5 space-y-1"
                    >
                      {canchas.map((c) => {
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
                            <div className="flex items-center gap-2.5">
                              {(() => {
                                const foto = (c as any).foto ||
                                  (c.nombre.toLowerCase().includes('lili') ? '/equipo/lili.jpg' :
                                   c.nombre.toLowerCase().includes('jhoana') ? '/equipo/jhoana.jpg' :
                                   c.nombre.toLowerCase().includes('manuela') ? '/equipo/manuela.jpg' : null);
                                return foto ? (
                                  <img src={foto} alt={c.nombre} className="w-6 h-6 rounded-full object-cover border border-[#F2C4D2] shrink-0" />
                                ) : (
                                  <span className="w-6 h-6 rounded-full bg-[#FCE8EF] text-[#8C243B] text-[10px] flex items-center justify-center font-bold shrink-0">💅</span>
                                );
                              })()}
                              <span className="text-xs font-semibold">{c.nombre}</span>
                            </div>
                            {estaSel && <IconCheck className="w-4 h-4 text-[#8C243B]" />}
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 2. MENÚ DESPLEGABLE ELEGANTE: SERVICIO DE UÑAS PRINCIPAL */}
              <div className="relative">
                <label className="font-bold text-[#7D6870] block mb-1">
                  Servicio Principal
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMenuServicioAbierto(!menuServicioAbierto);
                    setMenuManiAbierto(false);
                    setMenuHoraAbierto(false);
                    setMenuExtrasAbierto(false);
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                >
                  <div className="truncate pr-2">
                    <span>{servicioSeleccionadoForm?.nombre || 'Seleccionar Servicio'}</span>
                    <span className="text-[11px] font-mono text-[#8C243B] ml-2">
                      (${obtenerPrecioServicioParaFecha(servicioSeleccionadoForm, agendarFecha).toLocaleString('es-CO')} · {servicioSeleccionadoForm?.duracion} min)
                    </span>
                  </div>
                  <IconChevronDown
                    className={`w-4 h-4 text-[#8C243B] shrink-0 transition-transform ${
                      menuServicioAbierto ? 'rotate-180' : ''
                    }`}
                  />
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
                              // Si el servicio estaba como extra, quitarlo de extras
                              setAgendarServiciosExtrasIds((prev) => prev.filter((id) => id !== s.id));
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
                                ${obtenerPrecioServicioParaFecha(s, agendarFecha).toLocaleString('es-CO')}
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

              {/* 2B. SERVICIOS EXTRA / ADICIONALES (OPCIONAL) */}
              <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl p-3.5 space-y-2.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#8C243B] flex items-center gap-1.5">
                      <span>💅 Servicios en la cita</span>
                      <span className="text-[10px] font-bold text-[#8C243B] bg-[#FCE8EF] px-2 py-0.5 rounded-full border border-[#F2C4D2]">
                        {1 + agendarServiciosExtrasIds.length}
                      </span>
                    </label>
                  </div>

                  {/* Chips de extras seleccionados (arriba donde antes estaba el botón) */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {servicioSeleccionadoForm && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-[#2D2529] border border-[#F2C4D2] rounded-full text-xs font-semibold shadow-2xs">
                        <span>✨ {servicioSeleccionadoForm.nombre}</span>
                        <span className="font-mono text-[11px] text-[#7D6870]">
                          ({servicioSeleccionadoForm.duracion}m · ${obtenerPrecioServicioParaFecha(servicioSeleccionadoForm, agendarFecha).toLocaleString('es-CO')})
                        </span>
                      </span>
                    )}
                    {servicios
                      .filter((s) => agendarServiciosExtrasIds.includes(s.id))
                      .map((extra) => (
                        <span
                          key={extra.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] rounded-full text-xs font-semibold shadow-2xs"
                        >
                          <span className="font-bold">+ {extra.nombre}</span>
                          <span className="font-mono text-[10px] text-[#8C243B]/80">
                            (+{extra.duracion}m · +${obtenerPrecioServicioParaFecha(extra, agendarFecha).toLocaleString('es-CO')})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setAgendarServiciosExtrasIds((prev) =>
                                prev.filter((id) => id !== extra.id)
                              )
                            }
                            className="hover:text-red-700 ml-0.5 text-xs font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>
                </div>

                {/* Botón para agregar otro servicio (intercambiado abajo) */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuExtrasAbierto(!menuExtrasAbierto);
                    setMenuManiAbierto(false);
                    setMenuServicioAbierto(false);
                    setMenuHoraAbierto(false);
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer border ${
                    menuExtrasAbierto
                      ? 'bg-[#8C243B] text-white border-[#8C243B]'
                      : 'bg-white hover:bg-[#FDF0F4] text-[#8C243B] border-[#F2C4D2] hover:border-[#8C243B]'
                  }`}
                >
                  <span className="text-base leading-none font-extrabold">+</span>
                  <span>Agregar otro servicio</span>
                  <IconChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      menuExtrasAbierto ? 'rotate-180 text-white' : 'text-[#8C243B]'
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {menuExtrasAbierto && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-white border border-[#F2C4D2] rounded-xl shadow-md p-1.5 max-h-48 overflow-y-auto space-y-1"
                    >
                      {servicios
                        .filter((s) => s.id !== agendarServicioId)
                        .map((s) => {
                          const yaAgregado = agendarServiciosExtrasIds.includes(s.id);
                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                setAgendarServiciosExtrasIds((prev) =>
                                  yaAgregado
                                    ? prev.filter((id) => id !== s.id)
                                    : [...prev, s.id]
                                );
                              }}
                              className={`p-2.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition ${
                                yaAgregado
                                  ? 'bg-[#FCE8EF] text-[#8C243B] font-bold'
                                  : 'hover:bg-[#FFF5F7] text-[#2D2529]'
                              }`}
                            >
                              <div>
                                <p className="font-semibold text-xs">{s.nombre}</p>
                                <p className="text-[10px] text-[#7D6870]">
                                  {s.categoria} · +{s.duracion} min
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs text-[#8C243B]">
                                  +${obtenerPrecioServicioParaFecha(s, agendarFecha).toLocaleString('es-CO')}
                                </span>
                                <span
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                                    yaAgregado
                                      ? 'bg-[#8C243B] text-white'
                                      : 'border border-[#F2C4D2] text-[#7D6870]'
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
              </div>

              {/* 3. FECHA Y HORA (CON CALENDARIO Y MENÚ ELEGANTE MÍMATE NAILS) */}
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-[#7D6870] block">Fecha</label>
                    <span className="text-[10px] text-[#C74B66] font-medium">
                      Toca para cambiar de día
                    </span>
                  </div>
                  <SelectorFechaMimate
                    value={agendarFecha}
                    onChange={(nuevaFecha) => setAgendarFecha(nuevaFecha)}
                    mostrarPildorasRapidas={true}
                    onOpen={() => {
                      setMenuManiAbierto(false);
                      setMenuServicioAbierto(false);
                      setMenuHoraAbierto(false);
                      setMenuExtrasAbierto(false);
                    }}
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
                      setMenuExtrasAbierto(false);
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#FFF5F7] border border-[#F2C4D2] hover:border-[#8C243B] rounded-xl font-bold text-[#2D2529] flex items-center justify-between transition cursor-pointer text-left shadow-2xs"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[#8C243B]">
                      <IconClock className="w-4 h-4 text-[#C74B66]" />
                      {agendarHora ? formatearHora12(agendarHora) : 'Seleccionar turno disponible'}
                    </span>
                    <IconChevronDown
                      className={`w-4 h-4 text-[#8C243B] transition-transform ${
                        menuHoraAbierto ? 'rotate-180' : ''
                      }`}
                    />
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
                            {agendarFecha && new Date(`${agendarFecha}T12:00:00-05:00`).getDay() === 0
                              ? 'Los domingos estamos cerrados. Por favor elige un día de Lunes a Sábado 💕'
                              : `No hay horarios disponibles para esta fecha con la duración total (${duracionTotalAdmin} min).`}
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
                                <span>{formatearHora12(h)}</span>
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

              {/* 4. DATOS DE LA CLIENTA (ASOCIACIÓN AUTOMÁTICA NOMBRE -> TELÉFONO EN VISTA DE ADMINISTRADORAS / ESPECIALISTAS) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-[#7D6870] block">
                    Nombre de la Clienta
                  </label>
                  {buscandoCliente && (
                    <span className="text-[10px] text-[#8C243B] flex items-center gap-1 font-medium animate-pulse">
                      <IconLoader2 className="w-3 h-3 animate-spin" /> Buscando número...
                    </span>
                  )}
                  {clienteEncontrado && (
                    <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <IconCheck className="w-3 h-3 text-emerald-600" /> Registrada en sistema
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Ej: Camila Restrepo"
                  value={agendarNombre}
                  onChange={(e) => {
                    nombreSeleccionadoManual.current = '';
                    setAgendarNombre(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[#2D2529] font-medium outline-none focus:border-[#8C243B]"
                  required
                />

                {sugerenciasClientes.length > 1 && (
                  <div className="mt-1.5 bg-white border border-[#F2C4D2] rounded-2xl shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-[#FFF5F7] border-b border-[#FCE8EF] text-[10px] font-bold text-[#8C243B]">
                      Se encontraron {sugerenciasClientes.length} opciones para "{agendarNombre.trim()}". Selecciona el número correcto:
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-[#FCE8EF]">
                      {sugerenciasClientes.map((opcion) => (
                        <button
                          key={`${opcion.id}-${opcion.telefono}`}
                          type="button"
                          onClick={() => seleccionarClienteSugerido(opcion)}
                          className="w-full px-3 py-2 text-left hover:bg-[#FFF5F7] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="text-xs font-semibold text-[#2D2529] truncate">
                            {opcion.nombre}
                          </span>
                          <span className="text-xs font-mono font-bold text-[#8C243B] bg-[#FCE8EF] px-2 py-0.5 rounded-lg shrink-0">
                            {opcion.telefono}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {clienteEncontrado ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#8C243B] bg-[#FCE8EF] px-2.5 py-1.5 rounded-xl mt-1.5 font-medium border border-[#F2C4D2]">
                    <IconSparkles className="w-3.5 h-3.5 text-[#C74B66] shrink-0" />
                    <span>
                      Clienta identificada: <strong>{clienteEncontrado.nombre}</strong> — Teléfono:{' '}
                      <strong className="font-mono">{clienteEncontrado.telefono}</strong> (llenado automáticamente)
                    </span>
                  </div>
                ) : sugerenciasClientes.length === 0 ? (
                  <p className="text-[10px] text-[#7D6870] mt-0.5">
                    Al escribir el nombre, el teléfono se llenará automáticamente o podrás elegir entre los números registrados con ese nombre.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="font-bold text-[#7D6870] block mb-1">
                  Teléfono WhatsApp (10 dígitos)
                </label>
                <input
                  type="tel"
                  placeholder="Ej: 321 961 0896"
                  value={agendarTelefono}
                  onChange={(e) => setAgendarTelefono(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl text-[#2D2529] font-mono outline-none focus:border-[#8C243B]"
                  required
                />
              </div>

              {/* 5. RESUMEN EN VIVO TOTAL: TIEMPO Y PRECIO COMBINADO */}
              <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-2xl p-3 flex items-center justify-between text-xs shadow-2xs">
                <div>
                  <span className="font-bold text-[#2D2529] block">
                    {1 + agendarServiciosExtrasIds.length} {1 + agendarServiciosExtrasIds.length === 1 ? 'servicio' : 'servicios seleccionados'}
                  </span>
                  <span className="text-[10px] text-[#7D6870]">
                    Horario: {agendarHora ? formatearHora12(agendarHora) : '--:--'} · {duracionTotalAdmin} min
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#7D6870] block font-medium">
                    Total a cobrar{esTarifaDesdeDiciembre(agendarFecha) && !esTarifaDesdeDiciembre() ? ' (Tarifa dic)' : ''}:
                  </span>
                  <span className="font-mono font-extrabold text-sm text-[#8C243B]">
                    ${precioTotalAdmin.toLocaleString('es-CO')} COP
                  </span>
                </div>
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
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-[#7D6870] font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCita || !agendarHora}
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
  );
};
