-- ==============================================================================
-- JL MÍMATE NAILS SPA - ESQUEMA DE BASE DE DATOS LIMPIO (SUPABASE)
-- ==============================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Tipos Enums
DO $$ BEGIN
    CREATE TYPE estado_reserva AS ENUM ('pendiente_pago', 'confirmada', 'cancelada', 'completada', 'bloqueada');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_pago AS ENUM ('pendiente', 'aprobado', 'rechazado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE metodo_pago AS ENUM ('nequi', 'daviplata', 'transferencia_bancaria', 'efectivo');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Tabla: Negocio / Complejo (JL Mímate Nails)
CREATE TABLE IF NOT EXISTS complejos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL DEFAULT 'mimate-nails',
    nombre VARCHAR(150) NOT NULL DEFAULT 'JL Mímate Nails Spa',
    tipo_negocio VARCHAR(50) NOT NULL DEFAULT 'belleza_unas',
    direccion VARCHAR(255) DEFAULT 'Pereira, Colombia',
    ciudad VARCHAR(100) DEFAULT 'Pereira',
    telefono_whatsapp VARCHAR(25) NOT NULL DEFAULT '+573219610896',
    whatsapp_phone_number_id VARCHAR(100),
    whatsapp_token TEXT,
    hora_apertura TIME NOT NULL DEFAULT '08:00:00',
    hora_cierre TIME NOT NULL DEFAULT '19:00:00',
    duracion_turno_minutos INTEGER NOT NULL DEFAULT 60,
    nequi_numero VARCHAR(30) DEFAULT '3219610896',
    daviplata_numero VARCHAR(30) DEFAULT '3219610896',
    titular_cuenta VARCHAR(150) DEFAULT 'JL Mímate Nails Spa',
    porcentaje_anticipo_minimo NUMERIC(5, 2) DEFAULT 0.00,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla: Mesas de Manicura / Especialistas
CREATE TABLE IF NOT EXISTS canchas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complejo_id UUID NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL, -- 'Manicurista 1', 'Manicurista 2', etc.
    deporte VARCHAR(50) DEFAULT 'belleza_unas',
    precio_estandar NUMERIC(10, 2) NOT NULL DEFAULT 25000.00,
    precio_pico NUMERIC(10, 2) NOT NULL DEFAULT 25000.00,
    activa BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabla: Clientas registradas
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telefono_wa VARCHAR(25) UNIQUE NOT NULL,
    nombre VARCHAR(120),
    email VARCHAR(120),
    bloqueado BOOLEAN DEFAULT false,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla: Citas y Reservas
CREATE TABLE IF NOT EXISTS reservas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cancha_id UUID NOT NULL REFERENCES canchas(id) ON DELETE RESTRICT,
    cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
    fecha_inicio TIMESTAMPTZ NOT NULL,
    fecha_fin TIMESTAMPTZ NOT NULL,
    estado estado_reserva NOT NULL DEFAULT 'confirmada',
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    valor_anticipo_requerido NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notas TEXT,
    expiracion_reserva TIMESTAMPTZ,
    recordatorio_enviado BOOLEAN DEFAULT false,
    creado_en TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_rango_fechas CHECK (fecha_fin > fecha_inicio),
    CONSTRAINT no_doble_reserva EXCLUDE USING gist (
        cancha_id WITH =,
        tstzrange(fecha_inicio, fecha_fin) WITH &&
    ) WHERE (estado IN ('pendiente_pago', 'confirmada', 'bloqueada'))
);

-- 7. Tabla: Pagos de citas (opcional para abonos)
CREATE TABLE IF NOT EXISTS pagos_anticipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reserva_id UUID NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    metodo metodo_pago NOT NULL DEFAULT 'efectivo',
    monto NUMERIC(10, 2) NOT NULL DEFAULT 0,
    referencia_transaccion VARCHAR(100),
    comprobante_url TEXT,
    estado estado_pago NOT NULL DEFAULT 'aprobado',
    notas_admin TEXT,
    revisado_por VARCHAR(100),
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Tabla: Preguntas Frecuentes (FAQ) para Asistente IA WhatsApp
CREATE TABLE IF NOT EXISTS faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complejo_id UUID REFERENCES complejos(id) ON DELETE CASCADE,
    pregunta VARCHAR(255) NOT NULL,
    respuesta TEXT NOT NULL,
    categoria VARCHAR(50) DEFAULT 'general',
    activa BOOLEAN DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Inserción de Datos Iniciales (Seed para JL Mímate Nails)
DO $$
DECLARE
    v_complejo_id UUID;
BEGIN
    -- Crear o verificar negocio Mímate Nails
    IF NOT EXISTS (SELECT 1 FROM complejos WHERE slug = 'mimate-nails') THEN
        INSERT INTO complejos (
            slug, nombre, tipo_negocio, direccion, ciudad, 
            telefono_whatsapp, hora_apertura, hora_cierre, duracion_turno_minutos,
            nequi_numero, daviplata_numero, titular_cuenta, porcentaje_anticipo_minimo
        ) VALUES (
            'mimate-nails', 'JL Mímate Nails Spa', 'belleza_unas', 'Pereira, Colombia', 'Pereira',
            '+573219610896', '08:00:00', '19:00:00', 60,
            '3219610896', '3219610896', 'JL Mímate Nails', 0.00
        ) RETURNING id INTO v_complejo_id;
    ELSE
        SELECT id INTO v_complejo_id FROM complejos WHERE slug = 'mimate-nails' LIMIT 1;
    END IF;

    -- Crear las 4 Manicuristas / Mesas de trabajo
    IF NOT EXISTS (SELECT 1 FROM canchas WHERE complejo_id = v_complejo_id) THEN
        INSERT INTO canchas (complejo_id, nombre, deporte, precio_estandar, precio_pico, activa)
        VALUES 
            (v_complejo_id, 'Manicurista 1', 'belleza_unas', 25000, 25000, true),
            (v_complejo_id, 'Manicurista 2', 'belleza_unas', 25000, 25000, true),
            (v_complejo_id, 'Manicurista 3', 'belleza_unas', 25000, 25000, true),
            (v_complejo_id, 'Manicurista 4', 'belleza_unas', 25000, 25000, true);
    END IF;
END $$;

-- 10. Políticas de acceso (RLS) habilitadas para lectura y reservas
ALTER TABLE complejos ENABLE ROW LEVEL SECURITY;
ALTER TABLE canchas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_anticipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública para la web de citas
DROP POLICY IF EXISTS "Lectura pública de complejos" ON complejos;
CREATE POLICY "Lectura pública de complejos" ON complejos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Lectura pública de canchas" ON canchas;
CREATE POLICY "Lectura pública de canchas" ON canchas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Acceso total a reservas" ON reservas;
CREATE POLICY "Acceso total a reservas" ON reservas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total a clientes" ON clientes;
CREATE POLICY "Acceso total a clientes" ON clientes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura pública de faqs" ON faqs;
CREATE POLICY "Lectura pública de faqs" ON faqs FOR SELECT USING (true);
