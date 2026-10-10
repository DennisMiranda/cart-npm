import { roundMoney, toPrice } from './format.js';
import { getItemId as defaultGetItemId } from './identity.js';
import { computeTotals } from './pricing.js';
import { createPersistence, STATE_VERSION } from './persistence.js';
import type {
  Cart,
  CartEvent,
  CartItem,
  CartOptions,
  CartState,
  CartTotals,
  CheckoutContext,
  CheckoutHandler,
  Product,
  ProductVariant,
  ShippingZone,
} from './types.js';

const DEFAULT_MAX_QTY = 99;
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días

type ResolvedOptions = CartOptions & {
  storageKey: string;
  ttlMs: number;
  currency: string;
  locale: string;
  maxQuantityPerItem: number;
  defaultShipping: number;
  openOnAdd: boolean;
  resetShippingOnClear: boolean;
};

function resolveOptions(options: CartOptions = {}): ResolvedOptions {
  return {
    ...options,
    storageKey: options.storageKey ?? 'astro-cart',
    ttlMs: options.ttlMs ?? DEFAULT_TTL,
    currency: options.currency ?? 'PEN',
    locale: options.locale ?? 'es-PE',
    maxQuantityPerItem: options.maxQuantityPerItem ?? DEFAULT_MAX_QTY,
    defaultShipping: options.defaultShipping ?? 0,
    openOnAdd: options.openOnAdd ?? true,
    resetShippingOnClear: options.resetShippingOnClear ?? true,
  };
}

/**
 * Crea una instancia de carrito framework-agnostic.
 * Toda la lógica es aritmética + arrays inmutables (sin dependencias de UI).
 */
export function createCart(options: CartOptions = {}): Cart {
  const opts = resolveOptions(options);
  const getItemId = opts.getItemId ?? defaultGetItemId;

  let state: CartState = {
    items: [],
    isOpen: false,
    checkoutView: false,
    shippingZone: null,
    version: STATE_VERSION,
    updatedAt: Date.now(),
  };

  const listeners = new Set<(state: CartState, event: CartEvent) => void>();
  const typeListeners = new Map<string, Set<(e: CartEvent) => void>>();
  let checkoutHandler: CheckoutHandler | null = null;
  let destroyed = false;

  const persistence = createPersistence({
    storage: opts.storage ?? 'local',
    storageKey: opts.storageKey,
    ttlMs: opts.ttlMs,
    persistOpenState: opts.persistOpenState ?? false,
    onError: (error) => emit({ type: 'storage:error', error }),
  });

  function snapshot(): CartState {
    return { ...state, items: [...state.items] };
  }

  function totals(): CartTotals {
    const fee = state.shippingZone ? state.shippingZone.fee : opts.defaultShipping;
    return computeTotals({ items: state.items, shipping: fee ?? 0, taxRate: opts.taxRate ?? 0 });
  }

  function emit(event: CartEvent): void {
    if (destroyed) return;
    opts.onEvent?.(event);
    const snap = snapshot();
    for (const fn of [...listeners]) fn(snap, event);
    const typed = typeListeners.get(event.type);
    if (typed) for (const fn of [...typed]) fn(event);
  }

  function commit(event: CartEvent, { persist = true }: { persist?: boolean } = {}): void {
    state = { ...state, updatedAt: Date.now() };
    if (persist) persistence.save(state);
    emit({ type: 'cart:change', state: snapshot(), totals: totals() });
    emit(event);
  }

  function maxFor(product: Product): number {
    return product.maxQuantityPerItem ?? opts.maxQuantityPerItem;
  }

  function stockAvailable(product: Product): number | null {
    return typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : null;
  }

  function findItem(id: string): CartItem | undefined {
    return state.items.find((i) => i.id === id);
  }

  function replaceItem(id: string, next: CartItem): void {
    state = {
      ...state,
      items: state.items.map((i) => (i.id === id ? next : i)),
    };
  }

  function setItems(items: CartItem[]): void {
    state = { ...state, items };
  }

  // ── Acciones ────────────────────────────────────────────────

  function addItem(product: Product, opts2: { quantity?: number; variant?: ProductVariant } = {}): CartItem | null {
    if (destroyed) return null;
    const quantity = Math.floor(opts2.quantity ?? 1);
    const variant = opts2.variant;

    if (!Number.isFinite(quantity) || quantity <= 0) return null; // R-1 descartado
    if (opts.canAdd && !opts.canAdd(product, quantity, snapshot())) return null;

    const id = getItemId(product, variant);
    const max = maxFor(product);
    const existing = findItem(id);

    if (existing) {
      const requested = existing.quantity + quantity;
      if (requested > max) {
        emit({ type: 'quantity:limit', itemId: id, requested, max });
        return null;
      }
      const stock = stockAvailable(product);
      if (stock !== null && requested > stock) {
        emit({ type: 'stock:insufficient', productId: product.id, requested, available: stock });
        return null;
      }
      const previous = existing;
      const next: CartItem = { ...existing, quantity: requested, lineTotal: roundMoney(existing.unitPrice * requested) };
      replaceItem(id, next);
      commit({ type: 'item:update', item: next, previous });
      if (opts.openOnAdd) cart.open();
      return next;
    }

    if (quantity > max) {
      emit({ type: 'quantity:limit', itemId: id, requested: quantity, max });
      return null;
    }
    const stock = stockAvailable(product);
    if (stock !== null && quantity > stock) {
      emit({ type: 'stock:insufficient', productId: product.id, requested: quantity, available: stock });
      return null;
    }

    const rawPrice = toPrice(variant ? variant.price : product.price);
    const compareAt = variant?.compareAtPrice ?? product.compareAtPrice;

    let item: CartItem = {
      id,
      productId: product.id,
      name: variant ? `${product.name} — ${variant.label}` : product.name,
      unitPrice: roundMoney(rawPrice),
      quantity,
      imageUrl: product.imageUrl ?? null,
      variant,
      lineTotal: roundMoney(rawPrice * quantity),
      maxQuantity: max,
      metadata: product.metadata,
    };
    if (typeof compareAt === 'number' && compareAt > item.unitPrice) item.compareAtPrice = compareAt;
    if (opts.normalizeItem) item = opts.normalizeItem(item);

    setItems([...state.items, item]);
    commit({ type: 'item:add', item });
    if (opts.openOnAdd) cart.open();
    return item;
  }

  function updateQuantity(id: string, quantity: number): void {
    if (destroyed) return;
    const item = findItem(id);
    if (!item) return;

    if (quantity <= 0) {
      removeItem(id);
      return;
    }

    const requested = Math.floor(quantity);
    const max = item.maxQuantity ?? opts.maxQuantityPerItem;
    if (requested > max) {
      emit({ type: 'quantity:limit', itemId: id, requested, max });
      return;
    }

    const previous = item;
    const next: CartItem = { ...item, quantity: requested, lineTotal: roundMoney(item.unitPrice * requested) };
    replaceItem(id, next);
    commit({ type: 'item:update', item: next, previous });
  }

  function removeItem(id: string): void {
    if (destroyed) return;
    if (!findItem(id)) return;
    setItems(state.items.filter((i) => i.id !== id));
    commit({ type: 'item:remove', itemId: id });
  }

  function increment(id: string, step = 1): void {
    const item = findItem(id);
    if (!item) return;
    updateQuantity(id, item.quantity + step);
  }

  function decrement(id: string, step = 1): void {
    const item = findItem(id);
    if (!item) return;
    // R-14: el stepper se detiene en 1; eliminar es con la papelera.
    updateQuantity(id, Math.max(1, item.quantity - step));
  }

  function clear(): void {
    if (destroyed) return;
    setItems([]);
    if (opts.resetShippingOnClear) state = { ...state, shippingZone: null };
    commit({ type: 'cart:clear' });
  }

  function setShippingZone(zone: ShippingZone | null): void {
    if (destroyed) return;
    state = { ...state, shippingZone: zone };
    commit({ type: 'shipping:zone', zone });
  }

  function open(): void {
    if (destroyed || state.isOpen) return;
    state = { ...state, isOpen: true };
    commit({ type: 'open' });
  }

  function close(): void {
    if (destroyed || (!state.isOpen && !state.checkoutView)) return;
    state = { ...state, isOpen: false, checkoutView: false };
    commit({ type: 'close' });
  }

  function toggle(): void {
    if (state.isOpen) close();
    else open();
  }

  function openCheckout(): void {
    state = { ...state, isOpen: true, checkoutView: true };
    commit({ type: 'open' });
  }

  function closeCheckout(): void {
    if (!state.checkoutView) return;
    state = { ...state, checkoutView: false };
    commit({ type: 'cart:change', state: snapshot(), totals: totals() });
  }

  async function checkout(): Promise<boolean> {
    const ctx: CheckoutContext = {
      items: [...state.items],
      totals: totals(),
      shippingZone: state.shippingZone,
    };
    emit({ type: 'checkout', payload: ctx });
    if (!checkoutHandler) return true;
    const result = await checkoutHandler(ctx);
    return result !== false;
  }

  function hydrate(partial?: Partial<CartState>): void {
    const base = partial ?? persistence.load();
    if (!base) return;
    state = {
      items: Array.isArray(base.items) ? base.items : [],
      isOpen: Boolean(base.isOpen),
      checkoutView: false,
      shippingZone: base.shippingZone ?? null,
      version: STATE_VERSION,
      updatedAt: base.updatedAt ?? Date.now(),
    };
    emit({ type: 'cart:change', state: snapshot(), totals: totals() });
  }

  function destroy(): void {
    destroyed = true;
    listeners.clear();
    typeListeners.clear();
    checkoutHandler = null;
  }

  const cart: Cart = {
    addItem,
    removeItem,
    updateQuantity,
    increment,
    decrement,
    clear,
    setShippingZone,
    open,
    close,
    toggle,
    openCheckout,
    closeCheckout,
    getItems: () => [...state.items],
    getItem: (id) => findItem(id),
    getItemCount: () => totals().itemCount,
    getDistinctCount: () => state.items.length,
    getSubtotal: () => totals().subtotal,
    getShipping: () => totals().shipping,
    getTax: () => totals().tax,
    getDiscount: () => totals().discount,
    getTotal: () => totals().total,
    getTotals: totals,
    isEmpty: () => state.items.length === 0,
    isOpen: () => state.isOpen,
    getState: snapshot,
    getOptions: () => ({ ...opts }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    on(type, fn) {
      let set = typeListeners.get(type);
      if (!set) {
        set = new Set();
        typeListeners.set(type, set);
      }
      set.add(fn);
      return () => set!.delete(fn);
    },
    setCheckout(fn) {
      checkoutHandler = fn;
    },
    checkout,
    hydrate,
    destroy,
  };

  // Hidratación inicial (SSR-safe: en servidor no hay storage).
  const persisted = persistence.load();
  if (persisted) {
    state = { ...persisted, checkoutView: false };
  }

  return cart;
}
