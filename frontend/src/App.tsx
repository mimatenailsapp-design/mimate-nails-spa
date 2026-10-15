import { useState, useEffect, lazy, Suspense } from 'react';

// Carga perezosa (Code-Splitting): Las clientas solo descargan la web de reservas, ahorrando ~600KB de código del Dashboard
const MimateNailsBooking = lazy(() =>
  import('./components/MimateNailsBooking').then((m) => ({ default: m.MimateNailsBooking }))
);
const MimateNailsDashboard = lazy(() =>
  import('./components/MimateNailsDashboard').then((m) => ({ default: m.MimateNailsDashboard }))
);

function PantallaCarga({ mensaje }: { mensaje?: string }) {
  return (
    <div className="min-h-screen bg-[#FFF5F7] flex flex-col items-center justify-center p-4">
      <div className="relative flex items-center justify-center">
        <div className="w-14 h-14 rounded-full border-4 border-[#F2C4D2] border-t-[#C74B66] animate-spin" />
        <span className="absolute text-xl">💅</span>
      </div>
      <p className="mt-4 text-xs font-bold tracking-wider text-[#8C243B] uppercase animate-pulse">
        {mensaje || 'JL Mímate Nails'}
      </p>
    </div>
  );
}

export function App() {
  const getRutaActual = () => {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (['admin', 'mimate-admin', 'dashboard', 'turnos', 'spa-dashboard'].includes(path)) {
      return 'admin';
    }
    return 'reservas';
  };

  const [vista, setVista] = useState<'reservas' | 'admin'>(getRutaActual);

  useEffect(() => {
    const onPopState = () => {
      setVista(getRutaActual());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const irAlAdmin = () => {
    window.history.pushState(null, '', '/mimate-admin');
    setVista('admin');
  };

  const irAReservas = () => {
    window.history.pushState(null, '', '/');
    setVista('reservas');
  };

  if (vista === 'admin') {
    return (
      <Suspense fallback={<PantallaCarga mensaje="Cargando Panel de Administración..." />}>
        <MimateNailsDashboard
          onIrAWebReservas={irAReservas}
          complejoId="3bd1708c-21de-42a8-a529-d7c91fd41ed2"
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PantallaCarga mensaje="Preparando tu experiencia de belleza..." />}>
      <MimateNailsBooking onIrAlAdmin={irAlAdmin} />
    </Suspense>
  );
}

export default App;
