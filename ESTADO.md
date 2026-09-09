# Estado del proyecto — Coquetas Store

Última sesión: 9 de septiembre de 2026.

## Qué es esto

Catálogo web curado de Coquetas Store (San Francisco, estado Zulia). Astro estático +
Tailwind 4, sin backend. 35 productos, pedidos por WhatsApp.

**Sitio terminado y funcional.** Falta publicarlo.

## Arrancar

```bash
npm run dev        # http://localhost:4321
npm run build      # genera dist/
```

| Script | Para qué |
|---|---|
| `npm run datos` | Regenera `src/data/productos.json` desde las fotos y `textos.json` |
| `npm run fotos` | Recorta el fondo blanco y normaliza escala y línea de base (~25 min) |
| `npm run logos` | Versiones web del logo |
| `npm run fuentes` | Verifica cobertura del castellano y subsetea a woff2 |
| `npm run contraste` | Falla si alguna pareja de color baja de 4.5:1 |
| `npm run qa` | QA completo: datos, archivos, las 36 páginas, accesibilidad y flujo de pedido |

El QA del sitio necesita el build servido:

```bash
npm run build && npx astro preview --port 4322 &
npm run qa
```

Las fotos originales viven fuera del repo, en `C:/Users/conch/Downloads/imagenes editadas`.

## Decisiones tomadas

- **Púrpura es `#7A0177`**, no `#740177`. El RGB del manual (122·1·119) lo confirma.
- **Categorías: Uñas · Cuidado facial · Cuerpo y spa.** No hay maquillaje ni cabello en el set.
- **Precio en bolívares = divisa × 1,35.** Se guarda redondeado al céntimo en
  `precio_referencia` y ese es el único número que usa todo el sitio.
- **Tasa BCV** desde `ve.dolarapi.com` en el cliente (tiene CORS). Cascada: API →
  localStorage → respaldo del build. No hace falta función serverless.
- **Portada sin foto de producto.** El LCP es texto: 544 ms en móvil.
- **Fotos recortadas a transparencia**, escaladas a altura común y apoyadas en una misma
  línea de base.

## Dónde me aparté del manual, a propósito

1. **Fotos centradas sobre una línea común.** El manual §13 pide el producto «apoyado a un
   tercio». Esa regla es para fotografía editorial; en una grilla de 35 productos las
   posiciones distintas se leen como descuido. Decisión del usuario.
2. **Mayúsculas en etiquetas y botones.** El propio manual las usa en todas sus páginas y su
   tabla asigna tracking 0.16em a las etiquetas.

Todo lo demás lo comprueba solo `src/scripts/auditor-marca.js`, que corre en desarrollo y
avisa en consola si aparece rosa u oro como texto, blanco puro como superficie, Didot bajo
24 px, una tercera tipografía, un degradado, o más de un filete/franja/trama por vista.

## Datos con truco

- **Los nombres de archivo mienten.** En el exfoliante, `MANGO.png` es passion fruit,
  `PARCHITA.png` es mango y `MELON.png` es watermelon. Ya está corregido leyendo las
  etiquetas. Si llegan fotos nuevas, verificar contra el envase, no contra el nombre.
- **Polygel y jelly builder no muestran el color del gel:** el envase es negro o blanco. Por
  eso usan chips con el número (`tipo_variante: "codigo"`), no círculos de color.
- **Los tonos se llaman «Tono 6 · Rosa».** La familia sale medida del pixel dominante de la
  foto. Se pueden renombrar a mano en `scripts/build-productos.mjs`.
- 4 variantes quedaron marcadas `swatch_revisar`: colores muy oscuros o muy claros donde el
  muestreo pudo haber tomado la etiqueta en vez del producto.

## Pendiente

1. **Que la dueña revise los 35 textos** de `src/data/textos.json`. Están marcados como
   borrador. No contienen duraciones, rendimientos en número de usos ni certificaciones,
   porque eso solo lo puede confirmar la tienda.
2. **Nombres reales de los tonos**, si en la tienda los llaman de otra forma.
3. **10 fotos que faltan:** polygel (7) y jelly builder (3) aplicados sobre un tip. Son los
   únicos productos donde la clienta compra un color a ciegas.
4. **Publicar en Vercel.** Es estático, sube tal cual.
5. **Decisión de público, abierta.** 21 de los 35 productos son de uso profesional. El
   catálogo le habla más a la manicurista que a Rebeca. O se suma producto de consumidora,
   o se ajusta el titular al público real.

## Revisión del 9 de septiembre

`npm run qa` pasa limpio: 36 páginas, 0 errores de consola, 0 recursos rotos, 0 enlaces
rotos, 0 violaciones de axe (WCAG 2.1 AA), un solo h1 por página, todas las imágenes con
alt, JSON-LD válido y sin scroll horizontal en 390 px.

Flujo de pedido probado de punta a punta: pestañas de categoría, enlace profundo
`?categoria=`, selector de tono, persistencia de la bolsa entre páginas, subtotales,
mensaje de WhatsApp con el tono, estado vacío, Escape y foco atrapado.

Rendimiento de una ficha en móvil: 347 kB, LCP 284 ms, CLS 0.0026. Con
`prefers-reduced-motion`, cero elementos con transición.

### Primera vuelta: datos y estructura

1. **La espuma limpiadora tenía sus tres variantes sin nombre.** Salían tres chips vacíos y
   el pedido no decía cuál. Al mirar los envases apareció además que **no son la misma
   presentación**: la etiqueta rosa trae 150 ml y la negra y la crema 100 ml, todas a $3.
   Conviene que la dueña confirme que ese precio único es correcto.
2. **El panel de la bolsa se anunciaba como modal pero no atrapaba el foco:** el tabulador
   seguía paseándose por la página de detrás. Resuelto marcando el resto del documento como
   `inert` mientras está abierto.
3. El chip «Uso profesional» se estiraba a todo el ancho de la columna en la ficha.
4. El menú se partía en dos líneas en móvil. Por debajo de tablet queda solo la marca y la
   bolsa; los enlaces son anclas de la portada y la ficha ya tiene miga de pan.

El generador ahora **se detiene** si un producto con varias variantes tiene tonos repetidos
o vacíos, para que el fallo 1 no pueda repetirse en silencio.

### Segunda vuelta: teclado y robustez

Nada de esto lo detecta axe: son problemas de orden de foco y de código, no de marcado.

5. **El panel de la bolsa seguía en el orden de tabulación estando cerrado.** Estaba fuera de
   pantalla, pero al tabular se aterrizaba en «Cerrar la bolsa» sin ver nada. Ahora nace
   `inert` y solo deja de serlo al abrirse.
6. **El selector de tonos exponía 14 paradas de tabulador.** Un radiogroup expone una y se
   recorre con flechas. Añadido roving tabindex, más Inicio y Fin. Lo mismo en las cuatro
   pestañas de categoría, que exponían cuatro.
7. **Cambiar de categoría no se anunciaba.** Quien usa lector de pantalla pulsaba una pestaña
   y no sabía si había pasado algo. Ahora se anuncia «27 piezas en Uñas» y el panel actualiza
   su `aria-labelledby`.
8. **No había enlace para saltar el catálogo.** En la portada hay 35 tarjetas entre el menú y
   el pie.
9. **No existía página de error.** Quien escribía mal una dirección veía la pantalla genérica
   del servidor. Ahora hay una 404 con la marca y la salida a la vista.
10. **El carrito construía sus filas con `innerHTML`.** Un «&» o un «<» en el nombre de un
    producto habría roto el marcado. Reescrito con nodos y `textContent`; de paso, los
    botones ± ahora dicen de qué producto son.

Todas estas comprobaciones quedaron incorporadas a `npm run qa`, incluida una que verifica en
el navegador que ningún importe visible se quede sin su símbolo de moneda.

## Cosas que conviene no repetir

- `/sistema` es andamiaje interno, no el sitio. En producción redirige a la portada con
  `noindex`. No enseñarla como si fuera el catálogo.
- **`String.replace()` interpreta `$$`, `$&` y `$1` en la cadena de sustitución.** Eso se
  comió tres símbolos de dólar en este proyecto antes de que se viera la causa: `$${x}`
  acababa como `${x}` y `$$eval` como `$eval`. Al editar código con scripts, pasar una
  **función** de reemplazo: `s.replace(antes, () => despues)`. Nunca la cadena directa.
- Los importes visibles se comprueban en el navegador (`qa-sitio.mjs`), no leyendo el
  código, precisamente por lo anterior.
- La base de datos de `ui-ux-pro-max` no está instalada en esta máquina (falta Python y las
  carpetas `scripts/` y `references/`). Su SKILL.md carga, pero no se puede consultar.
