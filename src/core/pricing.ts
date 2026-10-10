import { roundMoney } from './format.js';
import type { CartItem, CartTotals } from './types.js';

export interface PricingInput {
  items: CartItem[];
  shipping: number;
  /** 0–100 */
  taxRate?: number;
}

/**
 * Fórmulas auditadas (§5.5) + extensibilidad (taxRate / compareAtPrice):
 * - subtotal  = Σ (unitPrice × quantity)
 * - discount  = Σ max(0, compareAtPrice − unitPrice) × quantity   [informativo]
 * - tax       = (subtotal) × taxRate / 100
 * - shipping  = zone.fee ?? defaultShipping ?? 0
 * - total     = subtotal + shipping + tax
 */
export function computeTotals(input: PricingInput): CartTotals {
  const { items, shipping, taxRate = 0 } = input;

  let itemCount = 0;
  let subtotal = 0;
  let discount = 0;

  for (const item of items) {
    itemCount += item.quantity;
    subtotal += item.unitPrice * item.quantity;
    if (typeof item.compareAtPrice === 'number' && item.compareAtPrice > item.unitPrice) {
      discount += (item.compareAtPrice - item.unitPrice) * item.quantity;
    }
  }

  const safeSubtotal = roundMoney(subtotal);
  const safeShipping = roundMoney(shipping);
  const tax = taxRate > 0 ? roundMoney((safeSubtotal * taxRate) / 100) : 0;

  return {
    itemCount,
    distinctCount: items.length,
    subtotal: safeSubtotal,
    shipping: safeShipping,
    tax,
    discount: roundMoney(discount),
    total: roundMoney(safeSubtotal + safeShipping + tax),
  };
}
