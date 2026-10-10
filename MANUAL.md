# MANUAL — `@tinycode/astro-cart`

Carrito de ecommerce funcional para **Astro**: drawer lateral, botón flotante, selector de variantes, zonas de entrega, persistencia y theming por CSS variables.

- **Cero dependencias de framework en el núcleo** (estado + aritmética en TypeScript puro).
- **SSR-safe**: los componentes se renderizan en el servidor; un controlador DOM idempotente sincroniza todo en el cliente. No necesitas islas `client:*`.
- Extraído de una auditoría real de carrito (Angular Signals) y rehecho como paquete reutilizable.

---

## 1. Instalación

```bash
npm install @tinycode/astro-cart
```

`lucide-astro` (iconos) se instala como dependencia del paquete; `astro` es peer (≥ 4).

## 2. Uso rápido

**Paso 1 — importa los estilos** en tu `Layout.astro` (o en tu CSS global):

```astro
---
// src/layouts/Layout.astro
---
<html>
  <head>
    <style is:global>
      @import '@tinycode/astro-cart/styles.css';

      /* Opcional: personaliza los colores (vea §7) */
      :root {
        --cart-primary: #7c2d12;
        --cart-secondary: #1c1917;
      }
    </style>
  </head>
  <body><slot /></body>
</html>
```

**Paso 2 — monta el carrito en tu página:**

```astro
---
// src/pages/index.astro
import { CartDrawer, CartTrigger, ProductCard } from '@tinycode/astro-cart/components';

const productos = [
  { id: 1, name: 'Pollo a la brasa', price: 35, imageUrl: '/pollo.jpg' },
  {
    id: 3,
    name: 'Combo familiar',
    price: 20,
    variants: [
      { id: 'v1', label: '1 und', price: 20 },
      { id: 'v2', label: '3 unds', price: 55, badge: 'Ahorra S/ 5', isDefault: true },
    ],
  },
];
---

<div class="grid">
  {productos.map((p) => <ProductCard product={p} />)}
</div>

<CartDrawer shippingZones={[{ name: 'Centro', fee: 8 }]} />
<CartTrigger />
```

Listo: `+` agrega productos (los que tienen `variants` abren el selector), el drawer desliza, el trigger flotante aparece con contador y total, y el carrito **sobrevive a recargas** (`localStorage`).

> Prueba local: la carpeta `demo/` de este repositorio es un proyecto Astro completo que consume el paquete (`npm install && npm run dev` dentro de `demo/`).

## 3. Componentes

| Componente | Importación | Qué hace |
|---|---|---|
| `CartDrawer` | `@tinycode/astro-cart/components` | Drawer: header + contador + lista + resumen + acciones. Incluye backdrop |
| `CartTrigger` | ídem | Botón flotante con badge y total (oculto si el carrito está vacío) |
| `ProductCard` | ídem | Card de producto: sin variantes agrega directo; con variantes abre el selector |
| `VariantSelector` | ídem | Modal (desktop) / bottom-sheet (móvil) con variantes + stepper |
| `CartSummary` | ídem | Zonas de entrega + subtotal/envío/impuestos/total + acciones (ya incluido en el drawer) |
| `CartItemRow` | ídem | Fila de producto (ya incluida en el drawer como plantilla) |
| `CartEmptyState` | ídem | Estado vacío con CTA (ya incluido en el drawer) |
| `CheckoutSlot` | ídem | Wrapper para tu formulario de checkout |

También puedes importar uno a uno: `import CartDrawer from '@tinycode/astro-cart/components/CartDrawer'`.

### 3.1 `CartDrawer`

| Prop | Tipo | Default | Descripción |
|---|---|---|---|
| `title` | `string` | `'Tu Carrito'` | Título del header |
| `checkoutTitle` | `string` | `'Finalizar Pedido'` | Título en vista de checkout |
| `shippingZones` | `{ name, fee }[]` | `[]` | Zonas seleccionables (se inyectan también al core) |
| `zoneLabel` | `string` | `'Seleccionar zona de entrega'` | Label del selector de zonas |
| `checkoutLabel` | `string` | `'Finalizar Pedido'` | Botón de checkout |
| `clearLabel` | `string` | `'Vaciar Carrito'` | Botón de vaciar |
| `showClear` | `boolean` | `true` | Mostrar/ocultar "Vaciar Carrito" |
| `currency` / `locale` | `string` | `'PEN'` / `'es-PE'` | Formato monetario (server); en cliente manda `options` |
| `options` | `CartOptions` | — | Opciones del carrito (§6), serializadas al controlador |
| `class` | `string` | — | Clase extra |

**Slots:** `empty` (reemplaza el estado vacío), `checkout` (tu formulario), `footer-actions` (reemplaza resumen + acciones).

```astro
<CartDrawer>
  <form slot="checkout" method="post" action="/pedido">
    <!-- tu checkout -->
    <button type="submit" class="ac-btn ac-btn--primary">Enviar pedido</button>
  </form>
</CartDrawer>
```

### 3.2 `ProductCard`

| Prop | Tipo | Default |
|---|---|---|
| `product` | `Product` (requerido) | — |
| `currency` / `locale` | `string` | `'PEN'` / `'es-PE'` |
| `showThumbnail` | `boolean` | `true` |
| `addLabel` | `string` | `'Agregar'` |
| `class` | `string` | — |

Regla (idéntica a la auditada): producto **con** `variants[]` → el botón `+` abre el selector; **sin** variantes → agrega directo y abre el drawer (`openOnAdd`).

### 3.3 `VariantSelector`

Props: `product`, `addLabel` (`'Agregar'`), `optionsLabel` (`'Opciones disponibles'`), `currency`, `locale`, `class`.

Úsalo embebido en `ProductCard` (automático) o suéltalo con tu propio botón:

```astro
---
import { VariantSelector } from '@tinycode/astro-cart/components';
---
<button data-cart-action="variant-open">Elegir</button>
<VariantSelector product={combo} />
```

El botón debe estar dentro del mismo contenedor `[data-cart-selector]` o de un `[data-cart-product]` que lo contenga.

### 3.4 `CartItemRow` (avanzado)

Renderiza una fila con `item` (SSR) o sin él (plantilla para el controlador). El drawer ya lo incluye; solo úsalo si construyes tu propia UI.

## 4. Modelo de datos

```ts
interface Product {
  id: string | number;
  name: string;
  price: number;                    // ya numérico
  imageUrl?: string | null;
  description?: string | null;
  stock?: number;                   // opcional: se valida al agregar
  maxQuantityPerItem?: number;      // override por producto
  compareAtPrice?: number;          // precio tachado (informativo)
  variants?: ProductVariant[];
  metadata?: Record<string, unknown>;
}

interface ProductVariant {
  id: string | number;              // clave estable (evita colisiones)
  label: string;                    // "3 unds"
  price: number;
  badge?: string | null;            // "+1 de regalo"
  compareAtPrice?: number;
  isDefault?: boolean;              // preseleccionada
}

interface CartItem {
  id: string;                       // clave de deduplicación
  productId: string | number;
  name: string;                     // "Combo — 3 unds"
  unitPrice: number;                // precio congelado al agregar
  quantity: number;
  imageUrl?: string | null;
  variant?: ProductVariant;
  lineTotal: number;                // unitPrice × quantity
  compareAtPrice?: number;
  maxQuantity?: number;
}
```

## 5. Programación (sin tocar el DOM)

```ts
import { cart, getCart, createCart, formatCurrency } from '@tinycode/astro-cart';
// o, si no usas los componentes Astro:
import { initCart } from '@tinycode/astro-cart/client';
```

`cart` es un **singleton por página** (compartido entre componentes y tu código). En el servidor no hace nada hasta que se usa.

### Acciones

| Método | Comportamiento |
|---|---|
| `cart.addItem(product, { quantity?, variant? })` | Deduplica por clave y **suma** cantidades; `quantity ≤ 0` → `null`; supera máx → `null` + evento |
| `cart.removeItem(id)` | Elimina la línea |
| `cart.updateQuantity(id, q)` | `q ≤ 0` elimina; `q > máx` no cambia + evento |
| `cart.increment(id, step?)` / `decrement(id, step?)` | El decremento **se detiene en 1** (eliminar es con la papelera) |
| `cart.clear()` | Vacía; reinicia la zona de entrega (configurable) |
| `cart.setShippingZone(zone \| null)` | Cambia el envío reactivamente |
| `cart.open()` / `close()` / `toggle()` | Drawer |
| `cart.openCheckout()` / `closeCheckout()` | Vista de checkout |
| `cart.checkout()` | Emite el evento `checkout`; devuelve `false` si un handler lo vetó |
| `cart.hydrate(state?)` | Restaura desde storage o un estado dado |
| `cart.destroy()` | Limpia listeners |

### Lecturas

`getItems()`, `getItem(id)`, `getItemCount()` (Σ cantidades), `getDistinctCount()`, `getSubtotal()`, `getShipping()`, `getTax()`, `getDiscount()` (ahorro informativo), `getTotal()`, `getTotals()`, `isEmpty()`, `isOpen()`, `getState()`, `getOptions()`.

### Suscripción

```ts
const unsubscribe = cart.subscribe((state, event) => {
  console.log(event.type, state.items);
});

cart.on('item:add', (e) => analytics.track('add', e.item));
```

### Eventos del core (`CartEvent['type']`)

`item:add` · `item:update` · `item:remove` · `quantity:limit` · `stock:insufficient` · `cart:clear` · `cart:change` · `open` · `close` · `shipping:zone` · `storage:error` · `checkout`

### Eventos DOM (sin importar el paquete)

El controlador repite los eventos del core como `CustomEvent` en `document` (el prefijo `cart:` no se duplica):

| Evento DOM | `event.detail` |
|---|---|
| `cart:item:add` | `{ type, item }` |
| `cart:item:update` | `{ type, item, previous }` |
| `cart:item:remove` | `{ type, itemId }` |
| `cart:quantity:limit` | `{ type, itemId, requested, max }` |
| `cart:stock:insufficient` | `{ type, productId, requested, available }` |
| `cart:clear` | `{ type }` |
| `cart:change` | `{ type, state, totals }` |
| `cart:open` / `cart:close` | `{ type }` |
| `cart:shipping:zone` | `{ type, zone }` |
| `cart:storage:error` | `{ type, error }` |
| `cart:checkout` | `{ items, totals, shippingZone }` — **cancelable**: `e.preventDefault()` impide abrir la vista de checkout (tú lo manejas) |

```ts
document.addEventListener('cart:item:add', (e) => {
  console.log('agregado', (e as CustomEvent).detail.item.name);
});

document.addEventListener('cart:checkout', (e) => {
  e.preventDefault();               // no abrir vista interna
  enviarWhatsApp((e as CustomEvent).detail);
});
```

## 6. Configuración del carrito

Pasa las opciones por la prop `options` del `CartDrawer` (se serializa a `data-cart-config` y las lee el controlador en el primer arranque), o llama tú a `initCart(options)` **antes** del primer componente:

```astro
<CartDrawer options={{
  storage: 'local',            // 'local' | 'session' | 'none' | StorageAdapter
  storageKey: 'mi-carrito',
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  currency: 'USD',
  locale: 'en-US',
  maxQuantityPerItem: 10,
  defaultShipping: 5,
  taxRate: 0,                  // 0–100; p. ej. 16 → IVA 16%
  openOnAdd: true,
  resetShippingOnClear: true,
}} />
```

| Opción | Default | Descripción |
|---|---|---|
| `storage` | `'local'` | Persistencia (`localStorage`). `'none'` = solo memoria |
| `storageKey` | `'astro-cart'` | Clave de storage |
| `ttlMs` | 7 días | Expiración; al vencer se limpia y se emite `storage:error` |
| `currency` / `locale` | `'PEN'` / `'es-PE'` | `Intl.NumberFormat` (decimales solo si los tiene) |
| `maxQuantityPerItem` | `99` | Límite por línea |
| `defaultShipping` | `0` | Envío si no hay zona seleccionada |
| `shippingZones` | `[]` | Se rellena solo desde la prop `shippingZones` del drawer |
| `taxRate` | `0` | Impuesto (no estaba en el original; disponible desde el MVP) |
| `getItemId` | `id[-variantId]` | Personaliza la clave de deduplicación |
| `normalizeItem` | — | Transforma el `CartItem` antes de guardarlo |
| `canAdd` | — | `(product, qty, state) => boolean` para vetar altas |
| `openOnAdd` | `true` | Abrir el drawer al agregar (comportamiento auditado) |
| `persistOpenState` | `false` | Persistir abierto/cerrado |
| `resetShippingOnClear` | `true` | `clear()` reinicia la zona (corrige el bug auditado R-13) |
| `onEvent` | — | Callback global de eventos |

## 7. Variables CSS (tema y colores)

Importa `styles.css` una vez y redefine **cualquier variable** en `:root` o en cualquier scope:

```css
@import '@tinycode/astro-cart/styles.css';

:root {
  /* marca */
  --cart-primary: #8b1a1a;
  --cart-secondary: #1a1007;
  --cart-tertiary: #ff6b00;
  --cart-accent: #f9ab2f;
  --cart-background: #fde7dd;

  /* superficies y texto */
  --cart-surface: #ffffff;
  --cart-surface-muted: #f8fafc;
  --cart-text: #1a1007;
  --cart-muted: #6b7280;
  --cart-border: #ececec;
  --cart-danger: #ef4444;
  --cart-overlay: rgb(15 23 42 / 60%);
}
```

### Tabla completa

| Variable | Default | Uso |
|---|---|---|
| `--cart-primary` | `#8b1a1a` | Badge, totales, botón `+`, acentos |
| `--cart-secondary` | `#1a1007` | Títulos, botón "Finalizar Pedido", trigger |
| `--cart-tertiary` | `#ff6b00` | Badges de variante, ahorro |
| `--cart-accent` | `#f9ab2f` | Estrella "recomendado" |
| `--cart-background` | `#fde7dd` | Reservado para fondos de marca |
| `--cart-surface` | `#ffffff` | Drawer, cards, filas |
| `--cart-surface-muted` | `#f8fafc` | Steppers, estado vacío, zonas |
| `--cart-text` | `#1a1007` | Texto principal |
| `--cart-muted` | `#6b7280` | Texto secundario |
| `--cart-border` | `#ececec` | Bordes y divisores |
| `--cart-danger` | `#ef4444` | Eliminar / vaciar |
| `--cart-overlay` | `rgb(15 23 42 / 60%)` | Backdrop del drawer y del selector |
| `--cart-font-display` | `inherit` | Títulos (`font-weight: 800`) |
| `--cart-font-body` | `inherit` | Cuerpo |
| `--cart-font-size-xs/sm/md/lg` | `0.72/0.85/1/1.25rem` | Escala tipográfica |
| `--cart-radius-sm` | `6px` | Botones |
| `--cart-radius` | `12px` | Cards, filas, modales |
| `--cart-radius-xl` | `18px` | Esquinas del drawer/bottom-sheet |
| `--cart-radius-full` | `999px` | Badges y steppers |
| `--cart-shadow` / `--cart-shadow-lg` | suave / fuerte | Elevación |
| `--cart-drawer-width` | `28rem` | Ancho máximo del drawer |
| `--cart-z-backdrop` / `--cart-z-trigger` / `--cart-z-drawer` / `--cart-z-modal` | `40/45/50/60` | Capas |
| `--cart-trigger-bottom` | `1.5rem` | Separación inferior del trigger |
| `--cart-duration` / `--cart-duration-fast` | `0.45s` / `0.28s` | Animaciones |
| `--cart-ease` | `cubic-bezier(0.22,1,0.36,1)` | Curva de movimiento |

Ejemplo oscuro:

```css
[data-tema='oscuro'] {
  --cart-surface: #1c1917;
  --cart-surface-muted: #292524;
  --cart-text: #fafaf9;
  --cart-muted: #a8a29e;
  --cart-border: #33302e;
  --cart-secondary: #fafaf9;
}
```

Las animaciones (fade/slide/zoom/ping) están incluidas en `styles.css`: **no** necesitas `tailwindcss-animate` ni Tailwind.

## 8. Persistencia

- Default: `localStorage['astro-cart']`, TTL de 7 días, esquema validado (versión + tipos).
- JSON inválido o expirado → se descarta, se arranca vacío y se emite `cart:storage:error`.
- El estado **abierto/cerrado no se persiste** (`persistOpenState: false`).
- En SSR (servidor) el storage se ignora: el paquete es 100 % seguro en build estático.
- Adaptador propio:

```ts
const cart = createCart({
  storage: {
    read: () => JSON.parse(sessionStorage.getItem('k') ?? 'null'),
    write: (s) => sessionStorage.setItem('k', JSON.stringify(s)),
    clear: () => sessionStorage.removeItem('k'),
  },
});
```

## 9. Accesibilidad

- Drawer y selector: `role="dialog"`, `aria-modal`, foco al abrir y de vuelta al cerrar, `Escape` cierra, trap de `Tab` en el drawer.
- Botones con `aria-label` ("Aumentar cantidad", "Eliminar producto", "Cerrar carrito").
- Total con `aria-live="polite"`; zonas con `aria-expanded` / `aria-current`; variantes como `radiogroup` + `role="radio"`.

## 10. Reglas de negocio (heredadas de la auditoría)

1. Deduplicación por clave `productId[-variantId]`; **mismas variantes distintas conviven** en paralelo.
2. Al duplicar se **suma** la cantidad; nunca se duplica la línea.
3. El precio se **congela** al agregar (sin reprecificación).
4. `maxQuantityPerItem` limita agregar e incrementar; al superarlo se emite `quantity:limit`.
5. `quantity ≤ 0` ⇒ eliminación (el stepper nunca baja de 1).
6. `total = subtotal + envío + impuestos`; el descuento (`compareAtPrice`) es **informativo** (`getDiscount()`), no se resta dos veces.
7. Feedback de "agregado" = apertura automática del drawer (`openOnAdd`).
8. El ítem basura `addItem(dummy, 0)` del código original **no se portó**.

## 11. Troubleshooting

| Síntoma | Causa / solución |
|---|---|
| Drawer sin estilos o visible sin abrir | Falta `import '@tinycode/astro-cart/styles.css'` |
| Dos carritos distintos | Alguien llamó `createCart()` directamente; usa `getCart()`/`cart` (singleton) |
| Las opciones no se aplican | La **primera** llamada a `initCart()` gana; usa la prop `options` del `CartDrawer` |
| Personalicé `getItemId` y el carrito viejo se rompió | Cambia `storageKey` o limpia el storage (la clave cambia el esquema) |

## 12. Fuera de alcance

Catálogo/productos como fuente de datos, APIs, horarios de apertura, WhatsApp, formularios de entrega, cupones, stock multiusuario y pasarela de pago: los aporta **tu proyecto** (vía slots, eventos y `canAdd`/`checkout`).
