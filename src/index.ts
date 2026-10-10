import type { Cart, CartOptions } from './core/types.js';
import { createCart } from './core/cart.js';

export * from './core/index.js';

const GLOBAL_KEY = '__TINYCODE_ASTRO_CART__';

/**
 * Instancia única por página (R-14): todas las islas comparten el mismo carrito.
 * Se crea en `globalThis` la primera vez que se accede.
 */
export function getCart(options?: CartOptions): Cart {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createCart(options);
  return g[GLOBAL_KEY] as Cart;
}

/**
 * Proxy de conveniencia: `cart.addItem(...)`, `cart.subscribe(...)`, etc.
 * Lazy: no toca `window`/`localStorage` hasta que se usa.
 *
 * ```ts
 * import { cart } from '@dennismiranda/astro-cart';
 * cart.addItem({ id: 1, name: 'Pollo a la brasa', price: 35 });
 * ```
 */
export const cart: Cart = new Proxy({} as Cart, {
  get(_target, prop: string | symbol) {
    const instance = getCart();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return prop in getCart();
  },
});
