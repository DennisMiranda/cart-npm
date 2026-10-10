# Especificación del Carrito — Lógica y UI → paquete npm para Astro

> **Objeto:** especificación de la **lógica y la UI del carrito** extraída por auditoría directa del código, para reconstruirlo como un **componente npm reutilizable en Astro** (`@tu-scope/astro-cart`), sin volver a analizar este proyecto.
>
> **Proyecto auditado:** Astro 7 + Angular 22 (`@analogjs/astro-angular`) en `/Users/dennis/Documents/TINYACODE/lacasona-restaurants`.
>
> **Alcance de este documento:** exclusivamente el carrito (estado, reglas, cálculos, persistencia y sus componentes de UI). **Queda fuera:** catálogo/productos como origen de datos, APIs, horarios de apertura, WhatsApp, formularios de entrega y cualquier negocio propio del restaurante.
>
> **Reglas de la auditoría:** no se modificó código; toda conclusión lleva ruta de archivo. **No encontrado** = no existe en el código actual. Las secciones §9–§14 son **recomendaciones para el paquete**, no comportamiento existente.

---

## 1. Resumen ejecutivo

El carrito es un **store basado en Signals de Angular** (clase `Cart`, singleton) con **UI de drawer lateral**, **botón flotante** con contador y **resumen con subtotal/envío/total**.

| Aspecto | Estado actual |
|---|---|
| Motor de estado | `signal` + `computed` en un servicio singleton — `src/menu-angular/core/services/cart.service.ts` |
| Persistencia del carrito | **No existe**: solo en memoria; se pierde al recargar |
| Impuestos / IVA | **No encontrado** |
| Descuentos | No hay cálculo en el carrito; el precio ya entra con descuento aplicado (`src/menu-angular/page/menu/menu.ts:110`) |
| Stock / SKU | **No encontrado** |
| Variantes | Un concepto: `PriceRangeEntry` (presentación "1 und", "3 unds") — `src/menu-angular/core/models/price-range.model.ts` |
| Envío | `deliveryFee` = `zonaSeleccionada.fee ?? order_config.delivery_fee ?? 0` |
| Toasts / confirmaciones | **No encontrado** — el feedback es la apertura automática del drawer |
| Estado de carga del carrito | **No encontrado** |
| Sync entre pestañas / expiración | **No encontrado** |
| Integración con backend | **Ninguna**: el carrito es 100% frontend (ver §6) |

El 100% de las reglas del carrito son **framework-agnostic** (aritmética + arrays inmutables). Las únicas dependencias reales son `@angular/core` (signals), el pipe de formato de moneda y la lectura de `order_config`.

---

## 2. Archivos involucrados (solo carrito)

### 2.1 Lógica y modelos

| Archivo | Responsabilidad |
|---|---|
| `src/menu-angular/core/services/cart.service.ts` | **Store del carrito**: estado, addItem/removeItem/updateQuantity/clear, totales, apertura, zona de entrega |
| `src/menu-angular/core/models/cart.model.ts` | Interface `CartItem` |
| `src/menu-angular/core/models/product.model.ts` | `Product`, `ProductPriceRange` (entrada del catálogo que se agrega) |
| `src/menu-angular/core/models/price-range.model.ts` | `PriceRangeEntry` (variante/presentación) |
| `src/menu-angular/core/models/restaurant.model.ts` | `OrderConfig` (`max_order_quantity`, `delivery_fee`), `DeliveryZone` |
| `src/menu-angular/core/pipes/precio.pipe.ts` | Formato monetario `es-PE` / `PEN` |
| `src/menu-angular/core/services/local.service.ts` | Wrapper de `localStorage` (solo se usa para nombre/dirección, **no** para el carrito) |
| `src/menu-angular/core/services/restaurant.service.ts` | Expone `orderConfig` y `delivery_zones` (config que alimenta al carrito) |

### 2.2 UI del carrito

| Archivo | Responsabilidad |
|---|---|
| `src/menu-angular/components/sidebar-cart/sidebar-cart.component.{ts,html}` | Drawer: header, lista, resumen, selector de zona, acciones |
| `src/menu-angular/components/cart-item/cart-item.component.{ts,html}` | Fila de producto: stepper +/−, total de línea, eliminar |
| `src/menu-angular/components/cart-trigger/cart-trigger.{ts,html}` | Botón flotante con contador y total |

### 2.3 Puntos de entrada "agregar al carrito" (frontera del paquete)

| Archivo | Responsabilidad |
|---|---|
| `src/menu-angular/base-template/components/add-button/add-button.component.ts` | Botón `+` |
| `src/menu-angular/base-template/components/template-card/template-card.{ts,html}` | Card: decide agregar directo o abrir selector de variantes |
| `src/menu-angular/base-template/components/price-range-card/price-range-card.ts` | Card "Desde S/ X · Elegir cantidades" |
| `src/menu-angular/base-template/components/product-detail/product-detail.{ts,html}` | Modal/bottom-sheet: selector de cantidad + variantes + "Agregar" |
| `src/menu-angular/base-template/components/combo-card/*`, `promotion-card/*` | Cards con botón `+` |
| `src/menu-angular/base-template/index.ts` + `blocks/block-{1..7,combos,promotions}.ts` | Burrbujean `addToCart`/`productClick` |
| `src/menu-angular/page/menu/menu.{ts,html}` | Normaliza el producto y llama `cart.addItem(...)` |

**Fuera del alcance de este documento (mencionados solo donde tocan el carrito):** `checkout-form.component.*`, `restaurant-closed-modal.*`, `modal.component.*`, `business-hours.service.ts`, `menu.service.ts` (HTTP), `whatsapp-button`, `loading-screen`, banners, galería.

---

## 3. Componentes UI

### 3.1 `AddButtonComponent` — botón "+"

- **Ruta:** `src/menu-angular/base-template/components/add-button/add-button.component.ts`
- **Responsabilidad:** botón `+` presentacional.
- **Inputs:** `text: string`, `customClass: string`, `disabled: boolean`, `iconSize: string` (default `"h-6 w-6"`).
- **Outputs:** `clicked: output<Event>` — hace `stopPropagation()`; si `disabled()` no emite.
- **Dependencias:** `LucidePlus` (`@lucide/angular`).
- **Estado interno:** ninguno.

### 3.2 `TemplateCardComponent` — card de producto

- **Ruta:** `src/menu-angular/base-template/components/template-card/template-card.{ts,html}`
- **Inputs:** `product: Product` (requerido).
- **Outputs:** `productClick: output<Product>`, `addToCart: output<Product>`.
- **Dependencias:** `RestaurantService` (`canOrder`), `PrecioPipe`, `PriceRangeCard`, `AddButtonComponent`, `LucideStar`.
- **Regla clave (`onAddClick`, líneas 65-73):**
  - producto **con** `priceRanges[]` → **no agrega**; emite `productClick` para abrir el selector de variantes;
  - producto **sin** rangos → emite `addToCart` directamente.
- **Precio mostrado:** `startingPrice()` = `Math.min` de los `priceRanges` con `price > 0`, o `Number(product.price)` (líneas 48-60).
- **Acciones:** clic en card → `productClick`; clic en `+` → agrega o abre selector; botón deshabilitado si `!canOrder()`.
- **Dos diseños visuales:** con imagen (card `rounded-3xl` con precio en badge circular) y sin imagen (fila `hover:bg-secondary/5`); si hay rangos delega en `PriceRangeCard`.

### 3.3 `PriceRangeCard`

- **Ruta:** `src/menu-angular/base-template/components/price-range-card/price-range-card.ts`
- **Responsabilidad:** card "Desde S/ X" + "Elegir cantidades" para producto con variantes.
- **Inputs:** `product`, `startingPrice`, `canOrder`.
- **Outputs:** `productClick` (la card entera), `addToCart` (**nunca se emite** → código muerto).

### 3.4 Selector de producto — `ChifaProductDetail`

- **Ruta:** `src/menu-angular/base-template/components/product-detail/product-detail.{ts,html}`
- **Responsabilidad:** modal/bottom-sheet con detalle, **selector de cantidad**, **selector de variantes** y acción "Agregar".
- **Inputs:** `product: Product` (requerido).
- **Outputs:** `addToCart: output<{product, quantity, selectedEntry?}>`, `close: output<void>`.
- **Estado interno:** `quantity = signal(1)`, `_selectedEntry = signal<PriceRangeEntry|null>(null)`.
- **Derivados:** `priceRanges`, `hasPriceRanges`, `selectedEntry` (**si no hay selección usa la primera entrada**, líneas 45-50), `currentPrice` (precio del entry o `Number(product.price)`; `''/null/undefined/NaN → 0`), `maxQuantity` (`orderConfig.max_order_quantity ?? 99`), `canOrder`.
- **Acciones:** `increase()` (bloquea si `quantity >= maxQuantity`), `decrease()` (bloquea si `<= 1`), `selectEntry(entry)`, `onAddToCart()` (emite y **cierra el modal**), clic en overlay → `close`.
- **UI:** mobile = bottom sheet (`slide-in-from-bottom`), desktop = modal centrado (`zoom-in`, `max-w-4xl md:max-h-[90svh]`), grid 1 o 2 columnas según `imageUrl`; barra de acciones sticky inferior con precio grande + stepper + botones.
- *(El botón "WhatsApp" de este modal es negocio específico → fuera del paquete.)*

### 3.5 `SidebarCart` — drawer del carrito

- **Ruta:** `src/menu-angular/components/sidebar-cart/sidebar-cart.component.{ts,html}`
- **Selector:** `<app-sidebar-cart>`, standalone, `OnPush`.
- **Inputs:** `templateId: string|null`, `backgroundColor: string|null` (**no se usa** → sin efecto).
- **Outputs:** **No encontrado** (todo vía el servicio `Cart`).
- **Dependencias:** `Cart`, `BusinessHoursService` (solo para el checkout), `PrecioPipe`, `CartItemComponent`, `CheckoutFormComponent`, Lucide (`ArrowRight`, `ShoppingBag`, `ArrowLeft`, `X`, `MapPin`).
- **Estado interno:** `showCheckout = signal(false)`, `showDeliveryZones = signal(false)`.
- **Señales expuestas del store:** `isOpen`, `items`, `count`, `subtotal`, `deliveryFee`, `total`, `isEmpty`, `deliveryZones`, `selectedDeliveryZone`.

**Estructura visual:**

1. **Backdrop:** `fixed inset-0 bg-slate-800/60 backdrop-blur-sm z-40 transition-opacity animate-in fade-in duration-300`; clic → `close()`. Solo se monta si `isOpen()`.
2. **Panel:** `fixed top-0 right-0 h-full w-full max-w-md z-50 bg-white shadow-2xl flex flex-col transition-transform duration-500 ease-out` con `translate-x-full` ⇄ `translate-x-0`; `ngClass="'theme-' + templateId()"` (clase sin definir → R-8).
3. **Header:** `p-6 border-b border-gray-100 flex items-center justify-between` — botón "atrás" (solo vista checkout), título `'Tu Carrito'` / `'Finalizar Pedido'`, badge `bg-primary text-white px-2 py-0.5 rounded-full text-xs` con `count`, botón `X` (`aria-label="Cerrar carrito"`).
4. **Cuerpo:** `grow overflow-y-auto p-6 scroll-smooth`.
   - **Estado vacío** (líneas 38-50): círculo `w-24 h-24 bg-gray-50` con `LucideShoppingBag`, `¡Tu carrito está vacío!`, texto secundario, botón **"Explorar Menú"** (`px-6 py-3 bg-secondary ... hover:scale-105 active:scale-95`) → `close()`. Animación `animate-in zoom-in-95 duration-500`.
   - **Lista:** `space-y-4`, `@for (item of items(); track item.id)` → `<app-cart-item [item] (increase)/(decrease)/(remove)>`.
   - **Vista checkout:** `<app-checkout-form>` cuando `showCheckout()` (fuera del alcance del paquete → slot).
5. **Footer** (solo si `!isEmpty() && !showCheckout()`), `p-6 bg-white border-t border-gray-100`:
   - **Selector de zonas** (si `deliveryZones().length > 0`): botón con `LucideMapPin` + label o "Seleccionar zona de entrega", chevron `LucideArrowRight` que rota 90° (`class.rotate-90`), lista desplegable `max-h-40 overflow-y-auto` con `bg-secondary/10` en la zona activa.
   - **Resumen:** `Subtotal` (siempre), `Delivery` (**solo si `deliveryFee() > 0`**), `Total` (`text-2xl font-bold text-primary`, `border-t`).
   - **Acciones:** botón `Finalizar Pedido` (`bg-secondary text-white py-4 rounded-sm ... hover:scale-[1.01] active:scale-[0.99]` + `LucideArrowRight`) y enlace `Vaciar Carrito` (`text-red-500 ... uppercase tracking-widest text-xs`).

**Acciones del usuario:**

| Acción | Resultado |
|---|---|
| Clic backdrop / botón X | `_cart.close()` + `showCheckout=false` |
| Clic `+` en ítem | `Cart.updateQuantity(id, q+1)` (silencioso si supera `max_order_quantity`) |
| Clic `−` en ítem | `Cart.updateQuantity(id, q-1)`; el botón está `disabled` si `quantity <= 1` |
| Clic papelera | `_cart.removeItem(id)` — **sin confirmación** |
| Clic "Vaciar Carrito" | `_cart.clear()` — **sin confirmación** |
| Clic zona de entrega | `_cart.selectDeliveryZone(zone)` + cierra lista → cambia `deliveryFee` y `total` |
| Clic "Finalizar Pedido" | abre la vista de checkout (o el modal de negocio cerrado — lógica ajena al paquete) |
| Clic "atrás" | `showCheckout=false` |

### 3.6 `CartItemComponent` — fila del carrito

- **Ruta:** `src/menu-angular/components/cart-item/cart-item.component.{ts,html}`
- **Inputs:** `item: CartItem` (`input.required`).
- **Outputs:** `increase`, `decrease`, `remove` (`output<string>`, emiten **`item().id`**).
- **Dependencias:** `PrecioPipe`, `LucideMinus`, `LucidePlus`, `LucideTrash2`.
- **Estado interno:** ninguno (presentacional, `OnPush`).
- **Estructura visual:** `flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 mb-2 transition-all hover:shadow-md animate-in fade-in slide-in-from-right-4 duration-300`.
  - Nombre `text-sm font-bold text-secondary truncate`.
  - **La imagen NO se renderiza** aunque `CartItem.imageUrl` existe: el bloque está vacío (`cart-item.component.html:3-4`) → **No encontrado en UI**.
  - Precio unitario `{{ item.price | precio }} c/u` (`text-xs text-muted`).
  - **Stepper:** pill `flex items-center bg-gray-50 rounded-full border border-gray-200 p-0.5` → botón `−` (`w-7 h-7 rounded-full`, `disabled` si `quantity <= 1`, `title="Disminuir cantidad"`), número `w-6 text-center text-xs font-bold`, botón `+`; ambos con `hover:bg-white hover:shadow-sm active:scale-95`.
  - **Total de línea:** `(price * quantity)` alineado `ml-auto`, `text-sm font-bold text-primary`.
  - **Eliminar:** `p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full active:scale-90`, `aria-label="Eliminar producto"`.

### 3.7 `CartTriggerComponent` — botón flotante

- **Ruta:** `src/menu-angular/components/cart-trigger/cart-trigger.{ts,html}`
- **Inputs:** `templateId`, `backgroundColor` (este **no se usa**). **Outputs:** ninguno.
- **Señales:** `count`, `total`, `isEmpty`.
- **Render:** solo si `!isEmpty()`; `fixed bottom-0 left-0 right-0 p-4 z-40 md:min-w-100 md:max-w-lg md:left-auto animate-in slide-in-from-bottom-10 duration-500` (+ envoltorio `fixed bottom-6 right-6 z-50` en `menu.html:14`).
- **Contenido:** badge circular `bg-primary w-8 h-8` con `count` + efecto `animate-ping`, textos "Ver Carrito" / "Tu Pedido", `{{ total | precio }}`, caja con `LucideArrowRight`.
- **Acción `openCart()` (líneas 31-37):**
  - negocio cerrado → `this._cart.addItem({ id: 'dummy' } as any, 0)` (**defecto**: crea un ítem basura `quantity:0, price:0, name:"undefined"` y abre el drawer; no muestra ningún modal — R-1).
  - negocio abierto → `_cart.open()`.

### 3.8 Resumen / totales

Ubicación: `sidebar-cart.component.html:108-125`.

| Línea | Fórmula | Cuándo se muestra |
|---|---|---|
| Subtotal | `Σ (item.price × item.quantity)` | siempre |
| Delivery | `selectedDeliveryZone?.fee ?? order_config.delivery_fee ?? 0` | solo si `> 0` |
| **Total** | `subtotal + deliveryFee` | siempre |

- **Descuentos en el resumen:** **No encontrado** (ya aplicados al `price`).
- **Impuestos:** **No encontrado**.
- **Cantidad total:** badge del header del drawer y del botón flotante (`count = Σ quantity`).
- **Formato:** `PrecioPipe` → `Intl.NumberFormat('es-PE', {style:'currency', currency:'PEN'})`, con 2 decimales solo si el número tiene decimales (`precio.pipe.ts:29-34`).

### 3.9 Estados

| Estado | Existencia | Detalle |
|---|---|---|
| Carrito vacío | **Sí** | `sidebar-cart.component.html:38-50` |
| Carga del carrito | **No encontrado** | No hay spinner en el drawer ni en el store |
| Toast "producto agregado" | **No encontrado** | Feedback = apertura automática del drawer |
| Confirmación de eliminar/vaciar | **No encontrado** | Acciones inmediatas e irreversibles |
| Límite de cantidad excedido | Silencioso | Sin mensaje ni estado de error |

### 3.10 Animaciones, responsive, iconos y estilos

**Apertura/cierre:** backdrop `animate-in fade-in duration-300` (montado con `@if (isOpen())`); panel con `translate-x-0`/`translate-x-full` + `transition-transform duration-500 ease-out` (siempre en el DOM).

**Resto:** ítems `fade-in slide-in-from-right-4 duration-300`; vacío `zoom-in-95 duration-500`; trigger `slide-in-from-bottom-10 duration-500`; detalle `slide-in-from-bottom` / `zoom-in duration-300`; micro-interacciones `active:scale-95`, `hover:scale-105`, `animate-ping`.

> ⚠️ `animate-in/fade-in/zoom-in-*/slide-in-from-*` requieren `tailwindcss-animate`, **no presente en `package.json`** (`package.json:14-31`) → esas animaciones pueden no generar CSS (R-9).

**Responsive**
- Drawer: `w-full max-w-md` (full-bleed móvil, 28rem desktop).
- Trigger: barra inferior full-width en móvil → `md:left-auto md:max-w-lg`.
- Selector de producto: bottom-sheet móvil / modal centrado desktop.
- Zonas de entrega: lista scroll `max-h-40`.

**Iconos** (`@lucide/angular`, directivas `<svg lucideX>`): `ShoppingBag`, `Plus`, `Minus`, `Trash2`, `X`, `ArrowRight`, `ArrowLeft`, `MapPin`, `Star`.

**Tokens de tema** (`src/css/global.css:5-31`): `--color-primary #8B1A1A`, `--color-secondary #1a1007`, `--color-tertiary #FF6B00`, `--color-accent #F9AB2F`, `--color-background #FDE7DD`, `--font-display "BespokeSerif-Extrabold"`, `--font-body "Switzer-Regular"`.
**Utilities usadas:** `text-secondary`, `text-primary`, `bg-secondary`, `bg-primary`, `font-display`, `font-body`, `rounded-sm/xl/2xl/3xl`, `shadow-sm/lg/2xl/premium`, `border-gray-100`.
**Sin definición en CSS:** `shadow-premium` y `theme-{templateId}` (R-8).

---

## 4. Modelo de datos

### 4.1 `CartItem` — ítem dentro del carrito
`src/menu-angular/core/models/cart.model.ts`

| Campo | Tipo | Obligatorio | Origen / nota |
|---|---|---|---|
| `id` | `string` | **Sí** | Clave de deduplicación: `` `${product.id}` `` o `` `${product.id}-${entry.qty}-${entry.price}` `` (`cart.service.ts:74-78`) |
| `originalProductId` | `number` | **Sí** | `product.id` de origen |
| `name` | `string` | **Sí** | `product.name` + sufijo `` ` — {qty} und(s)` `` si hay variante |
| `price` | `number` | **Sí** | Precio **unitario** (`NaN → 0`) |
| `quantity` | `number` | **Sí** | Entero ≥ 0 (0 solo por el bug del `dummy`) |
| `imageUrl` | `string \| null` | **Sí** (acepta `null`) | Copiado del producto; **no se muestra en la UI** |
| `selectedEntry` | `{ qty: number\|string; price: number\|string; bonus?: string\|null }` | **No** | Variante elegida |

> **No existen:** `sku`, `stock`, `discount`, `tax`, `variants[]`, `metadata` → **No encontrado**.

### 4.2 `Product` — entrada del catálogo
`src/menu-angular/core/models/product.model.ts`

| Campo | Tipo | Obligatorio | Nota |
|---|---|---|---|
| `id` | `number` | Sí | Puede llegar como `string` desde promos (`Number(item.id) \|\| item.id`) |
| `name` | `string` | Sí | |
| `description` | `string \| null` | Sí | |
| `price` | `string` | Sí | **String** en origen; se parsea con `Number()` |
| `categoryId` | `string` | Sí | fallback `"item"` |
| `imageUrl` | `string \| null` | Sí | |
| `isActive` | `boolean` | Sí | Se fuerza `true` al normalizar |
| `isRecommended` | `boolean` | Sí | Estrella en las cards |
| `prices` | `any[]` | Sí | Sin tipar |
| `priceRanges` | `ProductPriceRange[]` | Sí | Variantes embebidas |

`ProductPriceRange`: `{ id, productId, quantity: string, unit: string, price: string, bonus: string|null, isDefault: boolean }`.

### 4.3 `PriceRangeEntry` — variante/presentación
`src/menu-angular/core/models/price-range.model.ts`

`{ id, productId, quantity: string, unit: string, price: string|number, bonus: string|null, isDefault: boolean, qty?: string|number }`
→ `qty` es **alias legacy**; en `cart.service.ts:106` se resuelve `qty: selectedEntry.qty ?? selectedEntry.quantity`.

> **Es el equivalente funcional de "variante":** presentaciones ("1 unidad", "3 unidades", "+1 de regalo"). **No hay talla/color.**

### 4.4 Diferencias entre estructuras

| | `Product` (catálogo) | `CartItem` (carrito) |
|---|---|---|
| Archivo | `product.model.ts` | `cart.model.ts` |
| `id` | `number` | `string` **compuesto** |
| `price` | `string` | `number` unitario congelado |
| Variantes | `priceRanges[]` (todas) | `selectedEntry` (1 elegida) |
| Cantidades | No | `quantity` |
| Imagen | `imageUrl` | `imageUrl` copiado (sin render) |

**Normalización obligatoria catálogo → carrito** (`menu.ts:105-119`, idéntica en `promotions-section.component.ts:59-74`):
```
id: Number(item.id) || item.id
price: String(item.discountedPrice !== undefined ? item.discountedPrice : item.price)  // ← aplica el descuento aquí
imageUrl: item.imageUrl || item.image_url || item.url || ""
categoryId: item.categoryId || item.category_id || "item"
isActive: true, isRecommended: false
```

### 4.5 Configuración externa que afecta al carrito
`src/menu-angular/core/models/restaurant.model.ts`

```ts
OrderConfig {
  max_order_quantity: number;   // límite por línea (default 99)
  delivery_fee: number;         // tarifa de envío por defecto
  delivery_enabled: boolean;    // habilita dirección / "canOrder"
  ...
}
DeliveryZone { name: string; fee: number }
BusinessConfig { ..., delivery_zones: DeliveryZone[] }
```

---

## 5. Lógica del carrito

**Archivo:** `src/menu-angular/core/services/cart.service.ts` (clase `Cart`, `providedIn:'root'`).

### 5.1 Estado

```ts
isOpen                 = signal(false)          // drawer abierto
isBusinessClosed       = signal(false)          // modal de negocio (ajeno al paquete)
items                  = signal<CartItem[]>([])  // fuente de verdad
selectedDeliveryZone   = signal<DeliveryZone|null>(null)
count                  = computed(Σ item.quantity)
subtotal               = computed(Σ item.price * item.quantity)
deliveryFee            = computed(zone?.fee ?? orderConfig?.delivery_fee ?? 0)
total                  = computed(subtotal + deliveryFee)
isEmpty                = computed(items.length === 0)
deliveryZones          = computed(restaurantConfig?.business_config?.delivery_zones ?? [])
```

### 5.2 `addItem(product, quantity = 1, selectedEntry?)` — líneas 67-115

1. **Genera el id:** `` cartItemId = product.id + (selectedEntry ? `-${entry.qty}-${entry.price}` : "") ``.
2. **Busca duplicado** por igualdad exacta de `id`.
3. **Si ya existe** → **no crea otro `CartItem`**: `updateQuantity(id, existente.quantity + quantity)` (suma de cantidades).
4. **Si es nuevo:**
   - `maxQty = orderConfig?.max_order_quantity ?? 99`;
   - si `quantity > maxQty` → **`return` silencioso** (no agrega, sin error);
   - `rawPrice = Number(selectedEntry ? selectedEntry.price : product.price)`; `isNaN → 0`;
   - `entryLabel = selectedEntry ? ` — {qty} und${qty !== 1 ? "s" : ""}` : ""`;
   - crea el `CartItem` con `items.set([...currentItems, newItem])` (inmutable).
5. **Siempre** llama `this.open()` → el drawer se abre como feedback.

**No valida:** stock, precio vigente, disponibilidad ni `quantity <= 0` en ítem nuevo (R-1).

### 5.3 `updateQuantity(cartItemId, quantity)` — líneas 122-139

1. `quantity <= 0` → `removeItem(id)` (**decrementar hasta 0 elimina**).
2. `quantity > maxQty` (`?? 99`) → **`return` silencioso: no cambia nada**.
3. En otro caso → `items.update(items => items.map(i => i.id === id ? {...i, quantity} : i))`.

### 5.4 `removeItem` / `clear` / `open` / `close` / zona

- `removeItem(id)`: `filter(i => i.id !== id)` — sin confirmación.
- `clear()`: `items.set([])` — **no reinicia `selectedDeliveryZone`** (R-12).
- `open()` / `close()`: solo `isOpen`.
- `selectDeliveryZone(zone)` / `clearDeliveryZone()`: cambian `deliveryFee` y `total` reactivamente.
- `showBusinessClosedModal()` / `closeBusinessClosedModal()`: estado ajeno al paquete.

### 5.5 Cálculos

| Magnitud | Fórmula exacta | Archivo:línea |
|---|---|---|
| Cantidad total | `items().reduce((a,i)=>a+i.quantity,0)` | `cart.service.ts:23-25` |
| Subtotal | `items().reduce((a,i)=>a+i.price*i.quantity,0)` | `:29-31` |
| Envío | `selectedDeliveryZone()?.fee ?? restaurantService.orderConfig()?.delivery_fee ?? 0` | `:33-39` |
| Total | `subtotal() + deliveryFee()` | `:41` |
| Descuentos | **No existe cálculo** (aplicados al normalizar) | `menu.ts:110` |
| Impuestos | **No encontrado** | — |

### 5.6 Pseudo-código de referencia (fiel al actual)

```ts
// addItem (cart.service.ts:67-115)
const id = `${product.id}${selectedEntry ? `-${selectedEntry.qty}-${selectedEntry.price}` : ""}`
const existing = items.find(i => i.id === id)
const max = orderConfig?.max_order_quantity ?? 99

if (existing) {
  updateQuantity(id, existing.quantity + quantity)   // suma; respeta max; ≤0 elimina
} else {
  if (quantity > max) return                          // silencioso
  const price = Number(selectedEntry?.price ?? product.price)
  items.set([...items, {
    id,
    originalProductId: product.id,
    name: `${product.name}${selectedEntry ? ` — ${selectedEntry.qty} und${selectedEntry.qty != 1 ? "s" : ""}` : ""}`,
    price: isNaN(price) ? 0 : price,
    quantity,
    imageUrl: product.imageUrl,
    selectedEntry: selectedEntry && { qty: selectedEntry.qty ?? selectedEntry.quantity,
                                      price: selectedEntry.price, bonus: selectedEntry.bonus },
  }])
}
open()                                                // siempre abre el drawer

// updateQuantity (líneas 122-139)
if (quantity <= 0) return removeItem(id)
if (quantity > max) return                            // silencioso
items = items.map(i => i.id === id ? { ...i, quantity } : i)

// totales
count    = Σ i.quantity
subtotal = Σ i.price * i.quantity
shipping = selectedZone?.fee ?? orderConfig?.delivery_fee ?? 0
total    = subtotal + shipping
```

---

## 6. Persistencia

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿El carrito se persiste? | **No** | `Cart` no toca storage (`cart.service.ts`) |
| ¿Dónde vive? | En memoria (signals del injector) | — |
| ¿Cuándo se guarda/recupera? | Nunca | — |
| ¿Contenido corrupto/inexistente? | N/A; arranca en `items = []` | `cart.service.ts:17` |
| ¿Sync entre pestañas? | **No** (sin `storage` event ni `BroadcastChannel`) | grep en `src/` |
| ¿Expiración? | **No** | — |

**Solo se persiste algo adyacente** (no es el carrito): `user_name` y `user_address` en `localStorage` al enviar el checkout — `checkout-form.component.ts:37-46,60-66,90-91`.

**Consecuencia:** recargar o navegar **vacía el carrito** y cierra el drawer.

---

## 7. Flujo completo y comunicación

### 7.1 Flujo feliz (solo carrito)

```
1. Producto en card
   ├─ sin variantes → clic "+" → addToCart.emit(product)
   └─ con variantes → clic "+" → productClick.emit(product) → modal selector
          → usuario elige variante (default: primera) y cantidad
          → addToCart{product, quantity, selectedEntry}
2. Página normaliza el Product (price = discountedPrice si existe)
3. Cart.addItem(product, qty, entry)
   ├─ id existente → updateQuantity(id, q+qty)
   ├─ id nuevo (qty ≤ max) → items.set([...items, new])
   └─ open() → isOpen = true
4. Persistencia: NINGUNA
5. CartTrigger se oculta si isEmpty; muestra count/total
6. SidebarCart se desliza (translate-x-0)
7. +/- → updateQuantity → computed recalculan → UI se actualiza
8. Zona de entrega → selectDeliveryZone → cambia deliveryFee/total
```

### 7.2 Flujos alternativos

| Caso | Comportamiento existente |
|---|---|
| **Carrito vacío** | Drawer muestra estado vacío + "Explorar Menú"; trigger y footer **no se renderizan** |
| **Eliminar producto** | Papelera → `removeItem` → sin confirmación; si queda vacío, footer y trigger desaparecen |
| **Producto duplicado** | Misma clave `id` → suma de cantidades; distinta variante → línea separada |
| **Cantidad ≤ 0** | `updateQuantity` elimina el ítem |
| **Cantidad > máx.** | `return` silencioso, **sin mensaje** |
| **Stock insuficiente** | **No encontrado** (no hay noción de stock) |
| **Recarga / navegación** | El carrito **desaparece** |
| **Producto sin precio** | `price → 0` (`S/ 0`) |
| **Error de datos** | El carrito no hace llamadas; no aplica |

### 7.3 Comunicación entre componentes

| Relación | Estrategia | Archivo |
|---|---|---|
| ProductCard → página | `output<Product>()` (`productClick`, `addToCart`) burbujeando por bloques → `BaseTemplate` → `Menu` | `template-card.ts:32-33`, `base-template/index.ts:157-158`, `menu.html:10` |
| Selector de producto → página | `output<{product, quantity, selectedEntry}>` | `product-detail.ts:19`, `menu.html:25` |
| Página → Cart | **Llamada directa** al servicio (`addItem`, `open`) | `menu.ts:118,126` |
| Cart → SidebarCart / CartTrigger | **Signals + `inject(Cart)`** (sin Inputs/Outputs para el estado) | `sidebar-cart.component.ts:43-60`, `cart-trigger.component.ts:20-26` |
| SidebarCart → CartItem | Inputs/Outputs: `[item]`, `(increase)/(decrease)/(remove)` (emiten `id`) | `sidebar-cart.component.html:56-57` |
| Cart → Header | **No existe botón de carrito en el header** | grep en `header.*` → sin coincidencias |
| Eventos DOM | `click` | — |

**No se usa:** NgRx, stores de terceros, RxJS para el estado, `localStorage` para el carrito, CustomEvents.

---

## 8. Reglas de negocio (existentes)

1. **R-1 (defecto):** `CartTrigger.openCart()` con negocio cerrado llama `addItem({id:'dummy'} as any, 0)` (`cart-trigger.component.ts:33`) → crea ítem basura (`quantity:0`, `price:0`, `name:"undefined"`) y abre el drawer.
2. **R-2:** deduplicación por `id` compuesto `productId[-qty-price]`; mismas variantes distintas conviven en paralelo.
3. **R-3:** al duplicar se **suma** cantidad; nunca se duplica la línea.
4. **R-4:** `max_order_quantity` (default 99) limita agregar e incrementar; el incumplimiento es **silencioso**.
5. **R-5:** `quantity <= 0` ⇒ eliminación.
6. **R-6:** el precio se **congela** al agregar; no hay reprecificación.
7. **R-7:** el descuento se aplica una sola vez, al normalizar (`discountedPrice` manda sobre `price`).
8. **R-8:** `total = subtotal + envío`; **sin impuestos ni descuentos en el resumen**.
9. **R-10:** feedback de "agregado" = **apertura automática del drawer**; sin toast.
10. **R-12:** no hay validación de stock, SKU, mínimos ni cupones (solo límite por línea).
11. **R-13:** `clear()` **no** reinicia la zona de entrega seleccionada.
12. **R-14:** el botón `−` está deshabilitado en `quantity <= 1` ⇒ la eliminación natural es la papelera o "Vaciar Carrito".
13. **R-15:** `order_config.enabled` y `pickup_enabled` **no se consultan** en el carrito.

---

## 9. Dependencias de Angular a eliminar (framework-agnostic)

| Dependencia actual | Dónde | Sustitución propuesta |
|---|---|---|
| `signal`, `computed` (`@angular/core`) | `cart.service.ts` y componentes | Core con `subscribe(listener)` + adaptadores |
| `@Injectable`, `inject`, `providedIn:'root'` | `Cart` | Factory `createCart(options)` sin DI |
| `input()`, `input.required()`, `output()` | componentes UI | Componentes Astro + props / Web Components |
| `ChangeDetectionStrategy.OnPush` | componentes | Irrelevante fuera de Angular |
| `CommonModule` y sintaxis `@if/@for/@switch` | plantillas `.html` | Plantillas Astro |
| `PrecioPipe` (`Pipe` de Angular) | todas las UI | Función pura `formatCurrency(value, {locale, currency})` |
| `@lucide/angular` (`<svg lucideX>`) | todas las UI | SVG inline / `lucide` vanilla / slot de iconos |
| `ngClass` / `[class.x]` | drawer y trigger | `class` dinámico estándar |
| `RestaurantService` (lectura de `order_config`) | `Cart` | Opciones inyectadas: `maxQuantityPerItem`, `defaultShipping`, `shippingZones` |

**Se conserva tal cual (no es de Angular):** fórmulas de totales, estrategia de `id` compuesto, suma de cantidades, límite de cantidad, precio congelado, `Intl.NumberFormat`.

---

## 10. Qué conservar / descartar / convertir en configuración

### Conservar
- El modelo mental: `items` + derivados `count / subtotal / deliveryFee / total / isEmpty`.
- Deduplicación por clave compuesta y suma de cantidades.
- Límite de cantidad por ítem y eliminación automática en ≤ 0.
- Precio congelado por línea.
- Separación `Product` (catálogo) vs `CartItem` (carrito) + capa de normalización.
- Total de línea = `unitPrice × quantity`; formato `Intl` es-PE/PEN con decimales condicionales.
- Zona de entrega seleccionable que recalcula el envío.
- UI de drawer: backdrop + panel deslizante + header con contador + lista + footer con resumen y acciones.
- Card con decisión "agregar directo vs. abrir selector de variantes".
- Estado vacío con CTA; apertura automática al agregar; trigger flotante oculto si vacío.

### Descartar
- `addItem({id:'dummy'} as any, 0)` (R-1).
- `signal`/`computed`/`@Injectable`/`inject` como primitiva obligatoria.
- `PrecioPipe` (→ función).
- Sintaxis de plantillas Angular y `CommonModule`.
- `@lucide/angular` como dependencia dura.
- Normalización duplicada (`menu.ts` y `promotions-section.component.ts`).
- Inputs muertos: `backgroundColor` (drawer y trigger), `addToCart` de `PriceRangeCard`.
- Acoplamiento a `RestaurantService` / `BusinessHoursService`.
- El render de imagen ausente en la fila del carrito (hoy `imageUrl` se guarda y no se muestra).

### Convertir en configuración

| Configuración | Valor actual | Propiedad propuesta |
|---|---|---|
| Máx. cantidad por ítem | `order_config.max_order_quantity ?? 99` | `maxQuantityPerItem` |
| Envío por defecto | `order_config.delivery_fee ?? 0` | `defaultShipping` |
| Zonas de entrega | `business_config.delivery_zones` | `shippingZones[]` |
| Impuestos | **No existe** | `taxRate` / `taxCalculator` |
| Descuentos | inline en la normalización | `compareAtPrice` / `discountStrategy` |
| Moneda/locale | hardcodeado `es-PE`/`PEN` | `currency`, `locale` |
| Persistencia | ninguna | `storage: 'none'\|'local'\|'session'\|adapter`, `storageKey`, `ttlMs` |
| Clave de deduplicación | id compuesto hardcodeado | `getItemId(product, variant)` |
| Al superar el máximo | silencioso | evento `quantity:limit` |
| Al agregar | abrir drawer | `openOnAdd` |
| Textos | strings hardcodeados | `labels` |
| Iconos | Lucide Angular | `icons` / slots |
| Tema | tokens Tailwind del proyecto | CSS variables + `classPrefix` |
| Variantes | `PriceRangeEntry` específico | `variant: { id, label, price, badge? }` |
| Imagen en la fila | no se muestra | `showItemThumbnail` |

---

## 11. Arquitectura propuesta para `@tu-scope/astro-cart`

```
@tu-scope/astro-cart
├── packages/core                      # framework-agnostic, cero dependencias
│   ├── src/cart.ts                    # createCart() → estado + acciones
│   ├── src/types.ts                   # Product, CartItem, CartState, CartOptions
│   ├── src/pricing.ts                 # subtotal / envío / impuesto / total
│   ├── src/persistence.ts             # StorageAdapter (memory | local | session | custom)
│   ├── src/identity.ts                # getItemId(product, variant)
│   ├── src/subscribe.ts               # pub/sub: subscribe(fn) → unsubscribe
│   └── src/format.ts                  # formatCurrency (reemplaza a PrecioPipe)
├── packages/astro                     # componentes Astro + controlador cliente
│   ├── src/components/
│   │   ├── CartDrawer.astro           # backdrop + panel + header + slots
│   │   ├── CartItemRow.astro
│   │   ├── CartTrigger.astro          # botón flotante con badge
│   │   ├── CartSummary.astro          # subtotal / envío / total
│   │   ├── CartEmptyState.astro
│   │   ├── ProductCard.astro          # agregar directo vs. abrir selector
│   │   ├── VariantSelector.astro      # modal/bottom-sheet de variantes + stepper
│   │   └── CheckoutSlot.astro         # slot: el consumidor aporta su formulario
│   ├── src/controller.ts              # puente core ↔ DOM (script cliente)
│   └── src/index.ts
└── packages/persist-* (opcionales)    # adapters de storage
```

**Decisiones clave:**
1. **Core puro en TypeScript** con `subscribe(listener)`; cada framework se adapta con su primitiva (Angular `signal()`, React `useSyncExternalStore`, Vue `computed`, Astro → actualización del DOM desde el controlador).
2. **Astro-first:** componentes `.astro` + un único script cliente que instancia `createCart(...)` y sincroniza el DOM. La lógica de precios/estado **nunca** vive en el template.
3. **Slots en lugar de componentes cerrados:** `item-media`, `footer-actions`, `checkout`, `empty-state` los aporta el consumidor.
4. **Sin HTTP dentro del paquete** (el catálogo/config llega por props u opciones).
5. **Persistencia opcional** con validación de esquema: si el JSON es inválido se descarta, se arranca vacío y se emite `storage:error`.
6. **SSR-safe:** todo acceso a `localStorage`/`window` va tras `typeof window !== 'undefined'` o dentro del adapter inyectado (Astro renderiza en servidor).
7. **Instancia única por página** (singleton en `globalThis`) para que varias islas compartan el mismo carrito.

---

## 12. API pública propuesta

```ts
import { createCart } from '@tu-scope/astro-cart/core'

const cart = createCart({
  storage: { type: 'local', key: 'my-cart', ttl: 7 * 24 * 60 * 60 },
  maxQuantityPerItem: 99,
  currency: 'PEN',
  locale: 'es-PE',
  openOnAdd: true,
  getItemId: (product, variant) => variant ? `${product.id}-${variant.id}` : `${product.id}`,
})

// ── Acciones ──────────────────────────────────────────────
cart.addItem(product, { quantity?, variant? })  // → CartItem | null
cart.removeItem(itemId)
cart.updateQuantity(itemId, quantity)           // ≤ 0 ⇒ elimina
cart.increment(itemId, step = 1)
cart.decrement(itemId, step = 1)
cart.clear()
cart.setShippingZone(zone | null)
cart.open() / cart.close() / cart.toggle()
cart.hydrate(state?)                            // desde storage o estado dado
cart.destroy()                                  // limpia listeners y suscripciones

// ── Lecturas (síncronas) ─────────────────────────────────
cart.getItems(): CartItem[]
cart.getItem(id): CartItem | undefined
cart.getItemCount(): number        // Σ quantity
cart.getDistinctCount(): number    // items.length
cart.getSubtotal(): number
cart.getShipping(): number
cart.getTax(): number
cart.getDiscount(): number
cart.getTotal(): number
cart.getTotals(): CartTotals
cart.isEmpty(): boolean
cart.isOpen(): boolean
cart.getState(): CartState         // snapshot inmutable

// ── Suscripción / eventos ────────────────────────────────
const unsubscribe = cart.subscribe((state, event) => { ... })
cart.on('item:add' | 'item:update' | 'item:remove' | 'quantity:limit'
      | 'cart:clear' | 'cart:change' | 'open' | 'close'
      | 'storage:error' | 'checkout', handler)

// ── Hooks opcionales ─────────────────────────────────────
cart.setCheckout(async (ctx) => { ... })         // el consumidor define el checkout
cart.setShippingCalculator((ctx) => Promise<number>)
```

---

## 13. Interfaces TypeScript propuestas

```ts
/** Variante/presentación (equivale a PriceRangeEntry en el proyecto actual) */
export interface ProductVariant {
  id: string | number
  label: string            // "3 unds"
  price: number            // precio unitario de esta variante
  badge?: string | null    // "+1 de regalo"
  compareAtPrice?: number
  metadata?: Record<string, unknown>
}

/** Producto mínimo que el paquete necesita (superset de Product/Promotion/Combo) */
export interface Product {
  id: string | number
  name: string
  price: number                    // ya numérico (el consumidor resuelve string → number)
  imageUrl?: string | null
  description?: string | null
  sku?: string
  stock?: number                   // opcional: si existe, se valida
  maxQuantityPerItem?: number      // override por producto
  variants?: ProductVariant[]
  isPromotion?: boolean
  compareAtPrice?: number
  metadata?: Record<string, unknown>
}

export interface CartItem {
  id: string                       // clave de deduplicación
  productId: string | number
  name: string
  unitPrice: number                // precio congelado al agregar
  quantity: number
  imageUrl?: string | null
  variant?: ProductVariant
  lineTotal: number                // unitPrice * quantity
  metadata?: Record<string, unknown>
}

export interface ShippingZone { id?: string; name: string; fee: number }

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  shippingZone: ShippingZone | null
  version: number                  // migraciones de storage
  updatedAt: number                // epoch ms, para TTL
}

export interface CartTotals {
  itemCount: number
  distinctCount: number
  subtotal: number
  shipping: number
  tax: number
  discount: number
  total: number
}

export type CartEvent =
  | { type: 'item:add'; item: CartItem }
  | { type: 'item:update'; item: CartItem; previous: CartItem }
  | { type: 'item:remove'; itemId: string }
  | { type: 'quantity:limit'; itemId: string; requested: number; max: number }
  | { type: 'cart:clear' }
  | { type: 'cart:change'; state: CartState; totals: CartTotals }
  | { type: 'open' } | { type: 'close' }
  | { type: 'storage:error'; error: unknown }
  | { type: 'checkout'; payload: CheckoutContext }

export interface CheckoutContext {
  items: CartItem[]
  totals: CartTotals
  shippingZone: ShippingZone | null
  customer?: Record<string, unknown>
}

export interface StorageAdapter {
  read(): CartState | null
  write(state: CartState): void
  clear(): void
}

export interface CartOptions {
  storage?: 'none' | 'local' | 'session' | StorageAdapter
  storageKey?: string              // default 'cart'
  ttlMs?: number                   // default: sin expiración
  currency?: string                // default 'PEN'
  locale?: string                  // default 'es-PE'
  maxQuantityPerItem?: number      // default 99
  maxTotalQuantity?: number
  defaultShipping?: number
  shippingZones?: ShippingZone[]
  taxRate?: number
  getItemId?: (product: Product, variant?: ProductVariant) => string
  normalizeItem?: (item: CartItem) => CartItem
  canAdd?: (product: Product, quantity: number, state: CartState) => boolean
  openOnAdd?: boolean              // default true (comportamiento actual)
  persistOpenState?: boolean       // default false
  onEvent?: (event: CartEvent) => void
}

export interface Cart {
  addItem(product: Product, opts?: { quantity?: number; variant?: ProductVariant }): CartItem | null
  removeItem(id: string): void
  updateQuantity(id: string, quantity: number): void
  increment(id: string, step?: number): void
  decrement(id: string, step?: number): void
  clear(): void
  setShippingZone(zone: ShippingZone | null): void
  open(): void
  close(): void
  toggle(): void
  getItems(): CartItem[]
  getItem(id: string): CartItem | undefined
  getItemCount(): number
  getDistinctCount(): number
  getSubtotal(): number
  getShipping(): number
  getTax(): number
  getDiscount(): number
  getTotal(): number
  getTotals(): CartTotals
  isEmpty(): boolean
  isOpen(): boolean
  getState(): CartState
  subscribe(fn: (state: CartState, event: CartEvent) => void): () => void
  on(type: CartEvent['type'], fn: (e: CartEvent) => void): () => void
  hydrate(state?: Partial<CartState>): void
  destroy(): void
}
```

---

## 14. Riesgos y casos especiales

| # | Riesgo | Detalle | Acción sugerida |
|---|---|---|---|
| **R-1** | `addItem` con `quantity=0` | Crea ítem basura y abre el drawer (`cart-trigger.component.ts:33`) | No portar; usar hook `canOpen` |
| **R-2** | Colisión de `id` compuesto | `productId-qty-price`: dos variantes con igual `qty` y `price` colisionan | `getItemId` con `variant.id` estable |
| **R-3** | `price` es `string` en el catálogo | `Number('') → 0` silencioso | Validar en `addItem` + evento de error |
| **R-4** | Máximo por línea silencioso | El usuario pulsa `+` y "no pasa nada" | Emitir `quantity:limit` + feedback en UI |
| **R-5** | Sin stock | No existe validación en ningún archivo | `stock` opcional + evento `stock:insufficient` |
| **R-6** | Sin persistencia | Recarga = carrito perdido | `storage: 'local'` por defecto con TTL y `version` |
| **R-8** | Clases Tailwind inexistentes | `shadow-premium`, `theme-{templateId}` sin definir en `src/css/**` | Definir tokens o eliminar |
| **R-9** | `animate-in` sin plugin | `tailwindcss-animate` no está en `package.json` | Incluir el plugin o reimplementar animaciones con CSS propio |
| **R-10** | Doble normalización | `menu.ts:105-119` ≡ `promotions-section.component.ts:59-74` | Unificar en `normalize` del paquete |
| **R-11** | Precio congelado vs. storage | Con persistencia, precios viejos sobreviven a recargas | `revalidateOnHydrate(productLoader)` |
| **R-12** | `clear()` no reinicia la zona | Totales con envío obsoleto | `clear()` reinicia `shippingZone` (o configurable) |
| **R-13** | SSR/Astro | `localStorage`/`window` no existen en servidor | Guards + adapter inyectado + isla `client:visible` |
| **R-14** | Múltiples islas | Dos instancias `createCart()` = dos carritos | Singleton en `globalThis` |
| **R-15** | Cambiar `getItemId` | Rompe carritos persistidos | `version` + migraciones en `hydrate` |
| **R-16** | Sin confirmación de borrado | Eliminar/vaciar es inmediato | `confirmRemove(ctx)` opcional |
| **R-17** | Accesibilidad | Sin `role="dialog"`, `aria-modal`, foco atrapado, `Escape`, `aria-live` en totales | Añadirlos en los componentes Astro |
| **R-18** | Imagen no renderizada | `imageUrl` se guarda y no se muestra | `showItemThumbnail` + slot `item-media` |
| **R-19** | Impuestos inexistentes | No hay IVA en el código actual | Dejar `taxRate`/`taxCalculator` en la API desde el MVP |

---

## 15. MVP del paquete

**Debe incluir (extraído 1:1 del comportamiento actual):**

1. `createCart()` con estado inmutable (`items`, `isOpen`, `shippingZone`) y la API de §12.
2. `addItem` con **deduplicación por clave** y **suma de cantidades** (R-2/R-3).
3. Soporte de **variantes** (`variant` con `label`, `price`, `badge`) equivalentes a `PriceRangeEntry`.
4. `updateQuantity` con **eliminación automática ≤ 0** y **límite configurable** (evento `quantity:limit`).
5. `increment` / `decrement` / `removeItem` / `clear`.
6. Derivados: `getItemCount`, `getDistinctCount`, `getSubtotal`, `getShipping`, `getTotal`, `isEmpty`.
7. **Envío:** `defaultShipping` + `shippingZones[]` seleccionables + `setShippingZone`.
8. **Pricing extensible:** `taxRate`, `compareAtPrice` (descuento) y `taxCalculator`/`discountStrategy`.
9. **Persistencia opcional** con `storageKey`, `ttlMs`, `version`, validación de esquema y evento `storage:error`.
10. **Suscripción** `subscribe`/`on` para que cualquier framework reaccione.
11. **`formatCurrency`** con la misma semántica de decimales que `PrecioPipe`.
12. **Componentes Astro:**
    - `CartDrawer` (backdrop + panel deslizante + header con contador + cierre por backdrop/`Escape`),
    - `CartItemRow` (nombre, opcional miniatura, precio unitario, stepper `−`/`+` deshabilitado en 1, total de línea, eliminar con `aria-label`),
    - `CartTrigger` (badge con contador + total, oculto si vacío),
    - `CartSummary` (subtotal, envío si > 0, total),
    - `CartEmptyState` (ícono + copy + CTA),
    - `footer-actions` (Vaciar Carrito / Continuar).
13. **`ProductCard`** con la regla "sin variantes ⇒ agregar directo; con variantes ⇒ abrir selector" (§3.2).
14. **`VariantSelector`** (modal/bottom-sheet) con stepper de cantidad, selector de variantes y `maxQuantityPerItem`.
15. **`openOnAdd`** (apertura automática del drawer).
16. **Configuración** por `CartOptions` (§10) + `labels` localizables.
17. **SSR-safe** y sin dependencias de framework en `core`.
18. **Hooks de negocio** `canAdd`, `canCheckout(ctx)`, `onCheckout(ctx)` para que el consumidor aplique sus propias reglas.

**Queda fuera del MVP (no existe hoy o es negocio específico):**
- Impuestos/IVA reales, cupones, mínimo de pedido, límite de ítems distintos.
- Stock, SKU, carrito multi-usuario o sincronizado con servidor.
- Pasarela de pago, guardado del carrito en backend.
- Toasts / notificaciones (hoy no existen).
- Horario de apertura, modal "Restaurante Cerrado", formulario de entrega, mensajes de WhatsApp.

---

### Apéndice A — Textos UI del carrito (existentes)

| Texto | Ubicación |
|---|---|
| `Tu Carrito` / `Finalizar Pedido` | `sidebar-cart.component.html:21` |
| `¡Tu carrito está vacío!` | `:43` |
| `Parece que aún no has agregado nada delicioso a tu pedido.` | `:44` |
| `Explorar Menú` | `:45-47` |
| `Seleccionar zona de entrega` | `:85` |
| `Subtotal` / `Delivery` / `Total` | `:110,116,122` |
| `Vaciar Carrito` | `:134` |
| `Ver Carrito` / `Tu Pedido` | `cart-trigger.component.html:21,22` |
| `Disminuir cantidad` / `Aumentar cantidad` / `Eliminar producto` | `cart-item.component.html:16,22,38` |
| `Agregar` / `Elegir cantidades` / `Opciones disponibles` / `Desde` | `product-detail.html:114,56,48`, `price-range-card.ts:66` |
