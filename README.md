# 💅 JL Mímate Nails Spa - Sistema de Reservas & Bot WhatsApp

Sistema web de reservas de citas y gestión de turnos para el salón y spa de uñas **JL Mímate Nails**. Cuenta con bot inteligente de WhatsApp conectado directamente mediante **Baileys**, gestión de agendas para manicuristas, recepción con IA y verificación automática de anticipos.

---

## 🚀 Estructura del Proyecto

- **`frontend/`**: Aplicación web desarrollada con React, Vite y Tailwind CSS.
  - `/` o `/reservar`: Página web pública de reservas para clientas.
  - `/admin` o `/mimate-admin`: Dashboard de gestión de turnos y agenda para las manicuristas (PIN por defecto: `1234`).
- **`backend/`**: Servidor API con Express, TypeScript y Node.js.
  - Bot de WhatsApp nativo con Baileys (sin intermediarios de Meta).
  - Escáner visual de código QR en `/qr`.
  - Persistencia y restauración de sesión automática en Supabase.
  - Notificaciones y recordatorios automáticos de citas.
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
# Para vincular WhatsApp, visita http://localhost:3000/qr
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

# ID del negocio Mímate Nails
DEFAULT_COMPLEJO_ID=3bd1708c-21de-42a8-a529-d7c91fd41ed2

# Google Gemini AI Vision
GEMINI_API_KEY=tu_api_key_de_gemini

# Lista blanca opcional de números autorizados para pruebas
# BAILEYS_WHITELIST_NUMBERS=573022779797,573223739845
```
