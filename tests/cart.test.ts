import { describe, expect, it, vi } from 'vitest';
import { createCart } from '../src/core/cart.js';
import type { Product } from '../src/core/types.js';

const pollo: Product = { id: 1, name: 'Pollo a la brasa', price: 35 };
const chaufa: Product = { id: 2, name: 'Arroz chaufa', price: 25 };

const conRango: Product = {
  id: 10,
  name: 'Combo familiar',
  price: 60,
  variants: [
    { id: 'a', label: '1 und', price: 20 },
    { id: 'b', label: '3 unds', price: 55, isDefault: true },
  ],
};

function memoryCart(opts: Parameters<typeof createCart>[0] = {}) {
  return createCart({ storage: 'none', openOnAdd: false, ...opts });
}

describe('addItem', () => {
  it('agrega un producto y deduplica por id sumando cantidades', () => {
    const cart = memoryCart();
    cart.addItem(pollo, { quantity: 2 });
    cart.addItem(pollo, { quantity: 3 });

    expect(cart.getItems()).toHaveLength(1);
    expect(cart.getItem('1')?.quantity).toBe(5);
    expect(cart.getItemCount()).toBe(5);
    expect(cart.getDistinctCount()).toBe(1);
  });

  it('crea líneas separadas para variantes distintas (R-2)', () => {
    const cart = memoryCart();
    cart.addItem(conRango, { variant: conRango.variants![0] });
    cart.addItem(conRango, { variant: conRango.variants![1] });

    expect(cart.getItems()).toHaveLength(2);
    expect(cart.getItem('10-a')?.name).toBe('Combo familiar — 1 und');
    expect(cart.getItem('10-b')?.name).toBe('Combo familiar — 3 unds');
  });

  it('congela el precio de la variante (R-6)', () => {
    const cart = memoryCart();
    cart.addItem(conRango, { variant: conRango.variants![1], quantity: 2 });
    expect(cart.getItem('10-b')?.unitPrice).toBe(55);
    expect(cart.getItem('10-b')?.lineTotal).toBe(110);
  });

  it('no agrega quantity 0 o negativa (R-1 descartado)', () => {
    const cart = memoryCart();
    expect(cart.addItem(pollo, { quantity: 0 })).toBeNull();
    expect(cart.isEmpty()).toBe(true);
  });

  it('emite quantity:limit y no agrega si supera el máximo (R-4)', () => {
    const onEvent = vi.fn();
    const cart = memoryCart({ maxQuantityPerItem: 5, onEvent });
    expect(cart.addItem(pollo, { quantity: 6 })).toBeNull();
    expect(cart.isEmpty()).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quantity:limit', requested: 6, max: 5 }),
    );
  });

  it('no pasa del máximo al sumar un duplicado', () => {
    const onEvent = vi.fn();
    const cart = memoryCart({ maxQuantityPerItem: 5, onEvent });
    cart.addItem(pollo, { quantity: 4 });
    cart.addItem(pollo, { quantity: 3 });
    expect(cart.getItem('1')?.quantity).toBe(4);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quantity:limit', requested: 7, max: 5 }),
    );
  });

  it('respeta stock cuando existe', () => {
    const onEvent = vi.fn();
    const cart = memoryCart({ onEvent });
    cart.addItem({ ...pollo, stock: 2 }, { quantity: 3 });
    expect(cart.isEmpty()).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stock:insufficient', available: 2 }),
    );
  });

  it('canAdd puede vetar el alta', () => {
    const cart = memoryCart({ canAdd: () => false });
    expect(cart.addItem(pollo)).toBeNull();
    expect(cart.isEmpty()).toBe(true);
  });

  it('precio inválido cae a 0 (R-3)', () => {
    const cart = memoryCart();
    const added = cart.addItem({ id: 9, name: 'Sin precio', price: Number.NaN });
    expect(added?.unitPrice).toBe(0);
  });

  it('openOnAdd abre el drawer (R-10)', () => {
    const cart = createCart({ storage: 'none', openOnAdd: true });
    cart.addItem(pollo);
    expect(cart.isOpen()).toBe(true);
  });
});

describe('updateQuantity / increment / decrement', () => {
  it('quantity <= 0 elimina el ítem (R-5)', () => {
    const cart = memoryCart();
    cart.addItem(pollo);
    cart.updateQuantity('1', 0);
    expect(cart.isEmpty()).toBe(true);
  });

  it('decrement se detiene en 1 (R-14)', () => {
    const cart = memoryCart();
    cart.addItem(pollo, { quantity: 1 });
    cart.decrement('1');
    expect(cart.getItem('1')?.quantity).toBe(1);
    cart.removeItem('1');
    expect(cart.isEmpty()).toBe(true);
  });

  it('emite quantity:limit al superar el máximo', () => {
    const onEvent = vi.fn();
    const cart = memoryCart({ maxQuantityPerItem: 3, onEvent });
    cart.addItem(pollo);
    cart.updateQuantity('1', 10);
    expect(cart.getItem('1')?.quantity).toBe(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quantity:limit', requested: 10, max: 3 }),
    );
  });

  it('increment/decrement recalculan el total de línea', () => {
    const cart = memoryCart();
    cart.addItem(pollo);
    cart.increment('1', 2);
    expect(cart.getItem('1')?.lineTotal).toBe(105);
    cart.decrement('1');
    expect(cart.getItem('1')?.lineTotal).toBe(70);
  });
});

describe('totales', () => {
  it('subtotal = Σ (unitPrice × quantity)', () => {
    const cart = memoryCart();
    cart.addItem(pollo, { quantity: 2 });
    cart.addItem(chaufa, { quantity: 1 });
    expect(cart.getSubtotal()).toBe(95);
    expect(cart.getTotal()).toBe(95);
    expect(cart.getDiscount()).toBe(0);
    expect(cart.getTax()).toBe(0);
  });

  it('la zona de entrega cambia el envío y el total', () => {
    const cart = memoryCart({ defaultShipping: 5 });
    cart.addItem(pollo);
    expect(cart.getShipping()).toBe(5);
    expect(cart.getTotal()).toBe(40);

    cart.setShippingZone({ name: 'Centro', fee: 12 });
    expect(cart.getShipping()).toBe(12);
    expect(cart.getTotal()).toBe(47);
  });

  it('aplica taxRate sobre el subtotal', () => {
    const cart = memoryCart({ taxRate: 18 });
    cart.addItem(pollo);
    expect(cart.getTax()).toBe(6.3);
    expect(cart.getTotal()).toBe(41.3);
  });

  it('el descuento (compareAtPrice) es informativo y no baja el total', () => {
    const cart = memoryCart();
    cart.addItem({ ...pollo, compareAtPrice: 45 });
    expect(cart.getDiscount()).toBe(10);
    expect(cart.getSubtotal()).toBe(35);
    expect(cart.getTotal()).toBe(35);
  });
});

describe('clear y zona de entrega (R-13)', () => {
  it('clear reinicia la zona por defecto', () => {
    const cart = memoryCart({ defaultShipping: 5 });
    cart.addItem(pollo);
    cart.setShippingZone({ name: 'Centro', fee: 12 });
    cart.clear();
    expect(cart.isEmpty()).toBe(true);
    expect(cart.getState().shippingZone).toBeNull();
    expect(cart.getShipping()).toBe(5);
  });

  it('resetShippingOnClear: false conserva la zona', () => {
    const cart = memoryCart({ resetShippingOnClear: false });
    cart.addItem(pollo);
    cart.setShippingZone({ name: 'Centro', fee: 12 });
    cart.clear();
    expect(cart.getState().shippingZone).toEqual({ name: 'Centro', fee: 12 });
  });
});

describe('suscripción y eventos', () => {
  it('subscribe notifica cada cambio con totales', () => {
    const cart = memoryCart();
    const seen: string[] = [];
    const unsub = cart.subscribe((_state, event) => seen.push(event.type));
    cart.addItem(pollo);
    cart.open();
    unsub();
    cart.addItem(chaufa);

    expect(seen).toContain('cart:change');
    expect(seen).toContain('item:add');
    expect(seen).toContain('open');
    expect(seen.filter((t) => t === 'item:add')).toHaveLength(1);
  });

  it('on(type) escucha solo ese tipo', () => {
    const cart = memoryCart();
    const handler = vi.fn();
    cart.on('item:remove', handler);
    cart.addItem(pollo);
    cart.removeItem('1');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'item:remove', itemId: '1' }));
  });
});

describe('persistencia', () => {
  it('guarda y restaura con un adaptador en memoria', () => {
    let saved: unknown = null;
    const adapter = {
      read: () => saved as never,
      write: (state: unknown) => (saved = state),
      clear: () => (saved = null),
    };

    const first = createCart({ storage: adapter, openOnAdd: false });
    first.addItem(pollo, { quantity: 2 });
    first.setShippingZone({ name: 'Centro', fee: 12 });

    const second = createCart({ storage: adapter, openOnAdd: false });
    expect(second.getItems()).toHaveLength(1);
    expect(second.getItem('1')?.quantity).toBe(2);
    expect(second.getState().shippingZone?.name).toBe('Centro');
    // isOpen no se persiste por defecto
    expect(second.isOpen()).toBe(false);
  });

  it('descarta el estado corrupto y emite storage:error', () => {
    const onEvent = vi.fn();
    const adapter = {
      read: () => ({ version: 1, updatedAt: Date.now(), items: [{ id: 'x' }] }) as never,
      write: () => undefined,
      clear: () => undefined,
    };
    const cart = createCart({ storage: adapter, onEvent, openOnAdd: false });
    expect(cart.isEmpty()).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'storage:error' }));
  });
});
