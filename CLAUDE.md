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
   Con el mismo servidor, `node scripts/qa-movil.mjs` — debe decir «Móvil: sin avisos» (revisa
   320/360/375/390/412/430/768 px: desbordes, zonas táctiles < 44 px, textos cortados, campos
   < 16 px). `--capturas=<carpeta>` guarda capturas de cada pantalla en cada ancho.
   Y `node scripts/qa-cantidad.mjs` — flujo del selector de cantidad y la bolsa; debe decir
   «Cantidad: sin fallos». `node scripts/qa-carrusel.mjs` (tarda ~2 min) — «Carrusel: sin fallos».
   `node scripts/qa-menu.mjs` — «Menú: sin fallos». `node scripts/qa-banner.mjs` — «Banner: sin fallos».
   (Lighthouse tarda o no termina por la cinta de fotos que nunca se detiene: usar
   `--max-wait-for-load=25000`.)
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
- Stock: opcional, `stock` en el producto o en la variante (hoy ningún producto lo trae). Si está,
  es el tope del selector de cantidad; si no, el tope es 99 (`TOPE_SIN_STOCK` en `cantidad.js`).
  Para cargarlo hay que pasarlo también por `build-productos.mjs`.
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
- Cantidad: selector «− número +» (`Cantidad.astro` + `scripts/cantidad.js`, clases compartidas en
  `cantidad-estilos.js`) en tarjeta, ficha y cada fila de la bolsa. Agregar suma la cantidad elegida
  y ya **no abre la bolsa**: muestra un aviso «N unidades agregadas» con botón «Ver bolsa».
- Carruseles de la portada (`scripts/carrusel.js`, sin librerías; uno por cada `[data-carrusel]`):
  scroll-snap nativo, avanzan solos de a una tarjeta con **1,3 s de pausa** (`PAUSA`, decisión de la
  dueña) y vuelta sin fin (copias `[data-copia]` ocultas al lector). Se pausan al tocar / ratón
  encima / foco de teclado / botón de pausa (`PausaCarrusel.astro`, obligatorio, WCAG 2.2.2); sin
  avance con movimiento reducido. Flechas redondas a los lados, a la altura de las fotos
  (`FlechaCarrusel.astro`). Categorías arranca 650 ms después (`data-desfase`).
- Preguntas frecuentes en el pie (`PieDePagina.astro`, textos en `src/data/preguntas.json`; salen
  también como FAQPage en la portada). Todas empiezan cerradas (decisión de la dueña). «¿Cómo compro?» (id `como-comprar`) es la primera;
  los enlaces «Cómo comprar» la abren.
- Encabezado: logo + WhatsApp (desde 360 px) + bolsa + menú ☰. El menú (`Menu.astro`, `<dialog>`
  nativo que entra desde la derecha) lleva: ver catálogo, las 5 categorías, preguntas frecuentes
  (ahí dentro está «¿Cómo compro?», no suelto), dónde estamos, precios al mayor, TikTok y pedir por WhatsApp (aprobado por la dueña).
  Mapa y TikTok ya no están en el encabezado. Sin «Cómo comprar» bajo el título.
- Banner de la tienda (`BannerTienda.astro` + `scripts/desfile.js`), en lugar del título «Catálogo»
  (el H1 queda solo para lectores de pantalla): diseño de la dueña en Claude Design. Cinta continua
  de 4 fotos del local (12:5, esquinas redondeadas, filete rosa, degradado púrpura, sello de la
  marca sobre círculo papel) a 40 px/s, animación CSS. Se detiene con ratón encima, dedo apoyado,
  fuera de pantalla y botón de pausa; con movimiento reducido queda una fila deslizable. Fotos en
  `public/img/tienda/` generadas con `node scripts/preparar-banner.mjs <carpeta del zip del diseño>`.
- Portada: banner, buscador, luego el carrusel «Favoritos de Coquetas» (solo la foto; lleva a la ficha) (lista `MUESTRA` en
  `Catalogo.astro`: esmalte semipermanente, brillo color, exfoliante, veloterapia; NO usa la
  bandera `destacado`, que decide la foto de cada categoría), luego el de categorías. Al tocar una
  categoría se abre su grilla. Sin tarjeta «Todo» (la dueña la quitó); `?categoria=todo` y el
  buscador siguen funcionando. `scripts/fila.js` queda sin uso (fila sin avance automático).
- Móvil: todo lo tocable mide ≥ 44 × 44 px; cuerpo de texto 16 px; zonas seguras (notch y barra
  de gestos) con `env(safe-area-inset-*)` y `viewport-fit=cover`. Los botones del encabezado
  llevan texto solo desde 1024 px y los enlaces «Catálogo / Cómo comprar» desde 1280 px: si no,
  el encabezado se sale de la pantalla. La vista inicial del catálogo (categorías o grilla) se
  decide con un script en línea antes de pintar, para que `?categoria=` no haga saltar la página.

## Pendientes conocidos

- Usuario de Instagram sin cargar (`tienda.json` → `instagram: null`); dirección vacía.
- Textos de los productos nuevos son borrador: la dueña puede corregirlos.
- Algunas fotos vienen de imágenes del proveedor (gel de sábila, almohada lashista, lápiz de
  visagismo de 1,50 $, pipetas): reemplazar si la dueña manda fotos reales.
