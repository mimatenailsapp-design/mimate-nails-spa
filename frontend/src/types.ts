export interface Cancha {
  id: string;
  nombre: string;
  deporte: 'futbol_5' | 'futbol_8' | 'futbol_11' | 'padel' | 'tenis' | 'voley';
  precio_estandar: number;
  precio_pico: number;
  activa: boolean;
  foto?: string | null;
}

export interface Reserva {
  id: string;
  cancha_id: string;
  cliente_id?: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: 'pendiente_pago' | 'confirmada' | 'cancelada' | 'completada' | 'bloqueada';
  valor_total: number;
  valor_anticipo_requerido: number;
  notas?: string;
  expiracion_reserva?: string;
  canchas?: {
    nombre: string;
    deporte: string;
  };
  clientes?: {
    nombre: string;
    telefono_wa: string;
  };
  pagos_anticipos?: Array<{
    id: string;
    metodo: string;
    monto: number;
    estado: string;
    referencia_transaccion?: string;
  }>;
}

export interface Complejo {
  id: string;
  slug?: string;
  tipo_negocio?: 'deportes' | 'barberia' | 'belleza_unas' | 'salud' | 'pedidos';
  nombre: string;
  direccion?: string;
  ciudad?: string;
  telefono_whatsapp?: string;
  whatsapp_phone_number_id?: string;
  whatsapp_token?: string;
  hora_apertura?: string;
  hora_cierre?: string;
  duracion_turno_minutos?: number;
  nequi_numero?: string;
  daviplata_numero?: string;
  titular_cuenta?: string;
}

export interface Metricas {
  total_reservas: number;
  reservas_confirmadas: number;
  ingresos_estimados: number;
  anticipos_recaudados: number;
}

export type RolUsuario = 'superadmin' | 'admin_complejo' | 'recepcion';

export interface PerfilUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  complejo_id?: string;
  complejos?: Complejo;
}
