# @tinycode/astro-cart

Carrito de ecommerce funcional para **Astro**: drawer lateral, trigger flotante con contador, selector de variantes, zonas de entrega, persistencia en `localStorage` y theming completo por **CSS variables**.

- Núcleo TypeScript sin framework (signals-like `subscribe`) + componentes `.astro`.
- SSR-safe, sin islas `client:*` obligatorias, animaciones propias (sin Tailwind).
- Basado en la auditoría de un carrito real (reglas de deduplicación, límites, precio congelado…).

## Instalación

```bash
npm install @tinycode/astro-cart
```

## Uso mínimo

```astro
---
import '@tinycode/astro-cart/styles.css';  // en tu Layout
import { CartDrawer, CartTrigger, ProductCard } from '@tinycode/astro-cart/components';
---

<ProductCard product={{ id: 1, name: 'Pollo a la brasa', price: 35 }} />
<CartDrawer />
<CartTrigger />
```

## Colores

```css
@import '@tinycode/astro-cart/styles.css';

:root {
  --cart-primary: #7c2d12;
  --cart-secondary: #1c1917;
}
```

## Documentación

**[MANUAL.md](./MANUAL.md)** — componentes y props, API del core (`cart.addItem`, eventos, etc.), tabla completa de variables CSS, persistencia y accesibilidad.

`demo/` contiene un proyecto Astro completo de ejemplo:

```bash
cd demo && npm install && npm run dev
```

## Licencia

MIT
