import React, { useState, useEffect } from 'react';
import { tieneConsentimientoRegistrado, registrarConsentimiento } from '../../utils/cookieConsent';
import { IconCookie, IconCheck, IconShieldLock, IconX } from '@tabler/icons-react';

export const CookieConsentBanner: React.FC = () => {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    // Si la usuaria aún no ha decidido, mostramos el aviso tras un breve retardo para suavidad visual
    if (!tieneConsentimientoRegistrado()) {
      const timer = setTimeout(() => {
        setMostrar(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!mostrar) return null;

  const handleAceptarTodas = () => {
    registrarConsentimiento('accepted');
    setMostrar(false);
  };

  const handleSoloNecesarias = () => {
    registrarConsentimiento('essential');
    setMostrar(false);
  };

  return (
    <aside
      aria-label="Aviso de cookies y privacidad"
      role="region"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="bg-white/95 backdrop-blur-md border border-[#F2C4D2] shadow-xl rounded-2xl p-4 sm:p-4.5 text-[#2D2529]">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FFF5F7] border border-[#F2C4D2] flex items-center justify-center shrink-0 text-[#8C243B]">
            <IconCookie className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-xs font-bold text-[#8C243B] flex items-center gap-1.5">
                <IconShieldLock className="w-3.5 h-3.5 text-[#C74B66]" />
                Privacidad y Cookies
              </h3>
              <button
                type="button"
                onClick={handleSoloNecesarias}
                aria-label="Cerrar aviso de cookies"
                className="text-[#7D6870] hover:text-[#2D2529] p-0.5 rounded-md transition cursor-pointer"
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-[#7D6870]">
              Utilizamos cookies y almacenamiento local estrictamente necesarios para garantizar la
              seguridad de tu sesión, agendamiento de citas y preferencias en JL Mímate Nails.
            </p>

            <div className="flex items-center gap-2 mt-3 pt-1">
              <button
                type="button"
                onClick={handleAceptarTodas}
                className="flex-1 py-1.5 px-3 bg-[#8C243B] hover:bg-[#731D30] text-white text-[11px] font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1 cursor-pointer active:scale-95"
              >
                <IconCheck className="w-3.5 h-3.5" />
                Aceptar
              </button>
              <button
                type="button"
                onClick={handleSoloNecesarias}
                className="py-1.5 px-3 bg-[#FFF5F7] hover:bg-[#FCE8EF] text-[#8C243B] border border-[#F2C4D2] text-[11px] font-medium rounded-xl transition cursor-pointer active:scale-95"
              >
                Solo necesarias
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
