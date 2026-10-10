import type { Product, ProductVariant } from './types.js';

/**
 * Clave de deduplicación por defecto.
 *
 * Regla auditada (R-2): `productId` o `productId-qty-price`.
 * Se mejora usando `variant.id` cuando existe para evitar colisiones entre
 * variantes con el mismo precio y cantidad.
 */
export function getItemId(product: Product, variant?: ProductVariant): string {
  if (!variant) return `${product.id}`;
  return `${product.id}-${variant.id}`;
}
