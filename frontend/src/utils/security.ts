/**
 * Módulo de Seguridad Criptográfica y Protección de Credenciales - JL Mímate Nails
 * 
 * Implementa hashing seguro con salting defensivo (FIPS 180-4 SHA-256) usando la API nativa
 * W3C Web Cryptography (crypto.subtle).
 * 
 * Previene el descubrimiento de credenciales en el repositorio de código y bloquea
 * ataques de diccionario o tablas rainbow precalculadas.
 */

const PIN_PEPPER_SALT = 'MimateNails_Spa_SecurePin_Salt_2026_@JL!_98f4e2b1';

/**
 * Hashes criptográficos precalculados con salting/pepper:
 * - Hash del PIN predeterminado del staff autorizado
 * - Hash del PIN maestro administrativo
 */
export const STAFF_DEFAULT_PIN_HASH = 'fb03a4b64b8bcb37d2967b46951043048eed9c56629857495bba7d295520f186';
export const ADMIN_MASTER_PIN_HASH = '7dc28d72e8f9bfaf28453b71d5a662b5f5baacdc373a6a1796f4acaa57b0138e';

/**
 * Genera el hash criptográfico SHA-256 salteado de un PIN o clave en texto plano.
 */
export async function hashPin(pin: string): Promise<string> {
  const sanitized = pin.trim();
  const input = `${PIN_PEPPER_SALT}:${sanitized}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback seguro en entornos sin crypto.subtle
  return fallbackSha256(input);
}

/**
 * Verifica si un PIN ingresado coincide con un hash esperado.
 */
export async function verifyPinHash(enteredPin: string, expectedHash: string): Promise<boolean> {
  if (!enteredPin || !expectedHash) return false;
  const hash = await hashPin(enteredPin);
  return hash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Implementación de fallback estándar SHA-256 pura
 */
function fallbackSha256(ascii: string): string {
  function rr(v: number, n: number) {
    return (v >>> n) | (v << (32 - n));
  }

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  let utf8: number[];
  if (typeof TextEncoder !== 'undefined') {
    utf8 = Array.from(new TextEncoder().encode(ascii));
  } else {
    utf8 = [];
    for (let i = 0; i < ascii.length; i++) {
      let code = ascii.charCodeAt(i);
      if (code < 0x80) {
        utf8.push(code);
      } else if (code < 0x800) {
        utf8.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        utf8.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        code = 0x10000 + (((code & 0x3ff) << 10) | (ascii.charCodeAt(i) & 0x3ff));
        utf8.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
  }

  const bitLen = utf8.length * 8;
  utf8.push(0x80);
  while (utf8.length % 64 !== 56) utf8.push(0);

  // Big endian 64-bit length
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  utf8.push((highBits >>> 24) & 0xff, (highBits >>> 16) & 0xff, (highBits >>> 8) & 0xff, highBits & 0xff);
  utf8.push((lowBits >>> 24) & 0xff, (lowBits >>> 16) & 0xff, (lowBits >>> 8) & 0xff, lowBits & 0xff);

  const w = new Int32Array(64);
  for (let i = 0; i < utf8.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] =
        (utf8[i + j * 4] << 24) |
        (utf8[i + j * 4 + 1] << 16) |
        (utf8[i + j * 4 + 2] << 8) |
        utf8[i + j * 4 + 3];
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rr(w[j - 15], 7) ^ rr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rr(w[j - 2], 17) ^ rr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const s1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}
