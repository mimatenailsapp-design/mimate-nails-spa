# 💅 Guía de Despliegue en la Nube - JL Mímate Nails Spa ($0 USD)

Esta guía explica paso a paso cómo desplegar en producción el sistema de citas y bot de WhatsApp con **Baileys (conexión directa sin intermediarios de Meta)** para **JL Mímate Nails Spa**.

---

## 1. Arquitectura de Servicios

| Servicio | Proveedor | Función |
| :--- | :--- | :--- |
| **Base de Datos** | [Supabase](https://supabase.com) | PostgreSQL en la nube, citas en tiempo real y persistencia de sesión Baileys |
| **Visor Web (Frontend)** | [Vercel](https://vercel.com) | Web pública de reservas (`/`) y Panel de turnos (`/admin`) |
| **Bot API (Backend)** | [Render](https://render.com) | API Express, motor de Baileys, IA Gemini y recordatorios automáticos |
| **Canal WhatsApp** | [Baileys Directo](https://github.com/WhiskeySockets/Baileys) | Conexión directa a WhatsApp Web sin intermediarios ni costos de Meta |

---

## 2. Paso a Paso

### A. Base de Datos en Supabase
1. Crea un proyecto nuevo en [Supabase](https://supabase.com) llamado `mimate-nails`.
2. Ve a **SQL Editor** y ejecuta todo el contenido de `database/mimate_schema.sql`.
   - Creará automáticamente las tablas y las especialistas con sus turnos.
3. Copia de **Project Settings > API**:
   - `Project URL`
   - `anon public key`
   - `service_role key`

### B. Backend en Render
1. En [Render](https://render.com), crea un **New Web Service** conectado a tu repo.
2. Configuración:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
3. Variables de Entorno en Render:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `SUPABASE_URL`: *(Tu URL de Supabase)*
   - `SUPABASE_SERVICE_ROLE_KEY`: *(Tu service_role key)*
   - `GEMINI_API_KEY`: *(Tu API key de Google Gemini para IA y comprobantes)*
   - `BAILEYS_WHITELIST_NUMBERS`: *(Opcional: números autorizados separados por coma para modo blindado de pruebas)*
4. Al desplegar obtendrás tu URL: `https://mimate-nails-api.onrender.com`.

### C. Vinculación de WhatsApp con Baileys (QR)
1. Con el backend desplegado, abre en tu navegador:
   - `https://mimate-nails-api.onrender.com/qr`
2. En tu teléfono:
   - Abre WhatsApp > **Ajustes** / **Menú (⋮)** > **Dispositivos Vinculados** > **Vincular un dispositivo**.
3. Escanea el código QR que se muestra en pantalla.
4. ¡Listo! La sesión se respalda automáticamente en la base de datos de Supabase para que Render la mantenga viva incluso tras reinicios.

### D. Frontend en Vercel
1. En [Vercel](https://vercel.com), importa tu repositorio de GitHub.
2. Selecciona **Root Directory**: `frontend`.
3. Haz clic en **Deploy**.
4. ¡Listo! Tu web quedará activa en:
   - `https://tu-proyecto.vercel.app/` -> Reservas de clientas.
   - `https://tu-proyecto.vercel.app/admin` -> Panel de turnos de las manicuristas (PIN `1234`).
