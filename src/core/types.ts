/** Variante/presentación de un producto (equivale a `PriceRangeEntry` del proyecto auditado). */
export interface ProductVariant {
  id: string | number;
  /** Texto mostrado en el selector: "1 und", "3 unds", "Familiar"… */
  label: string;
  /** Precio unitario de esta variante (numérico). */
  price: number;
  /** Badge opcional: "+1 de regalo". */
  badge?: string | null;
  /** Marca la variante preseleccionada en el selector. */
  isDefault?: boolean;
  /** Precio antes del descuento (solo visual: se muestra tachado y alimenta `getDiscount()`). */
  compareAtPrice?: number;
  metadata?: Record<string, unknown>;
}

/** Producto mínimo que el paquete necesita (superset de Product/Promotion/Combo). */
export interface Product {
  id: string | number;
  name: string;
  /** Precio unitario ya numérico (el consumidor resuelve string → number antes de llamar). */
  price: number;
  imageUrl?: string | null;
  description?: string | null;
  sku?: string;
  /** Si existe, se valida al agregar/incrementar (emite `stock:insufficient`). */
  stock?: number;
  /** Override del límite de cantidad por producto (prioriza a `maxQuantityPerItem`). */
  maxQuantityPerItem?: number;
  variants?: ProductVariant[];
  isPromotion?: boolean;
  compareAtPrice?: number;
  metadata?: Record<string, unknown>;
}

/** Línea dentro del carrito. El precio se congela al agregar (R-6). */
export interface CartItem {
  /** Clave de deduplicación (ver `getItemId`). */
  id: string;
  productId: string | number;
  name: string;
  /** Precio unitario congelado al agregar. */
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
  variant?: ProductVariant;
  /** `unitPrice * quantity` (redondeado a 2 decimales). */
  lineTotal: number;
  /** Solo visual: ahorro frente al precio tachado. No se resta del total. */
  compareAtPrice?: number;
  /** Límite de cantidad congelado al agregar (`product.maxQuantityPerItem ?? maxQuantityPerItem`). */
  maxQuantity?: number;
  metadata?: Record<string, unknown>;
}

export interface ShippingZone {
  id?: string;
  name: string;
  fee: number;
}

export interface CartState {
  items: CartItem[];
  isOpen: boolean;
  checkoutView: boolean;
  shippingZone: ShippingZone | null;
  /** Versión del esquema de persistencia (migraciones). */
  version: number;
  /** Epoch ms del último cambio (se usa para el TTL). */
  updatedAt: number;
}

export interface CartTotals {
  /** Σ quantity */
  itemCount: number;
  /** items.length */
  distinctCount: number;
  subtotal: number;
  shipping: number;
  tax: number;
  /** Ahorro informativo (compareAtPrice − unitPrice). No se resta del total. */
  discount: number;
  /** subtotal + shipping + tax */
  total: number;
}

export type CartEvent =
  | { type: 'item:add'; item: CartItem }
  | { type: 'item:update'; item: CartItem; previous: CartItem }
  | { type: 'item:remove'; itemId: string }
  | { type: 'quantity:limit'; itemId: string | null; requested: number; max: number }
  | { type: 'stock:insufficient'; productId: string | number; requested: number; available: number }
  | { type: 'cart:clear' }
  | { type: 'cart:change'; state: CartState; totals: CartTotals }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'checkout'; payload: CheckoutContext }
  | { type: 'shipping:zone'; zone: ShippingZone | null }
  | { type: 'storage:error'; error: unknown };

export type CartEventType = CartEvent['type'];

export interface CheckoutContext {
  items: CartItem[];
  totals: CartTotals;
  shippingZone: ShippingZone | null;
  customer?: Record<string, unknown>;
}

export interface StorageAdapter {
  read(): CartState | null;
  write(state: CartState): void;
  clear(): void;
}

/** Devuelve `false` (o una promesa de `false`) para impedir que la UI abra la vista de checkout. */
export type CheckoutHandler = (
  ctx: CheckoutContext,
) => boolean | void | Promise<boolean | void>;

export interface CartOptions {
  /** `local` (default) | `session` | `none` | adaptador propio. */
  storage?: 'none' | 'local' | 'session' | StorageAdapter;
  /** Clave de `localStorage` (default `'astro-cart'`). */
  storageKey?: string;
  /** TTL en ms (default 7 días). `0`/`undefined` = sin expiración. */
  ttlMs?: number;
  /** Default `'PEN'`. */
  currency?: string;
  /** Default `'es-PE'`. */
  locale?: string;
  /** Límite de cantidad por línea (default 99). El producto puede tener `maxQuantityPerItem`. */
  maxQuantityPerItem?: number;
  /** Envío por defecto si no hay zona seleccionada (default 0). */
  defaultShipping?: number;
  shippingZones?: ShippingZone[];
  /** 0–100. Ej: `16` = IVA 16%. Default 0 (sin impuestos). */
  taxRate?: number;
  /** Clave de deduplicación. Default: `${product.id}` o `${product.id}-${variant.id}`. */
  getItemId?: (product: Product, variant?: ProductVariant) => string;
  /** Hook para transformar el ítem antes de guardarlo. */
  normalizeItem?: (item: CartItem) => CartItem;
  /** Si devuelve `false`, `addItem` no agrega nada. */
  canAdd?: (product: Product, quantity: number, state: CartState) => boolean;
  /** Abrir el drawer al agregar (default `true`, comportamiento auditado R-10). */
  openOnAdd?: boolean;
  /** Persistir el estado abierto/cerrado (default `false`). */
  persistOpenState?: boolean;
  /** Reiniciar la zona de entrega al vaciar (default `true`; corrige R-13). */
  resetShippingOnClear?: boolean;
  onEvent?: (event: CartEvent) => void;
}

export interface Cart {
  addItem(product: Product, opts?: { quantity?: number; variant?: ProductVariant }): CartItem | null;
  removeItem(id: string): void;
  updateQuantity(id: string, quantity: number): void;
  increment(id: string, step?: number): void;
  /** Se detiene en 1 (no elimina): la eliminación es con `removeItem`/papelera (R-14). */
  decrement(id: string, step?: number): void;
  clear(): void;
  setShippingZone(zone: ShippingZone | null): void;
  open(): void;
  close(): void;
  toggle(): void;
  openCheckout(): void;
  closeCheckout(): void;
  getItems(): CartItem[];
  getItem(id: string): CartItem | undefined;
  getItemCount(): number;
  getDistinctCount(): number;
  getSubtotal(): number;
  getShipping(): number;
  getTax(): number;
  getDiscount(): number;
  getTotal(): number;
  getTotals(): CartTotals;
  isEmpty(): boolean;
  isOpen(): boolean;
  getState(): CartState;
  getOptions(): Readonly<Required<Pick<CartOptions, 'currency' | 'locale' | 'maxQuantityPerItem' | 'openOnAdd'>> & CartOptions>;
  subscribe(fn: (state: CartState, event: CartEvent) => void): () => void;
  on(type: CartEventType, fn: (e: CartEvent) => void): () => void;
  setCheckout(fn: CheckoutHandler | null): void;
  checkout(): Promise<boolean>;
  hydrate(state?: Partial<CartState>): void;
  destroy(): void;
}
