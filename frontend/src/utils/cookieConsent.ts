/**
 * Gestión Defensiva de Cookies y Privacidad Local - JL Mímate Nails
 * 
 * Cumple con los estándares de privacidad web (GDPR / LGPD / Ley 1581 Habeas Data CO).
 * Configura atributos de máxima seguridad: SameSite=Lax, Secure y Path=/.
 */

export type TipoConsentimiento = 'accepted' | 'essential' | 'rejected';

const COOKIE_CONSENT_KEY = 'mimate_cookie_consent';

/**
 * Obtiene el valor de una cookie de forma segura por su nombre.
 */
export function getCookie(nombre: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + encodeURIComponent(nombre) + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Establece una cookie con directivas modernas de seguridad:
 * SameSite=Lax, Secure (en HTTPS), y expiración controlada.
 */
export function setSecureCookie(
  nombre: string,
  valor: string,
  diasValidez = 365,
  sameSite: 'Lax' | 'Strict' | 'None' = 'Lax'
): void {
  if (typeof document === 'undefined') return;

  const fechaExpiracion = new Date();
  fechaExpiracion.setTime(fechaExpiracion.getTime() + diasValidez * 24 * 60 * 60 * 1000);

  const esHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureFlag = esHttps ? '; Secure' : '';

  document.cookie = `${encodeURIComponent(nombre)}=${encodeURIComponent(valor)}; expires=${fechaExpiracion.toUTCString()}; path=/; SameSite=${sameSite}${secureFlag}`;
}

/**
 * Elimina una cookie de forma segura.
 */
export function removeSecureCookie(nombre: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(nombre)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

/**
 * Comprueba si la usuaria ya tomó una decisión sobre las cookies.
 */
export function tieneConsentimientoRegistrado(): boolean {
  if (typeof window === 'undefined') return true;
  return !!localStorage.getItem(COOKIE_CONSENT_KEY) || !!getCookie(COOKIE_CONSENT_KEY);
}

/**
 * Registra la preferencia de cookies de la usuaria.
 */
export function registrarConsentimiento(tipo: TipoConsentimiento): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, tipo);
    localStorage.setItem(`${COOKIE_CONSENT_KEY}_date`, new Date().toISOString());
  } catch {
    // Si localStorage está restringido en modo incógnito estricto, no interrumpe
  }
  setSecureCookie(COOKIE_CONSENT_KEY, tipo, 365, 'Lax');
}
