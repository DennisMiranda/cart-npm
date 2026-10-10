import type { CartItem, CartState, ShippingZone, StorageAdapter } from './types.js';

export const STATE_VERSION = 1;

export interface CreateStorageInput {
  storage?: 'none' | 'local' | 'session' | StorageAdapter;
  storageKey?: string;
  ttlMs?: number;
  persistOpenState?: boolean;
  onError?: (error: unknown) => void;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function isValidItem(item: unknown): item is CartItem {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.id === 'string' &&
    typeof i.name === 'string' &&
    typeof i.unitPrice === 'number' &&
    Number.isFinite(i.unitPrice) &&
    typeof i.quantity === 'number' &&
    Number.isFinite(i.quantity) &&
    typeof i.lineTotal === 'number'
  );
}

/** Valida el esquema persistido; JSON inválido ⇒ se descarta (§11.5). */
export function validateState(raw: unknown, ttlMs?: number): CartState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.version !== 'number' || s.version !== STATE_VERSION) return null;
  if (typeof s.updatedAt !== 'number') return null;
  if (!Array.isArray(s.items) || !s.items.every(isValidItem)) return null;
  if (ttlMs && ttlMs > 0 && Date.now() - s.updatedAt > ttlMs) return null;

  const zone = s.shippingZone;
  const shippingZone: ShippingZone | null =
    zone && typeof zone === 'object' && typeof (zone as ShippingZone).name === 'string'
      ? (zone as ShippingZone)
      : null;

  return {
    items: s.items as CartItem[],
    isOpen: typeof s.isOpen === 'boolean' ? s.isOpen : false,
    checkoutView: false,
    shippingZone,
    version: STATE_VERSION,
    updatedAt: s.updatedAt,
  };
}

function createMemoryAdapter(): StorageAdapter {
  let snapshot: CartState | null = null;
  return {
    read: () => snapshot,
    write: (state) => {
      snapshot = state;
    },
    clear: () => {
      snapshot = null;
    },
  };
}

function createWebStorageAdapter(kind: 'local' | 'session', key: string): StorageAdapter {
  return {
    read() {
      try {
        const raw = window[kind === 'local' ? 'localStorage' : 'sessionStorage'].getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (error) {
        return null;
      }
    },
    write(state) {
      try {
        window[kind === 'local' ? 'localStorage' : 'sessionStorage'].setItem(key, JSON.stringify(state));
      } catch (error) {
        // Cuota llena / modo privado: el carrito sigue funcionando en memoria.
      }
    },
    clear() {
      try {
        window[kind === 'local' ? 'localStorage' : 'sessionStorage'].removeItem(key);
      } catch {
        /* noop */
      }
    },
  };
}

export interface Persistence {
  load(): CartState | null;
  save(state: CartState): void;
  clear(): void;
}

export function createPersistence(input: CreateStorageInput): Persistence {
  const { storage = 'local', storageKey = 'astro-cart', ttlMs = 0, persistOpenState = false, onError } = input;

  if (storage === 'none') {
    return { load: () => null, save: () => undefined, clear: () => undefined };
  }

  let adapter: StorageAdapter;
  if (typeof storage === 'object') {
    adapter = storage;
  } else {
    // localStorage/sessionStorage solo existen en el navegador (SSR-safe).
    if (!isBrowser()) {
      return { load: () => null, save: () => undefined, clear: () => undefined };
    }
    adapter = createWebStorageAdapter(storage, storageKey);
  }

  return {
    load() {
      try {
        const raw = adapter.read();
        if (!raw) return null;
        const valid = validateState(raw, ttlMs);
        if (!valid) {
          adapter.clear();
          onError?.(new Error('Esquema de carrito inválido o expirado'));
        }
        return valid;
      } catch (error) {
        onError?.(error);
        return null;
      }
    },
    save(state) {
      try {
        const toSave: CartState = persistOpenState
          ? state
          : { ...state, isOpen: false, checkoutView: false };
        adapter.write(toSave);
      } catch (error) {
        onError?.(error);
      }
    },
    clear() {
      try {
        adapter.clear();
      } catch (error) {
        onError?.(error);
      }
    },
  };
}
