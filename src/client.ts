import {
  formatCurrency,
  getCart,
  type Cart,
  type CartItem,
  type CartOptions,
  type Product,
} from './index.js';

const UI_KEY = '__TINYCODE_ASTRO_CART_UI__';

type MoneyFn = (n: number) => string;

/* ── utilidades DOM ─────────────────────────────────────── */

function qsa<T extends Element>(selector: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

function setText(selector: string, text: string, root: ParentNode = document): void {
  qsa<HTMLElement>(selector, root).forEach((el) => {
    if (el.textContent !== text) el.textContent = text;
  });
}

function readProduct(el: Element | null): Product | null {
  const raw = el?.getAttribute('data-product');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Product;
  } catch {
    return null;
  }
}

function indexOfZone(
  zones: readonly { name: string; fee: number }[],
  selected: { name: string; fee: number },
): number {
  return zones.findIndex((z) => z.name === selected.name && z.fee === selected.fee);
}

function defaultVariantIndex(product: Product): number {
  const variants = product.variants ?? [];
  if (variants.length === 0) return 0;
  const idx = variants.findIndex((v) => v.isDefault);
  return idx >= 0 ? idx : 0;
}

/* ── render ─────────────────────────────────────────────── */

function updateRow(row: HTMLElement, show: boolean, value: string): void {
  row.hidden = !show;
  const dd = row.querySelector('dd');
  if (dd && dd.textContent !== value) dd.textContent = value;
}

function fillItem(el: HTMLElement, item: CartItem, money: MoneyFn): void {
  el.dataset.id = item.id;
  el.hidden = false;

  setText('[data-field="name"]', item.name, el);
  setText('[data-field="quantity"]', String(item.quantity), el);
  setText('[data-field="unitPrice"]', `${money(item.unitPrice)} c/u`, el);
  setText('[data-field="lineTotal"]', money(item.lineTotal), el);

  const variantEl = el.querySelector<HTMLElement>('[data-field="variant"]');
  if (variantEl) {
    const label = item.variant?.label ?? '';
    variantEl.hidden = !label;
    if (variantEl.textContent !== label) variantEl.textContent = label;
  }

  const media = el.querySelector<HTMLElement>('[data-item-media]');
  const img = el.querySelector<HTMLImageElement>('[data-field="image"]');
  if (media && img) {
    const src = item.imageUrl ?? '';
    media.hidden = !src;
    if (src && img.getAttribute('src') !== src) img.src = src;
  }

  qsa<HTMLButtonElement>('[data-cart-action="dec"]', el).forEach((btn) => {
    btn.dataset.id = item.id;
    btn.disabled = item.quantity <= 1;
  });
  qsa<HTMLButtonElement>('[data-cart-action="inc"]', el).forEach((btn) => {
    btn.dataset.id = item.id;
  });
  qsa<HTMLButtonElement>('[data-cart-action="remove"]', el).forEach((btn) => {
    btn.dataset.id = item.id;
  });
}

function renderItems(container: HTMLElement, items: CartItem[], money: MoneyFn): void {
  const template = container.querySelector<HTMLTemplateElement>('template[data-cart-item-template]');
  const existing = new Map<string, HTMLElement>();
  qsa<HTMLElement>('[data-cart-item]', container).forEach((el) => {
    if (el.dataset.id) existing.set(el.dataset.id, el);
  });

  for (const [id, el] of [...existing]) {
    if (!items.some((i) => i.id === id)) el.remove();
  }

  for (const item of items) {
    let el = existing.get(item.id);
    if (!el) {
      if (!template?.content.firstElementChild) continue;
      el = template.content.firstElementChild.cloneNode(true) as HTMLElement;
      el.dataset.id = item.id;
      container.appendChild(el);
    }
    fillItem(el, item, money);
  }
}

function updateZones(root: HTMLElement, cart: Cart): void {
  const state = cart.getState();
  const zones = cart.getOptions().shippingZones ?? [];
  const selected = state.shippingZone;

  const label = root.querySelector<HTMLElement>('[data-zone-label]');
  if (label) {
    const next = selected?.name ?? label.getAttribute('data-default-label') ?? '';
    if (label.textContent !== next) label.textContent = next;
  }

  const selectedIdx = selected ? indexOfZone(zones, selected) : -1;
  qsa<HTMLElement>('[data-zone-index]', root).forEach((btn) => {
    btn.setAttribute('aria-current', String(Number(btn.dataset.zoneIndex) === selectedIdx));
  });
}

function render(cart: Cart): void {
  const state = cart.getState();
  const totals = cart.getTotals();
  const opts = cart.getOptions();
  const money: MoneyFn = (n) => formatCurrency(n, { locale: opts.locale, currency: opts.currency });
  const empty = cart.isEmpty();

  setText('[data-cart-count]', String(totals.itemCount));

  qsa<HTMLElement>('[data-cart-drawer]').forEach((drawer) => {
    drawer.dataset.open = String(state.isOpen);
    drawer.dataset.view = state.checkoutView ? 'checkout' : 'cart';
    drawer.dataset.empty = String(empty);
    drawer.setAttribute('aria-hidden', String(!state.isOpen));
  });
  qsa<HTMLElement>('[data-cart-backdrop]').forEach((el) => {
    el.dataset.open = String(state.isOpen);
  });
  document.body.classList.toggle('ac-cart-lock', state.isOpen);

  qsa<HTMLElement>('[data-cart-trigger]').forEach((el) => {
    el.hidden = empty;
  });
  setText('[data-cart-trigger-total]', money(totals.total));
  setText('[data-cart-total]', money(totals.total));

  setText('[data-cart-subtotal]', money(totals.subtotal));
  qsa<HTMLElement>('[data-row="subtotal"]').forEach((row) => updateRow(row, true, money(totals.subtotal)));
  qsa<HTMLElement>('[data-row="discount"]').forEach((row) => updateRow(row, totals.discount > 0, money(totals.discount)));
  qsa<HTMLElement>('[data-row="shipping"]').forEach((row) => updateRow(row, totals.shipping > 0, money(totals.shipping)));
  qsa<HTMLElement>('[data-row="tax"]').forEach((row) => updateRow(row, totals.tax > 0, money(totals.tax)));
  qsa<HTMLElement>('[data-row="total"]').forEach((row) => updateRow(row, true, money(totals.total)));

  qsa<HTMLElement>('[data-cart-items]').forEach((container) => renderItems(container, cart.getItems(), money));
  qsa<HTMLElement>('[data-cart-zones]').forEach((root) => updateZones(root, cart));
}

/* ── selector de variantes ──────────────────────────────── */

function updateSelector(root: HTMLElement, cart: Cart): void {
  const product = readProduct(root);
  if (!product) return;

  const money: MoneyFn = (n) =>
    formatCurrency(n, { locale: cart.getOptions().locale, currency: cart.getOptions().currency });

  const variants = product.variants ?? [];
  const idx = Number(root.dataset.variantIndex ?? 0);
  const variant = variants[idx];
  const unitPrice = variant ? Number(variant.price) : Number(product.price) || 0;
  const qty = Math.max(1, Number(root.dataset.qty ?? 1));
  const max = product.maxQuantityPerItem ?? cart.getOptions().maxQuantityPerItem;

  qsa<HTMLElement>('[data-cart-action="variant-select"]', root).forEach((btn) => {
    btn.setAttribute('aria-checked', String(Number(btn.dataset.variantIndex) === idx));
  });

  setText('[data-vs-qty]', String(qty), root);
  setText('[data-vs-price]', money(unitPrice), root);

  const totalLabel = root.getAttribute('data-add-label') ?? 'Agregar';
  setText('[data-vs-total]', `${totalLabel} · ${money(unitPrice * qty)}`, root);

  qsa<HTMLButtonElement>('[data-cart-action="variant-dec"]', root).forEach((b) => (b.disabled = qty <= 1));
  qsa<HTMLButtonElement>('[data-cart-action="variant-inc"]', root).forEach((b) => (b.disabled = qty >= max));
}

function openSelector(root: HTMLElement, cart: Cart): void {
  const product = readProduct(root);
  root.dataset.open = 'true';
  root.dataset.qty = '1';
  root.dataset.variantIndex = String(product ? defaultVariantIndex(product) : 0);
  updateSelector(root, cart);
  root.querySelector<HTMLElement>('[data-cart-action="variant-close"]')?.focus();
}

function closeSelector(root: HTMLElement): void {
  root.dataset.open = 'false';
}

function resolveSelector(target: HTMLElement): HTMLElement | null {
  const own = target.closest<HTMLElement>('[data-cart-selector]');
  if (own) return own;
  const card = target.closest<HTMLElement>('[data-cart-product]');
  return card?.querySelector<HTMLElement>('[data-cart-selector]') ?? null;
}

/* ── checkout ───────────────────────────────────────────── */

async function runCheckout(cart: Cart): Promise<void> {
  const state = cart.getState();
  const detail = {
    items: cart.getItems(),
    totals: cart.getTotals(),
    shippingZone: state.shippingZone,
  };
  const evt = new CustomEvent('cart:checkout', { detail, cancelable: true });
  const notPrevented = document.dispatchEvent(evt);
  if (!notPrevented) return; // el consumidor maneja el checkout por su cuenta
  const allowed = await cart.checkout();
  if (allowed) cart.openCheckout();
}

/* ── eventos ────────────────────────────────────────────── */

function setZonesOpen(root: HTMLElement, open: boolean): void {
  const list = root.querySelector<HTMLElement>('[data-zone-list]');
  const toggle = root.querySelector<HTMLElement>('[data-cart-action="toggle-zones"]');
  if (list) list.hidden = !open;
  toggle?.setAttribute('aria-expanded', String(open));
}

function onClick(event: Event, cart: Cart): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-cart-action]');
  if (!target) return;
  const action = target.dataset.cartAction;
  const id = target.dataset.id;

  switch (action) {
    case 'open':
      cart.open();
      break;
    case 'close':
      cart.close();
      break;
    case 'back':
      cart.closeCheckout();
      break;
    case 'toggle':
      cart.toggle();
      break;
    case 'inc':
      if (id) cart.increment(id);
      break;
    case 'dec':
      if (id) cart.decrement(id);
      break;
    case 'remove':
      if (id) cart.removeItem(id);
      break;
    case 'clear':
      cart.clear();
      break;
    case 'checkout':
      void runCheckout(cart);
      break;
    case 'toggle-zones': {
      const zonesRoot = target.closest<HTMLElement>('[data-cart-zones]');
      if (zonesRoot) {
        const list = zonesRoot.querySelector<HTMLElement>('[data-zone-list]');
        setZonesOpen(zonesRoot, Boolean(list?.hidden));
      }
      break;
    }
    case 'select-zone': {
      const zones = cart.getOptions().shippingZones ?? [];
      const zone = zones[Number(target.dataset.zoneIndex)];
      cart.setShippingZone(zone ? { ...zone } : null);
      const zonesRoot = target.closest<HTMLElement>('[data-cart-zones]');
      if (zonesRoot) setZonesOpen(zonesRoot, false);
      break;
    }
    case 'add': {
      const card = target.closest<HTMLElement>('[data-cart-product]');
      const product = readProduct(card);
      if (product) cart.addItem(product, { quantity: Number(target.dataset.qty ?? 1) });
      break;
    }
    case 'variant-open': {
      const selector = resolveSelector(target);
      if (selector) openSelector(selector, cart);
      break;
    }
    case 'variant-close': {
      const selector = resolveSelector(target);
      if (selector) closeSelector(selector);
      break;
    }
    case 'variant-select': {
      const selector = resolveSelector(target);
      if (selector) {
        selector.dataset.variantIndex = target.dataset.variantIndex ?? '0';
        updateSelector(selector, cart);
      }
      break;
    }
    case 'variant-inc':
    case 'variant-dec': {
      const selector = resolveSelector(target);
      if (selector) {
        const step = action === 'variant-inc' ? 1 : -1;
        const next = Math.max(1, Number(selector.dataset.qty ?? 1) + step);
        selector.dataset.qty = String(next);
        updateSelector(selector, cart);
      }
      break;
    }
    case 'variant-add': {
      const selector = resolveSelector(target);
      if (!selector) break;
      const product = readProduct(selector);
      if (!product) break;
      const variant = (product.variants ?? [])[Number(selector.dataset.variantIndex ?? 0)];
      const qty = Math.max(1, Number(selector.dataset.qty ?? 1));
      const added = cart.addItem(product, variant ? { quantity: qty, variant } : { quantity: qty });
      if (added) closeSelector(selector);
      break;
    }
    default:
      break;
  }
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return qsa<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    root,
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function onKeydown(event: KeyboardEvent, cart: Cart): void {
  if (event.key === 'Escape') {
    const openSelectorEl = document.querySelector<HTMLElement>('[data-cart-selector][data-open="true"]');
    if (openSelectorEl) {
      closeSelector(openSelectorEl);
      return;
    }
    if (cart.isOpen()) cart.close();
    return;
  }

  if (event.key === 'Tab' && cart.isOpen()) {
    const drawer = document.querySelector<HTMLElement>('[data-cart-drawer][data-open="true"]');
    if (!drawer) return;
    const focusables = focusableElements(drawer);
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (!active || !drawer.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (active === last && !event.shiftKey) {
      event.preventDefault();
      first.focus();
    } else if (active === first && event.shiftKey) {
      event.preventDefault();
      last.focus();
    }
  }
}

/* ── init ───────────────────────────────────────────────── */

function readConfigFromDom(): CartOptions | undefined {
  const el = document.querySelector('[data-cart-config]');
  const raw = el?.getAttribute('data-cart-config');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CartOptions;
  } catch {
    return undefined;
  }
}

/**
 * Inicializa el controlador DOM del carrito (idempotente).
 *
 * - Los componentes Astro lo llaman solos; también puedes llamarlo tú con
 *   opciones propias (`initCart({ currency: 'USD' })`). **Gana la primera
 *   llamada**, o en su defecto el JSON de `data-cart-config` del `<CartDrawer>`.
 */
export function initCart(options?: CartOptions): Cart {
  const opts = options ?? (typeof document !== 'undefined' ? readConfigFromDom() : undefined);
  const cart = getCart(opts);

  if (typeof document === 'undefined') return cart;

  const g = globalThis as Record<string, unknown>;
  if (g[UI_KEY]) return cart;
  g[UI_KEY] = true;

  let lastFocus: HTMLElement | null = null;
  let wasOpen = cart.isOpen();

  cart.subscribe((state, event) => {
    render(cart);

    if (event.type !== 'checkout') {
      // 'item:add' → 'cart:item:add'; 'cart:change' → 'cart:change' (sin doble prefijo)
      const name = event.type.startsWith('cart:') ? event.type : `cart:${event.type}`;
      document.dispatchEvent(new CustomEvent(name, { detail: event }));
    }

    if (state.isOpen && !wasOpen) {
      lastFocus = document.activeElement as HTMLElement | null;
      document
        .querySelector<HTMLElement>('[data-cart-drawer][data-open="true"] [data-cart-action="close"]')
        ?.focus();
    } else if (!state.isOpen && wasOpen) {
      lastFocus?.focus();
      lastFocus = null;
    }
    wasOpen = state.isOpen;
  });

  document.addEventListener('click', (event) => onClick(event, cart));
  document.addEventListener('keydown', (event) => onKeydown(event, cart));

  render(cart);
  return cart;
}
