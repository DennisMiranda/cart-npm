import { describe, expect, it } from 'vitest';
import { formatCurrency, roundMoney, toPrice } from '../src/core/format.js';
import { validateState, STATE_VERSION } from '../src/core/persistence.js';
import { getItemId } from '../src/core/identity.js';

describe('formatCurrency (equivalente al PrecioPipe)', () => {
  // Intl usa un espacio duro (U+00A0) entre el símbolo y el número.
  const s = (x: string) => x.replace(/\u00A0/g, ' ');

  it('sin decimales no muestra centavos', () => {
    expect(s(formatCurrency(35))).toBe('S/ 35');
    expect(s(formatCurrency(0))).toBe('S/ 0');
  });

  it('con decimales muestra 2 cifras', () => {
    expect(s(formatCurrency(35.5))).toBe('S/ 35.50');
  });

  it('respeta locale y currency', () => {
    expect(formatCurrency(10, { locale: 'en-US', currency: 'USD' })).toBe('$10');
  });

  it('maneja NaN', () => {
    expect(s(formatCurrency(Number.NaN))).toBe('S/ 0');
  });
});

describe('roundMoney / toPrice', () => {
  it('redondea a 2 decimales sin deriva flotante', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(41.299999)).toBe(41.3);
  });

  it('toPrice convierte strings y basura a número', () => {
    expect(toPrice('25.5')).toBe(25.5);
    expect(toPrice('')).toBe(0);
    expect(toPrice(undefined)).toBe(0);
    expect(toPrice(Number.NaN)).toBe(0);
  });
});

describe('getItemId', () => {
  it('usa el id del producto sin variante', () => {
    expect(getItemId({ id: 7, name: 'X', price: 1 })).toBe('7');
  });

  it('usa variant.id para evitar colisiones (R-2)', () => {
    expect(getItemId({ id: 7, name: 'X', price: 1 }, { id: '3-55', label: '3 unds', price: 55 })).toBe('7-3-55');
  });
});

describe('validateState', () => {
  const valid = {
    version: STATE_VERSION,
    updatedAt: Date.now(),
    items: [
      {
        id: '1',
        productId: 1,
        name: 'Pollo',
        unitPrice: 35,
        quantity: 2,
        lineTotal: 70,
      },
    ],
    isOpen: false,
    shippingZone: { name: 'Centro', fee: 12 },
  };

  it('acepta un estado válido', () => {
    const state = validateState(valid);
    expect(state).not.toBeNull();
    expect(state?.items).toHaveLength(1);
    expect(state?.shippingZone?.name).toBe('Centro');
  });

  it('rechaza versiones distintas', () => {
    expect(validateState({ ...valid, version: 99 })).toBeNull();
  });

  it('rechaza ítems con campos inválidos', () => {
    expect(validateState({ ...valid, items: [{ id: '1' }] })).toBeNull();
    expect(validateState({ ...valid, items: 'nope' })).toBeNull();
  });

  it('expira por TTL', () => {
    expect(validateState({ ...valid, updatedAt: Date.now() - 10_000 }, 5_000)).toBeNull();
    expect(validateState({ ...valid, updatedAt: Date.now() - 1_000 }, 5_000)).not.toBeNull();
  });

  it('rechaza basura', () => {
    expect(validateState(null)).toBeNull();
    expect(validateState('x')).toBeNull();
  });
});
