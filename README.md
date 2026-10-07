# 💅 JL Mímate Nails Spa - Sistema de Reservas & Bot WhatsApp

Sistema web de reservas de citas y gestión de turnos para el salón y spa de uñas **JL Mímate Nails**. Cuenta con bot interactivo de WhatsApp (Meta Cloud API), gestión de agendas para manicuristas y verificación de pagos.

---

## 🚀 Estructura del Proyecto

- **`frontend/`**: Aplicación web desarrollada con React, Vite y Tailwind CSS.
  - `/` o `/reservar`: Página web pública de reservas para clientas.
  - `/admin` o `/mimate-admin`: Dashboard de gestión de turnos y agenda para las manicuristas (PIN por defecto: `1234`).
- **`backend/`**: Servidor API con Express, TypeScript y Node.js.
  - Webhooks de WhatsApp Cloud API.
  - Sincronización en tiempo real con Supabase.
  - Notificaciones y recordatorios automáticos 24 horas antes de cada cita.
- **`database/`**:
  - `mimate_schema.sql`: Script listo para ejecutar en el SQL Editor de tu proyecto en Supabase.

---

## 🛠️ Ejecución en Local

### 1. Backend:
```bash
cd backend
npm install
npm run dev
# Servidor corriendo en http://localhost:3000
```

### 2. Frontend:
```bash
cd frontend
npm install
npm run dev
# Aplicación corriendo en http://localhost:5173
```

---

## 🔑 Variables de Entorno Backend (`backend/.env`)

```ini
PORT=3000
NODE_ENV=development

# Credenciales de Supabase
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_secret_service_role_key

# Configuración de WhatsApp Cloud API (Meta Developers)
WHATSAPP_TOKEN=tu_token_permanente
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_VERIFY_TOKEN=token_secreto_mimate_2026

# ID del negocio Mímate Nails
DEFAULT_COMPLEJO_ID=id_uuid_mimate_nails

# Google Gemini AI Vision (Gratis)
GEMINI_API_KEY=tu_api_key_de_gemini
```
