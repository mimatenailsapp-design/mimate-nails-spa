import { supabase } from '../config/supabase';

let channel: any = null;

function getChannel() {
  if (!channel) {
    channel = supabase.channel('mimate-reservas-realtime');
    channel.subscribe((status: string) => {
      console.log(`⚡ [Realtime Backend] Canal mimate-reservas-realtime conectado con estado: ${status}`);
    });
  }
  return channel;
}

export function notificarCambioReservas(
  tipo: 'INSERT' | 'UPDATE' | 'DELETE',
  detalle?: any
): void {
  try {
    const ch = getChannel();
    ch.send({
      type: 'broadcast',
      event: 'cambio-reservas',
      payload: {
        eventType: tipo,
        detalle,
        timestamp: Date.now(),
      },
    }).catch((err: any) => {
      console.warn('⚠️ [Realtime Backend] Error enviando broadcast de reservas:', err?.message || err);
    });
  } catch (e: any) {
    console.warn('⚠️ [Realtime Backend] Excepción broadcast:', e?.message || e);
  }
}
