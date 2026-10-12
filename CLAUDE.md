# Coquetas Store — catálogo web

Catálogo de Coquetas Store (tienda de belleza en San Francisco, estado Zulia, Venezuela).
Astro 5 estático + Tailwind 4. Se publica solo en Vercel al hacer push a `main`.

- Sitio en vivo (dominio real): https://www.coquetastore.website
  (`coquetas-store.vercel.app` es el subdominio viejo y ya no responde: verificar siempre en el dominio real)
- Repo: https://github.com/rafarenh95-source/coquetas-store
- La dueña habla español, no es técnica: explicar en lenguaje simple, sin jerga.

## Cómo se trabaja (cada cambio)

1. Editar.
2. `npx astro build`
3. `node scripts/qa-datos.mjs` — sin fallos (los avisos «sin rendimiento» son conocidos).
4. Levantar `npx astro preview --port 4322` (en segundo plano) y correr `node scripts/qa-sitio.mjs`
   — debe decir «Sitio: sin fallos» y 0 violaciones axe.
5. Revisar visualmente con Playwright (`playwright-core`, `channel: "msedge"`) en 390 px y 1280 px.
   Los scripts que importan `playwright-core` o `sharp` tienen que estar dentro de la carpeta del
   proyecto para que Node los encuentre.
6. `git add` solo los archivos esperados, commit en español, `git push origin main`.
7. Verificar en vivo en www.coquetastore.website con `?n=<aleatorio>` (que el cambio concreto esté,
   no un texto que ya existía). Si tras varios minutos no aparece, un `git commit --allow-empty` +
   push vuelve a disparar Vercel.

## Datos y categorías

- La fuente de verdad es `scripts/build-productos.mjs` (lista `CATALOGO`) + `src/data/textos.json`.
  `node scripts/build-productos.mjs` regenera `src/data/productos.json`. No editar `productos.json`
  a mano: la próxima regeneración lo pisaría.
- Al agregar productos: **nunca tocar ni quitar los ya publicados**. Después de regenerar, comparar
  contra `git show HEAD:src/data/productos.json` y confirmar que los existentes no cambiaron.
- Precios: `precio_divisa` en dólares; el precio en bolívares lleva un recargo de 1,35 y se calcula
  con la tasa BCV en el navegador. La leyenda legal de la tasa BCV en el pie es obligatoria (Ley de
  Precios Justos): no quitarla.
- Categorías (en este orden): `unas` Uñas · `herramientas` Herramientas · `pestanas` Pestañas y cejas
  · `facial` Cuidado facial · `cuerpo` Cuerpo y spa. Están repetidas en: `Catalogo.astro`
  (CATEGORIAS_BASE y los dos NOMBRES), `producto/[id].astro`, `Icono.astro`, `build-productos.mjs`
  (PESO_CATEGORIA e informe), `qa-datos.mjs` y `qa-sitio.mjs`. Cambiar una categoría = tocar todos.
- Foto de cada tarjeta de categoría: `FOTO_DE_CATEGORIA` en `Catalogo.astro`.
- Variantes de color con foto compartida o color puesto a mano: `swatch_hex` en la variante.
- Fotos editadas (con IA o por la dueña) llevan `foto_editada: true`: la ficha dice «Foto editada…»
  en vez de «sin retoque de color».

## Fotos

- Originales en `C:/Users/conch/Downloads/imagenes editadas` (fondo blanco).
- `node scripts/blanquear-fondo.mjs <archivos>` deja el fondo en blanco puro (para fotos nuevas).
- `node scripts/procesar-fotos.mjs --solo=ID1,ID2` recorta, centra, quita el reflejo blanco del suelo,
  sin sombra, y genera 1000/700/400 px; después `node scripts/tamano-intermedio.mjs --solo=...` (550 px).
  Usar `--solo` para no rehacer las fotos ya publicadas.
- Decisiones de la dueña: fondo **crema** (no blanco), productos **centrados**, **sin sombra** y sin
  franja blanca debajo.
- `scripts/editar-fotos-ia.mjs` pasa fotos crudas a foto de catálogo con OpenAI (`gpt-image-2`).
  La clave va en `.env` (ignorado por Git) y hoy está vacía: **no usar la API sin permiso de la dueña**
  (le cuesta dinero). Nunca escribir la clave en ningún archivo que se suba.

## Diseño

- Manual de marca: `manual_de_identidad_visual_coquetas.md`. Colores crema, papel, ciruela, púrpura,
  magenta (magenta solo para la acción principal). GFS Didot solo en títulos ≥ 24 px.
- Portada: buscador + tarjetas de categoría; al tocar una se abre su grilla. Sin productos destacados
  en la portada (la dueña los quitó).

## Pendientes conocidos

- Usuario de Instagram sin cargar (`tienda.json` → `instagram: null`); dirección y horario vacíos.
- Textos de los productos nuevos son borrador: la dueña puede corregirlos.
- Algunas fotos vienen de imágenes del proveedor (gel de sábila, almohada lashista, lápiz de
  visagismo de 1,50 $, pipetas): reemplazar si la dueña manda fotos reales.
