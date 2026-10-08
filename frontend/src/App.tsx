import { useState, useEffect } from 'react';
import { MimateNailsBooking } from './components/MimateNailsBooking';
import { MimateNailsDashboard } from './components/MimateNailsDashboard';

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
      <MimateNailsDashboard
        onIrAWebReservas={irAReservas}
        complejoId="3bd1708c-21de-42a8-a529-d7c91fd41ed2"
      />
    );
  }

  return <MimateNailsBooking onIrAlAdmin={irAlAdmin} />;
}

export default App;
