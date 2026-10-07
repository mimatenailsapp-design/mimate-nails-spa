# 💅 Guía de Despliegue en la Nube - JL Mímate Nails Spa ($0 USD)

Esta guía explica paso a paso cómo desplegar en producción el sistema de citas y bot de WhatsApp exclusivo para **JL Mímate Nails Spa**.

---

## 1. Arquitectura de Servicios

| Servicio | Proveedor | Función |
| :--- | :--- | :--- |
| **Base de Datos** | [Supabase](https://supabase.com) | PostgreSQL en la nube, citas en tiempo real |
| **Visor Web (Frontend)** | [Vercel](https://vercel.com) | Web pública de reservas (`/`) y Panel de turnos (`/admin`) |
| **Bot API (Backend)** | [Render](https://render.com) | API Express, Webhook de WhatsApp y recordatorios |
| **Canal WhatsApp** | [Meta Developers](https://developers.facebook.com) | WhatsApp Cloud API oficial |

---

## 2. Paso a Paso

### A. Base de Datos en Supabase
1. Crea un proyecto nuevo en [Supabase](https://supabase.com) llamado `mimate-nails`.
2. Ve a **SQL Editor** y ejecuta todo el contenido de `database/mimate_schema.sql`.
   - Creará automáticamente las tablas y las 4 manicuristas con sus turnos de 60 min.
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
   - `WHATSAPP_TOKEN`: *(Token permanente de Meta)*
   - `WHATSAPP_PHONE_NUMBER_ID`: *(ID de teléfono de Meta)*
   - `WHATSAPP_VERIFY_TOKEN`: `token_secreto_mimate_2026`
   - `GEMINI_API_KEY`: *(Tu API key de Google)*
4. Al desplegar obtendrás tu URL: `https://mimate-nails-api.onrender.com`.

### C. WhatsApp Oficial en Meta Developers
1. En [Meta for Developers](https://developers.facebook.com), crea una app tipo **Negocios**.
2. Agrega el producto **WhatsApp**.
3. En **Configuración > Webhook**:
   - **Callback URL:** `https://mimate-nails-api.onrender.com/webhook`
   - **Verify Token:** `token_secreto_mimate_2026`
   - Haz clic en **Verificar y Guardar**.
   - Suscríbete al evento **`messages`**.

### D. Frontend en Vercel
1. En [Vercel](https://vercel.com), importa tu repositorio de GitHub.
2. Selecciona **Root Directory**: `frontend`.
3. Haz clic en **Deploy**.
4. ¡Listo! Tu web quedará activa en:
   - `https://tu-proyecto.vercel.app/` -> Reservas de clientas.
   - `https://tu-proyecto.vercel.app/admin` -> Panel de turnos de las manicuristas (PIN `1234`).
