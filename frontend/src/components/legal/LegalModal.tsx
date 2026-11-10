import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconX,
  IconShieldLock,
  IconScale,
  IconBuildingStore,
  IconServer,
  IconExternalLink,
  IconMail,
  IconPhone,
  IconMapPin,
  IconCheck,
} from '@tabler/icons-react';

export type LegalTab = 'datos' | 'terminos' | 'aviso' | 'seguridad';

export interface LegalModalProps {
  abierto: boolean;
  tabInicial?: LegalTab;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  abierto,
  tabInicial = 'datos',
  onClose,
}) => {
  const [tabActiva, setTabActiva] = useState<LegalTab>(tabInicial);

  useEffect(() => {
    if (tabInicial) {
      setTabActiva(tabInicial);
    }
  }, [tabInicial]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abierto) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto, onClose]);

  if (!abierto) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-[#FDF8F9] border border-[#F2C4D2] w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        >
          {/* Header del Modal */}
          <div className="p-4 sm:p-5 border-b border-[#F2C4D2] bg-white flex items-center justify-between gap-3 shrink-0">
            <div>
              <span className="text-[10px] font-extrabold tracking-widest uppercase text-[#C74B66] block">
                Marco Legal y Normativo · Colombia
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#2D2529] flex items-center gap-1.5">
                <span>JL Mímate Nails Spa</span>
                <span className="text-xs font-normal text-[#7D6870]">✦ Devmake</span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#FFF5F7] border border-[#F2C4D2] text-[#7D6870] hover:text-[#8C243B] hover:border-[#8C243B] flex items-center justify-center transition cursor-pointer"
              title="Cerrar modal"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>

          {/* Selector de pestañas */}
          <div className="flex border-b border-[#F2C4D2] bg-[#FCE8EF]/40 overflow-x-auto no-scrollbar shrink-0 text-xs font-semibold">
            <button
              onClick={() => setTabActiva('datos')}
              className={`flex items-center gap-1.5 px-4 py-3 whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                tabActiva === 'datos'
                  ? 'border-[#8C243B] text-[#8C243B] bg-white font-bold'
                  : 'border-transparent text-[#7D6870] hover:text-[#2D2529]'
              }`}
            >
              <IconShieldLock className="w-4 h-4 text-[#C74B66]" />
              <span>Datos Personales (Ley 1581)</span>
            </button>
            <button
              onClick={() => setTabActiva('terminos')}
              className={`flex items-center gap-1.5 px-4 py-3 whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                tabActiva === 'terminos'
                  ? 'border-[#8C243B] text-[#8C243B] bg-white font-bold'
                  : 'border-transparent text-[#7D6870] hover:text-[#2D2529]'
              }`}
            >
              <IconScale className="w-4 h-4 text-[#C74B66]" />
              <span>Términos y Cancelaciones (Ley 1480)</span>
            </button>
            <button
              onClick={() => setTabActiva('aviso')}
              className={`flex items-center gap-1.5 px-4 py-3 whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                tabActiva === 'aviso'
                  ? 'border-[#8C243B] text-[#8C243B] bg-white font-bold'
                  : 'border-transparent text-[#7D6870] hover:text-[#2D2529]'
              }`}
            >
              <IconBuildingStore className="w-4 h-4 text-[#C74B66]" />
              <span>Aviso Legal & PQR</span>
            </button>
            <button
              onClick={() => setTabActiva('seguridad')}
              className={`flex items-center gap-1.5 px-4 py-3 whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                tabActiva === 'seguridad'
                  ? 'border-[#8C243B] text-[#8C243B] bg-white font-bold'
                  : 'border-transparent text-[#7D6870] hover:text-[#2D2529]'
              }`}
            >
              <IconServer className="w-4 h-4 text-[#C74B66]" />
              <span>Seguridad (Ley 1273 / Devmake)</span>
            </button>
          </div>

          {/* Cuerpo del Modal con scroll */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-[#2D2529] leading-relaxed">
            {/* 1. DATOS PERSONALES */}
            {tabActiva === 'datos' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3.5 space-y-1">
                  <h3 className="font-bold text-[#8C243B] text-sm flex items-center gap-2">
                    <IconShieldLock className="w-4 h-4 text-[#C74B66]" />
                    Política de Tratamiento de Datos Personales
                  </h3>
                  <p className="text-xs text-[#7D6870]">
                    Cumplimiento de la Ley Estatutaria 1581 de 2012 y el Decreto Reglamentario 1377 de 2013 de la República de Colombia.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[#8C243B]">1. Responsable del Tratamiento</h4>
                    <p className="text-[#55434A]">
                      <strong>JL Mímate Nails Spa</strong>, establecimiento comercial ubicado en Pereira, Risaralda (Sector Cuba, Calle 66 bis #26-57). Correo de atención:{' '}
                      <a href="mailto:Mimatenailsapp@gmail.com" className="text-[#8C243B] font-semibold underline">
                        Mimatenailsapp@gmail.com
                      </a>.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">2. Encargado del Tratamiento y Soporte Tecnológico</h4>
                    <p className="text-[#55434A]">
                      La infraestructura tecnológica, software y base de datos son operadas por{' '}
                      <strong>Devmake (Developers Maven Kernel)</strong> (
                      <a
                        href="https://devmake.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#8C243B] font-semibold underline inline-flex items-center gap-0.5"
                      >
                        devmake.vercel.app <IconExternalLink className="w-3 h-3 inline" />
                      </a>
                      ) en calidad de encargado tecnológico, implementando protocolos de seguridad y custodia de la información conforme a la Ley 1273 de 2009.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">3. Finalidad de la Recolección de Datos</h4>
                    <p className="text-[#55434A]">Los datos de contacto (nombre y teléfono celular) suministrados en el agendamiento son utilizados exclusivamente para:</p>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-[#55434A]">
                      <li>Agendar, gestionar y confirmar tu cita de manicura, pedicura o sistemas acrílicos.</li>
                      <li>Enviar confirmaciones inmediatas y recordatorios previos a través de WhatsApp.</li>
                      <li>Gestionar solicitudes de reprogramación o cancelación oportuna.</li>
                      <li>Atención personalizada y prestación directa de los servicios en el local.</li>
                    </ul>
                    <p className="text-xs text-[#7D6870] mt-1.5 italic">
                      Tus datos <strong>nunca son vendidos, compartidos ni cedidos a terceros</strong> con fines publicitarios o comerciales ajenos al spa.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">4. Derechos del Titular (Derechos ARCO)</h4>
                    <p className="text-[#55434A]">
                      Como titular de tus datos personales tienes derecho a:
                    </p>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-[#55434A]">
                      <li><strong>Conocer y acceder:</strong> Saber qué datos tuyos reposan en nuestras bases de datos.</li>
                      <li><strong>Actualizar y rectificar:</strong> Corregir información inexacta o desactualizada.</li>
                      <li><strong>Revocar y suprimir:</strong> Solicitar la eliminación total de tus datos personales cuando lo desees.</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">5. Canales para Ejercer tus Derechos</h4>
                    <p className="text-[#55434A]">
                      Puedes solicitar la supresión o rectificación de tus datos enviando un correo a{' '}
                      <a href="mailto:Mimatenailsapp@gmail.com" className="text-[#8C243B] font-semibold underline">
                        Mimatenailsapp@gmail.com
                      </a>{' '}
                      o a través de nuestro WhatsApp oficial. Tu solicitud será atendida en un plazo máximo de quince (15) días hábiles conforme al Art. 15 de la Ley 1581 de 2012.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. TÉRMINOS Y CONDICIONES */}
            {tabActiva === 'terminos' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3.5 space-y-1">
                  <h3 className="font-bold text-[#8C243B] text-sm flex items-center gap-2">
                    <IconScale className="w-4 h-4 text-[#C74B66]" />
                    Términos y Condiciones de Reserva y Estatuto del Consumidor
                  </h3>
                  <p className="text-xs text-[#7D6870]">
                    Conforme a la Ley 1480 de 2011 (Estatuto del Consumidor de Colombia).
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[#8C243B]">1. Precios Claros y Finales</h4>
                    <p className="text-[#55434A]">
                      Todas las tarifas publicadas en nuestra web corresponden al <strong>precio final al consumidor expresado en pesos colombianos (COP)</strong>. JL Mímate Nails Spa pertenece al régimen tributario No Responsable de IVA (antiguo Régimen Simplificado, Art. 437 del Estatuto Tributario), por lo que no se cobran sobrecostos ni impuestos ocultos al finalizar tu servicio.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">2. Pre-reserva y Abono de Cupo</h4>
                    <p className="text-[#55434A]">
                      Para asegurar tu turno y garantizar la disponibilidad de la manicurista elegida, el sistema puede solicitar un abono fijo de pre-reserva ($20.000 o $25.000 COP según temporada). Este valor es <strong>100% abonable al costo total de tu servicio</strong>. El saldo restante se cancela el día de la cita directamente en el spa mediante Nequi, Daviplata o efectivo.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">3. Políticas de Cancelación y Reprogramación</h4>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-[#55434A]">
                      <li>
                        <strong>Reprogramación sin costo:</strong> Puedes cambiar la fecha u hora de tu cita con un mínimo de <strong>2 horas de anticipación</strong>. Tu abono se transfiere íntegramente a tu nuevo turno sin penalidad.
                      </li>
                      <li>
                        <strong>Cancelaciones tardías o inasistencias:</strong> Las cancelaciones realizadas con menos de 2 horas de antelación o la inasistencia sin aviso imposibilitan reasignar el turno a otra clienta, por lo que el abono se destina a cubrir los costos operativos y el tiempo reservado de la manicurista.
                      </li>
                      <li>
                        <strong>Tolerancia de llegada:</strong> Contamos con un margen de tolerancia máximo de <strong>10 minutos</strong>. Pasado este tiempo, para no perjudicar las citas de las siguientes clientas, el servicio podrá ser reprogramado o ajustado.
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">4. Garantía del Servicio</h4>
                    <p className="text-[#55434A]">
                      En caso de desprendimiento involuntario o falla técnica en esmaltado semipermanente o sistema acrílico dentro de los tres (3) días calendario posteriores al servicio, realizamos el retoque o reparación sin costo adicional previa valoración técnica.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. AVISO LEGAL & PQR */}
            {tabActiva === 'aviso' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3.5 space-y-1">
                  <h3 className="font-bold text-[#8C243B] text-sm flex items-center gap-2">
                    <IconBuildingStore className="w-4 h-4 text-[#C74B66]" />
                    Aviso Legal, Identificación del Establecimiento y PQR
                  </h3>
                  <p className="text-xs text-[#7D6870]">
                    Información de transparencia corporativa y atención al usuario.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[#8C243B]">1. Identificación del Comercio</h4>
                    <div className="bg-white p-3 rounded-xl border border-[#F2C4D2] space-y-1.5 text-xs text-[#55434A] mt-1">
                      <p className="flex items-center gap-2">
                        <IconBuildingStore className="w-4 h-4 text-[#C74B66] shrink-0" />
                        <span><strong>Nombre Comercial:</strong> JL Mímate Nails Spa</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <IconMapPin className="w-4 h-4 text-[#C74B66] shrink-0" />
                        <span><strong>Dirección física:</strong> Calle 66 bis #26-57, Sector Cuba, Pereira, Risaralda, Colombia</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <IconMail className="w-4 h-4 text-[#C74B66] shrink-0" />
                        <span><strong>Correo institucional / PQR:</strong> Mimatenailsapp@gmail.com</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <IconPhone className="w-4 h-4 text-[#C74B66] shrink-0" />
                        <span><strong>Línea de WhatsApp:</strong> +57 322 373 9845</span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">2. Procedimiento de Peticiones, Quejas y Reclamos (PQR)</h4>
                    <p className="text-[#55434A]">
                      Cualquier clienta o usuario puede radicar sus peticiones, quejas o reclamos escribiendo a nuestro correo{' '}
                      <a href="mailto:Mimatenailsapp@gmail.com" className="text-[#8C243B] font-semibold underline">
                        Mimatenailsapp@gmail.com
                      </a>{' '}
                      o comunicándose directamente con la administración por WhatsApp.
                    </p>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-[#55434A]">
                      <li>Tiempo de acuse de recibo: Dentro de las 24 horas siguientes.</li>
                      <li>Tiempo de respuesta y solución formal: Máximo quince (15) días hábiles.</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">3. Desarrollo y Gestión Tecnológica</h4>
                    <p className="text-[#55434A]">
                      El aplicativo web y sistema automatizado de reservas ha sido desarrollado y es gestionado tecnológicamente por{' '}
                      <strong>Devmake (Developers Maven Kernel)</strong>:{' '}
                      <a
                        href="https://devmake.vercel.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#8C243B] font-semibold underline inline-flex items-center gap-0.5"
                      >
                        https://devmake.vercel.app/ <IconExternalLink className="w-3 h-3 inline" />
                      </a>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. SEGURIDAD INFORMÁTICA */}
            {tabActiva === 'seguridad' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-[#FFF5F7] border border-[#F2C4D2] rounded-xl p-3.5 space-y-1">
                  <h3 className="font-bold text-[#8C243B] text-sm flex items-center gap-2">
                    <IconServer className="w-4 h-4 text-[#C74B66]" />
                    Seguridad de la Información y Protección de Sistemas
                  </h3>
                  <p className="text-xs text-[#7D6870]">
                    Cumplimiento de la Ley 1273 de 2009 de la República de Colombia (Delitos Informáticos y Custodia de Datos).
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[#8C243B]">1. Medidas Técnicas Implementadas por Devmake</h4>
                    <p className="text-[#55434A]">
                      Para salvaguardar la confidencialidad, integridad y disponibilidad de la información de las clientas, la plataforma implementa:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div className="p-2.5 rounded-xl bg-white border border-[#F2C4D2] space-y-1">
                        <span className="font-bold text-xs text-[#8C243B] flex items-center gap-1.5">
                          <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> Cifrado HTTPS / SSL
                        </span>
                        <p className="text-[11px] text-[#7D6870] leading-tight">
                          Toda la comunicación entre tu navegador y nuestros servidores viaja cifrada con certificados SSL modernos de 256 bits.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white border border-[#F2C4D2] space-y-1">
                        <span className="font-bold text-xs text-[#8C243B] flex items-center gap-1.5">
                          <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> Control de Acceso (RBAC)
                        </span>
                        <p className="text-[11px] text-[#7D6870] leading-tight">
                          Las manicuristas acceden exclusivamente a la vista de su agenda asignada. El portal administrativo cuenta con PIN protegido.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white border border-[#F2C4D2] space-y-1">
                        <span className="font-bold text-xs text-[#8C243B] flex items-center gap-1.5">
                          <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> Sanitización y 防 XSS
                        </span>
                        <p className="text-[11px] text-[#7D6870] leading-tight">
                          Filtrado activo de datos contra inyecciones SQL y ataques maliciosos de cross-site scripting (XSS).
                        </p>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white border border-[#F2C4D2] space-y-1">
                        <span className="font-bold text-xs text-[#8C243B] flex items-center gap-1.5">
                          <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> Sin almacenamiento bancario
                        </span>
                        <p className="text-[11px] text-[#7D6870] leading-tight">
                          No guardamos claves, números de tarjeta ni datos bancarios. Las transferencias se realizan en los canales oficiales de Nequi/Daviplata.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#8C243B]">2. Responsabilidad y Custodia Tecnológica</h4>
                    <p className="text-[#55434A]">
                      En estricto cumplimiento de la Ley 1273 de 2009, Devmake y JL Mímate Nails Spa aplican políticas de mínimo privilegio y auditoría de eventos para prevenir cualquier acceso no autorizado, intercepción o alteración ilícita de datos.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer del Modal */}
          <div className="p-3.5 sm:p-4 border-t border-[#F2C4D2] bg-white flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-[#7D6870]">
              Última actualización: Noviembre 2026
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[#8C243B] hover:bg-[#731D30] text-white font-bold text-xs transition cursor-pointer shadow-xs"
            >
              Entendido y Cerrar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
