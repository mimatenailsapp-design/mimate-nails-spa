import fs from 'fs';
import path from 'path';
import { supabase } from '../config/supabase.js';

export interface BotExclusion {
  id?: string;
  telefono: string;
  nombre?: string;
  motivo?: string;
  creado_en?: string;
}

export class BotExclusionsService {
  private static localFilePath = path.resolve(process.cwd(), 'data', 'bot_exclusiones.json');
  private static cache: BotExclusion[] | null = null;
  private static excludedSet: Set<string> = new Set();

  public static normalizarNumero(tel: string): string {
    const digitos = String(tel || '').replace(/\D/g, '');
    if (digitos.length === 10 && digitos.startsWith('3')) {
      return `57${digitos}`;
    }
    return digitos;
  }

  /**
   * Obtiene la lista completa de números donde el bot está silenciado
   */
  static async getExclusiones(): Promise<BotExclusion[]> {
    try {
      const { data: dbClientes, error } = await supabase
        .from('clientes')
        .select('id, telefono_wa, nombre, creado_en')
        .eq('bloqueado', true)
        .order('creado_en', { ascending: false });

      if (!error && Array.isArray(dbClientes)) {
        const exclusiones: BotExclusion[] = dbClientes.map((c) => ({
          id: c.id,
          telefono: c.telefono_wa,
          nombre: c.nombre || undefined,
          creado_en: c.creado_en,
        }));

        this.cache = exclusiones;
        this.actualizarCacheSet(exclusiones);
        this.guardarEnArchivoLocal(exclusiones);
        return exclusiones;
      }
    } catch (e) {
      console.warn('Advertencia consultando Supabase para exclusiones, usando respaldo local:', e);
    }

    if (this.cache) return this.cache;
    const local = this.leerArchivoLocal();
    this.cache = local;
    this.actualizarCacheSet(local);
    return local;
  }

  /**
   * Verifica instantáneamente si un número entrante de WhatsApp tiene el bot desactivado
   */
  static async esNumeroExcluido(telefono: string): Promise<boolean> {
    if (this.cache === null) {
      await this.getExclusiones();
    }
    const limpio = this.normalizarNumero(telefono);
    const solo10 = limpio.startsWith('57') && limpio.length === 12 ? limpio.slice(2) : limpio;

    return this.excludedSet.has(limpio) || this.excludedSet.has(solo10);
  }

  /**
   * Agrega un número a la lista de exclusión (el bot no responderá)
   */
  static async agregarExclusion(telefono: string, nombre?: string, motivo?: string): Promise<BotExclusion> {
    const limpio = this.normalizarNumero(telefono);
    if (!limpio) throw new Error('Número de teléfono inválido');

    const nuevaExclusion: BotExclusion = {
      telefono: limpio,
      nombre: nombre?.trim() || undefined,
      motivo: motivo?.trim() || 'Atención humana directa',
      creado_en: new Date().toISOString(),
    };

    // 1. Guardar en Supabase (upsert en tabla clientes)
    try {
      const { data, error } = await supabase
        .from('clientes')
        .upsert(
          {
            telefono_wa: limpio,
            nombre: nombre?.trim() || null,
            bloqueado: true,
          },
          { onConflict: 'telefono_wa' }
        )
        .select()
        .single();

      if (!error && data) {
        nuevaExclusion.id = data.id;
      }
    } catch (e) {
      console.warn('Error guardando exclusión en Supabase (se usará respaldo local):', e);
    }

    // 2. Actualizar caché y archivo local
    const listaActual = await this.getExclusiones();
    const filtrada = listaActual.filter(
      (e) => this.normalizarNumero(e.telefono) !== limpio
    );
    filtrada.unshift(nuevaExclusion);
    this.cache = filtrada;
    this.actualizarCacheSet(filtrada);
    this.guardarEnArchivoLocal(filtrada);

    return nuevaExclusion;
  }

  /**
   * Elimina un número de la lista (reactiva las respuestas automáticas del bot)
   */
  static async eliminarExclusion(telefono: string): Promise<boolean> {
    const limpio = this.normalizarNumero(telefono);
    const solo10 = limpio.startsWith('57') && limpio.length === 12 ? limpio.slice(2) : limpio;

    // 1. Desbloquear en Supabase
    try {
      await supabase
        .from('clientes')
        .update({ bloqueado: false })
        .or(`telefono_wa.eq.${limpio},telefono_wa.eq.${solo10}`);
    } catch (e) {
      console.warn('Error reactivando cliente en Supabase:', e);
    }

    // 2. Actualizar caché y archivo local
    const listaActual = await this.getExclusiones();
    const filtrada = listaActual.filter((e) => {
      const eNorm = this.normalizarNumero(e.telefono);
      return eNorm !== limpio && eNorm !== solo10;
    });

    this.cache = filtrada;
    this.actualizarCacheSet(filtrada);
    this.guardarEnArchivoLocal(filtrada);
    return true;
  }

  private static actualizarCacheSet(lista: BotExclusion[]) {
    this.excludedSet.clear();
    for (const item of lista) {
      const n = this.normalizarNumero(item.telefono);
      this.excludedSet.add(n);
      if (n.startsWith('57') && n.length === 12) {
        this.excludedSet.add(n.slice(2));
      }
    }
  }

  private static leerArchivoLocal(): BotExclusion[] {
    try {
      if (fs.existsSync(this.localFilePath)) {
        const raw = fs.readFileSync(this.localFilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error leyendo bot_exclusiones.json local:', e);
    }
    return [];
  }

  private static guardarEnArchivoLocal(lista: BotExclusion[]) {
    try {
      const dir = path.dirname(this.localFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localFilePath, JSON.stringify(lista, null, 2), 'utf8');
    } catch (e) {
      console.error('Error guardando bot_exclusiones.json local:', e);
    }
  }
}
