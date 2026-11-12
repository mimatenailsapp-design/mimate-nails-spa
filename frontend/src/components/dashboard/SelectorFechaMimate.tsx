import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconCalendar,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';

export interface SelectorFechaMimateProps {
  value: string;
  onChange: (nuevaFechaIso: string) => void;
  hoyStr?: string;
  permitirFechasPasadas?: boolean;
  mostrarPildorasRapidas?: boolean;
  variante?: 'completo' | 'compacto';
  alignDropdown?: 'left' | 'right';
  title?: string;
  onOpen?: () => void;
}

export const SelectorFechaMimate: React.FC<SelectorFechaMimateProps> = ({
  value,
  onChange,
  hoyStr: hoyStrProp,
  permitirFechasPasadas = false,
  mostrarPildorasRapidas = true,
  variante = 'completo',
  alignDropdown,
  title,
  onOpen,
}) => {
  const hoyStr = useMemo(() => {
    if (hoyStrProp) return hoyStrProp;
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  }, [hoyStrProp]);

  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const [hoyYear, hoyMonth] = useMemo(() => {
    const [y, m] = hoyStr.split('-').map(Number);
    return [y, m - 1];
  }, [hoyStr]);

  const [añoVisualizado, setAñoVisualizado] = useState(() => {
    const base = value || hoyStr;
    const [y] = base.split('-').map(Number);
    return isNaN(y) ? hoyYear : y;
  });

  const [mesVisualizado, setMesVisualizado] = useState(() => {
    const base = value || hoyStr;
    const [, m] = base.split('-').map(Number);
    return isNaN(m) ? hoyMonth : m - 1;
  });

  useEffect(() => {
    if (!calendarioAbierto) return;
    const handleClickAfuera = (event: MouseEvent | TouchEvent) => {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(event.target as Node)
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

  const puedeIrMesAnterior = useMemo(() => {
    if (permitirFechasPasadas) return true;
    if (añoVisualizado > hoyYear) return true;
    if (añoVisualizado === hoyYear) return mesVisualizado > hoyMonth;
    return false;
  }, [permitirFechasPasadas, añoVisualizado, mesVisualizado, hoyYear, hoyMonth]);

  const cambiarMes = (delta: number) => {
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
    onChange(hoyStr);
    setCalendarioAbierto(false);
  };

  const nombreMesAño = useMemo(() => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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

    for (let i = primerDiaSemana - 1; i >= 0; i--) {
      const diaNum = diasEnMesPrev - i;
      res.push({
        tipo: 'prev',
        diaNum,
        iso: '',
        dayOfWeek: (primerDiaSemana - 1 - i + 1) % 7,
      });
    }

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

    const sobrantes = (7 - (res.length % 7)) % 7;
    for (let d = 1; d <= sobrantes; d++) {
      res.push({
        tipo: 'next',
        diaNum: d,
        iso: '',
        dayOfWeek: res.length % 7,
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
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const diaSemana = dias[fechaObj.getDay()];
    const diaNum = fechaObj.getDate();
    const mesNombre = meses[fechaObj.getMonth()];

    if (fechaIso === hoyStr) {
      return `Hoy · ${diaSemana}, ${diaNum} de ${mesNombre}`;
    }
    return `${diaSemana}, ${diaNum} de ${mesNombre}`;
  };

  const formatearFechaCorta = (fechaIso: string) => {
    if (!fechaIso) return '';
    const [y, m, d] = fechaIso.split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return fechaIso;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
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
      const esDomingo = dayOfWeek === 0;

      const yStr = cur.getFullYear();
      const mStr = String(cur.getMonth() + 1).padStart(2, '0');
      const dStr = String(cur.getDate()).padStart(2, '0');
      const isoStr = `${yStr}-${mStr}-${dStr}`;

      const label =
        i === 0
          ? 'Hoy'
          : i === 1
          ? 'Mañana'
          : `${diasCortos[dayOfWeek]} ${cur.getDate()}`;

      lista.push({
        iso: isoStr,
        label,
        diaNum: cur.getDate(),
        diaSemana: diasCortos[dayOfWeek],
        esDomingo,
      });
    }
    return lista;
  }, [hoyStr]);

  const posicionDropdown =
    (alignDropdown || (variante === 'compacto' ? 'right' : 'left')) === 'right'
      ? 'right-0 sm:w-[330px]'
      : 'left-0 right-0 sm:left-0 sm:right-auto sm:w-[340px]';

  const toggleCalendario = () => {
    setCalendarioAbierto((prev) => {
      const next = !prev;
      if (next) {
        if (value) {
          const [y, m] = value.split('-').map(Number);
          if (!isNaN(y) && !isNaN(m)) {
            setAñoVisualizado(y);
            setMesVisualizado(m - 1);
          }
        }
        if (onOpen) onOpen();
      }
      return next;
    });
  };

  return (
    <div className="space-y-2 relative" ref={contenedorRef}>
      {variante === 'compacto' ? (
        <button
          type="button"
          onClick={toggleCalendario}
          title={title || 'Seleccionar fecha en el calendario'}
          className={`px-2.5 py-1 bg-white border rounded-xl text-xs font-bold text-[#2D2529] flex items-center gap-1.5 cursor-pointer transition shadow-2xs ${
            calendarioAbierto
              ? 'border-[#8C243B] ring-2 ring-[#C74B66]/20 text-[#8C243B]'
              : 'border-[#F2C4D2] hover:border-[#8C243B]'
          }`}
        >
          <span>{formatearFechaCorta(value)}</span>
          <IconCalendar className="w-3.5 h-3.5 text-[#8C243B] shrink-0" />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleCalendario}
          className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#2D2529] flex items-center justify-between shadow-xs transition cursor-pointer active:scale-[0.99] ${
            calendarioAbierto
              ? 'border-[#8C243B] ring-2 ring-[#C74B66]/20'
              : 'border-[#F2C4D2] hover:border-[#C74B66]'
          }`}
          aria-label="Seleccionar fecha"
          aria-expanded={calendarioAbierto}
        >
          <div className="flex items-center gap-2.5 truncate">
            <IconCalendar className="w-4 h-4 text-[#C74B66] shrink-0" />
            <span className="font-bold text-[#2D2529] truncate capitalize">
              {formatearFechaElegante(value)}
            </span>
          </div>
          <IconChevronDown
            className={`w-4 h-4 text-[#7D6870] shrink-0 transition-transform duration-200 ${
              calendarioAbierto ? 'rotate-180 text-[#8C243B]' : ''
            }`}
          />
        </button>
      )}

      {/* Dropdown de Calendario con los tonos oficiales de JL Mímate Nails */}
      <AnimatePresence>
        {calendarioAbierto && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full ${posicionDropdown} mt-2 bg-white/98 backdrop-blur-md border border-[#F2C4D2] rounded-2xl shadow-2xl z-50 p-4 space-y-3 min-w-[290px]`}
          >
            {/* Cabecera del mes y controles */}
            <div className="flex items-center justify-between pb-2 border-b border-[#FCE8EF]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#FFF0F4] text-[#8C243B] flex items-center justify-center">
                  <IconCalendar className="w-4 h-4 text-[#C74B66]" />
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
                  className="p-1.5 rounded-lg hover:bg-[#FCE8EF] text-[#8C243B] transition cursor-pointer active:scale-95"
                  title="Siguiente mes"
                >
                  <IconChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 text-center text-[10px] font-extrabold uppercase tracking-wider text-[#7D6870]">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, idx) => (
                <div
                  key={d}
                  className={`py-1 ${idx === 6 ? 'text-[#C74B66]' : ''}`}
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

                const esPasado = !permitirFechasPasadas && d.iso < hoyStr;
                const esSeleccionado = d.iso === value;
                const esHoy = d.iso === hoyStr;
                const esDomingo = d.dayOfWeek === 0;

                return (
                  <button
                    key={d.iso}
                    type="button"
                    disabled={esPasado}
                    onClick={() => {
                      onChange(d.iso);
                      setCalendarioAbierto(false);
                    }}
                    className={`relative h-9 w-full rounded-xl flex flex-col items-center justify-center text-xs transition cursor-pointer ${
                      esSeleccionado
                        ? 'bg-gradient-to-tr from-[#8C243B] to-[#C74B66] text-white font-extrabold shadow-sm scale-105 z-10'
                        : esPasado
                        ? 'text-gray-300 cursor-not-allowed opacity-35'
                        : esDomingo
                        ? 'text-slate-400 hover:bg-slate-50 border border-dashed border-slate-200'
                        : 'text-[#2D2529] hover:bg-[#FFF0F4] hover:text-[#8C243B] font-semibold'
                    } ${
                      esHoy && !esSeleccionado
                        ? 'border border-[#C74B66] text-[#8C243B] bg-[#FFF5F7] font-bold'
                        : ''
                    }`}
                    title={esDomingo ? 'Domingo (Cerrado)' : d.iso}
                  >
                    <span className="leading-none">{d.diaNum}</span>
                    {esDomingo && !esSeleccionado && (
                      <span className="text-[7px] leading-none text-slate-400 mt-0.5">cerrado</span>
                    )}
                    {esHoy && !esSeleccionado && !esDomingo && (
                      <span className="w-1 h-1 rounded-full bg-[#C74B66] mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Pie de leyenda */}
            <div className="pt-2 border-t border-[#FCE8EF] flex items-center justify-between text-[11px] text-[#7D6870]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C74B66]" />
                <span>Lun–Sáb disponible</span>
              </div>
              <span className="text-[10px] text-slate-400 italic">Domingos cerrado 💕</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Píldoras rápidas de fechas (scroll horizontal) en variante completa */}
      {variante === 'completo' && mostrarPildorasRapidas && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-0.5 px-0.5">
          {diasRapidos.map((d) => {
            const activa = value === d.iso;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => onChange(d.iso)}
                className={`shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center min-w-[54px] cursor-pointer border ${
                  activa
                    ? 'bg-[#8C243B] text-white border-[#8C243B] shadow-xs'
                    : d.esDomingo
                    ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-60'
                    : 'bg-white text-[#2D2529] border-[#F2C4D2] hover:border-[#C74B66]'
                }`}
                title={d.esDomingo ? 'Domingo cerrado' : d.label}
              >
                <span className="text-[10px] uppercase font-extrabold tracking-wider leading-none">
                  {d.diaSemana}
                </span>
                <span className="text-sm font-bold leading-tight mt-0.5">
                  {d.diaNum}
                </span>
                {d.esDomingo && (
                  <span className="text-[8px] font-normal leading-none mt-0.5">
                    Cerrado
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
