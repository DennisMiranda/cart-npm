/** Tipos mínimos para importar `.astro` desde TypeScript (el compilador de Astro los resuelve igual). */
declare module '*.astro' {
  const Component: (props: Record<string, unknown>) => string;
  export default Component;
}
