import axios from 'axios';
import { supabase } from '../config/supabase.js';

export interface Complejo {
  id: string;
  slug?: string;
  tipo_negocio?: 'deportes' | 'barberia' | 'belleza_unas' | 'salud' | string;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  telefono_whatsapp: string;
  whatsapp_phone_number_id?: string;
  whatsapp_token?: string;
  nequi_numero?: string;
  daviplata_numero?: string;
  hora_apertura?: string;
  hora_cierre?: string;
  titular_cuenta?: string;
  porcentaje_anticipo_minimo?: number;
}

export interface Cancha {
  id: string;
  complejo_id: string;
  nombre: string;
  deporte: string;
  precio_estandar: number;
  precio_pico: number;
}

export interface HorarioDisponible {
  hora_inicio: string;
  hora_fin: string;
  disponible: boolean;
  precio: number;
}

export class BookingService {
  /**
   * Obtiene todos los complejos registrados (Multi-empresa)
   */
  static async getComplejos(): Promise<Complejo[]> {
    const { data, error } = await supabase.from('complejos').select('*').order('nombre');
    if (error) throw error;
    return data || [];
  }

  /**
   * Obtiene un complejo por su ID o por su Slug
   */
  static async getComplejo(identificador: string): Promise<Complejo | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identificador);
    let query = supabase.from('complejos').select('*');
    if (isUuid) {
      query = query.eq('id', identificador);
    } else {
      query = query.eq('slug', identificador);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Identifica qué empresa recibió el mensaje de WhatsApp a partir del Phone ID de Meta o el número
   */
  static async getComplejoByPhone(phoneId?: string, displayPhone?: string): Promise<Complejo> {
    if (phoneId) {
      const { data } = await supabase
        .from('complejos')
        .select('*')
        .eq('whatsapp_phone_number_id', phoneId)
        .maybeSingle();
      if (data) return data;
    }

    if (displayPhone) {
      const limpio = displayPhone.replace(/\D/g, '');
      const { data } = await supabase
        .from('complejos')
        .select('*')
        .ilike('telefono_whatsapp', `%${limpio}%`)
        .maybeSingle();
      if (data) return data;
    }

    // Si no coincide o es demo, retornar el primer complejo registrado
    const complejos = await this.getComplejos();
    if (complejos.length > 0) return complejos[0];

    throw new Error('No hay complejos deportivos configurados en el sistema.');
  }

  /**
   * Crea una nueva empresa / complejo deportivo en la plataforma
   */
  static async crearComplejo(datos: Partial<Complejo>): Promise<Complejo> {
    try {
      const { data, error } = await supabase
        .from('complejos')
        .insert(datos)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err: any) {
      if (err.message?.includes('tipo_negocio')) {
        const { tipo_negocio, ...resto } = datos;
        const { data, error } = await supabase
          .from('complejos')
          .insert(resto)
          .select()
          .single();
        if (error) throw error;
        return { ...data, tipo_negocio: tipo_negocio || 'deportes' };
      }
      throw err;
    }
  }

  /**
   * Obtiene o crea un cliente en la base de datos a partir de su número de WhatsApp
   */
  static async getOrCreateCliente(telefono: string, nombre?: string) {
    const { data: existing, error: findError } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefono_wa', telefono)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      // Retornar cliente existente sin sobreescribir su nombre histórico
      return existing;
    }

    const { data: created, error: createError } = await supabase
      .from('clientes')
      .insert({ telefono_wa: telefono, nombre: nombre || 'Usuario WhatsApp' })
      .select()
      .single();

    if (createError) throw createError;
    return created;
  }

  /**
   * Obtiene todas las canchas activas registradas en Supabase (filtradas por complejo)
   */
  static async getCanchas(complejoId?: string): Promise<Cancha[]> {
    let query = supabase.from('canchas').select('*').eq('activa', true).order('nombre');
    if (complejoId) {
      query = query.eq('complejo_id', complejoId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Consulta los horarios disponibles ejecutando la función RPC 'obtener_horarios_disponibles'
   * y descartando horas que ya pasaron si la consulta es para el día de hoy en Colombia (UTC-5)
   */
  static async getHorariosDisponibles(canchaId: string, fechaIso: string): Promise<HorarioDisponible[]> {
    await this.liberarReservasExpiradas();

    const { data, error } = await supabase.rpc('obtener_horarios_disponibles', {
      p_cancha_id: canchaId,
      p_fecha: fechaIso,
    });

    if (error) throw error;
    const horarios = (data || []) as HorarioDisponible[];

    // Obtener la fecha y hora actual en Colombia (America/Bogota, UTC-5)
    const ahora = new Date();
    const fechaCol = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const hoyColStr = `${fechaCol.getFullYear()}-${String(fechaCol.getMonth() + 1).padStart(2, '0')}-${String(fechaCol.getDate()).padStart(2, '0')}`;
    const horaColStr = `${String(fechaCol.getHours()).padStart(2, '0')}:${String(fechaCol.getMinutes()).padStart(2, '0')}:00`;

    const esHoy = fechaIso === hoyColStr;

    return horarios.map((h) => {
      // Si la base de datos ya lo tiene ocupado por reserva o bloqueo
      if (!h.disponible) {
        return { ...h, disponible: false };
      }

      // Si la fecha es hoy y la hora de inicio ya pasó, marcar como no disponible
      if (esHoy && h.hora_inicio <= horaColStr) {
        return { ...h, disponible: false };
      }

      return h;
    });
  }

  /**
   * Crea una pre-reserva con bloqueo de 15 minutos en PostgreSQL.
   */
  static async crearPreReserva(params: {
    canchaId: string;
    clienteId: string;
    fechaInicio: string;
    fechaFin: string;
    valorTotal: number;
    porcentajeAnticipo?: number;
  }) {
    const porcentaje = params.porcentajeAnticipo ?? 50;
    const anticipoRequerido = (params.valorTotal * porcentaje) / 100;
    const esConfirmadaDirecta = porcentaje === 0;
    const expiracion = esConfirmadaDirecta ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const estado = esConfirmadaDirecta ? 'confirmada' : 'pendiente_pago';

    const { data, error } = await supabase
      .from('reservas')
      .insert({
        cancha_id: params.canchaId,
        cliente_id: params.clienteId,
        fecha_inicio: params.fechaInicio,
        fecha_fin: params.fechaFin,
        estado,
        valor_total: params.valorTotal,
        valor_anticipo_requerido: anticipoRequerido,
        expiracion_reserva: expiracion,
      })
      .select('*, canchas(nombre)')
      .single();

    if (error) {
      if (error.code === '23P01') {
        throw new Error('Lo sentimos, este turno acaba de ser apartado por otra persona.');
      }
      throw error;
    }

    return data;
  }

  /**
   * Registra el pago del anticipo y confirma la reserva en la base de datos
   */
  static async registrarPagoAnticipo(params: {
    reservaId: string;
    metodo: 'nequi' | 'daviplata' | 'transferencia_bancaria';
    monto: number;
    comprobanteUrl?: string;
    referencia?: string;
  }) {
    const { data: pago, error: pagoError } = await supabase
      .from('pagos_anticipos')
      .insert({
        reserva_id: params.reservaId,
        metodo: params.metodo,
        monto: params.monto,
        comprobante_url: params.comprobanteUrl,
        referencia_transaccion: params.referencia,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (pagoError) throw pagoError;

    const { data: reserva, error: reservaError } = await supabase
      .from('reservas')
      .update({ estado: 'confirmada', expiracion_reserva: null })
      .eq('id', params.reservaId)
      .select()
      .single();

    if (reservaError) throw reservaError;
    return { pago, reserva };
  }

  /**
   * Libera reservas pendientes cuyo tiempo de pago superó el límite establecido (60 min)
   */
  static async liberarReservasExpiradas() {
    const ahora = new Date().toISOString();
    try {
      const { data: expiradas } = await supabase
        .from('reservas')
        .select('*, canchas!inner(*, complejos!inner(*)), clientes(*)')
        .in('estado', ['pendiente_anticipo', 'pendiente_pago'])
        .not('expiracion_reserva', 'is', null)
        .lt('expiracion_reserva', ahora);

      if (!expiradas || expiradas.length === 0) return;

      for (const r of expiradas) {
        const notas = r.notas || '';
        // Si la clienta ya envió el comprobante y la IA lo validó en revisión, NO se cancela
        if (notas.includes('[COMPROBANTE_VALIDO_IA]') || notas.includes('[COMPROBANTE_RECIBIDO]')) {
          continue;
        }

        console.log(`[EXPIRACION] Liberando turno de reserva ${r.id} por falta de comprobante de anticipo`);
        await supabase
          .from('reservas')
          .update({
            estado: 'cancelada',
            notas: `${notas} | [EXPIRADO] Cancelada automáticamente por superar el tiempo límite de anticipo`,
          })
          .eq('id', r.id);

        // Enviar notificación por WhatsApp a la clienta
        const cliente = r.clientes as any;
        const cancha = r.canchas as any;
        const complejo = cancha?.complejos as any;

        if (cliente?.telefono_wa) {
          const horaStr = new Date(r.fecha_inicio).toLocaleTimeString('es-CO', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/Bogota',
          });
          const msgAviso =
            `🌸 *JL MÍMATE NAILS* 🌸\n\n` +
            `Hola *${cliente.nombre || 'Reina'}*, te informamos que tu turno para las *${horaStr}* ha sido liberado porque no recibimos el comprobante de anticipo dentro del tiempo límite.\n\n` +
            `Si aún deseas apartar tu espacio, con gusto puedes volver a agendar en nuestra agenda web:\n` +
            `👉 https://mimate-nails-spa.vercel.app 💕💅`;

          const token = complejo?.whatsapp_token || process.env.WHATSAPP_TOKEN;
          const phoneId = complejo?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
          if (token && phoneId) {
            try {
              let cleanPhone = String(cliente.telefono_wa).replace(/\D/g, '');
              if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) cleanPhone = `57${cleanPhone}`;
              await axios.post(
                `https://graph.facebook.com/v21.0/${phoneId}/messages`,
                {
                  messaging_product: 'whatsapp',
                  to: cleanPhone,
                  type: 'text',
                  text: { body: msgAviso },
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );
            } catch (e: any) {
              console.warn('Error enviando aviso de liberación por WhatsApp:', e.message);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error en liberarReservasExpiradas:', err.message);
    }
  }
}
