/**
 * Coquetas — fotografía de producto.
 *
 * Dos pasos, y el segundo importa tanto como el primero:
 *
 * 1. RECORTE. El manual §13 exige fondo «crema o nude plano». Las fotos vienen
 *    sobre blanco puro. Se recorta el blanco a transparencia por relleno desde
 *    las esquinas y el fondo lo pone el CSS. No se repinta el fondo, porque eso
 *    teñiría también las tapas blancas y el manual prohíbe corregir el color del
 *    producto en edición.
 *
 * 2. NORMALIZACIÓN. Las fotos originales vienen a escalas distintas: un frasco
 *    de esmalte ocupa media imagen y un pote de exfoliante la llena. En una
 *    grilla eso se lee como desorden. Cada producto se reescala a una altura
 *    visual común y se apoya sobre una misma línea de base, así la fila entera
 *    descansa sobre el mismo suelo.
 *
 * 3. LIMPIEZA Y CENTRADO. El fondo de estudio no es 255 sino 250-254, y bajo el
 *    producto se aclara u oscurece en un halo. Sobre el crema eso se veía como
 *    un rectángulo y una elipse más claros, y la sombra pintada en la foto no era
 *    igual en todas: más larga hacia un lado en unas, un halo en otras, lo que
 *    descentraba al producto. Del fondo solo se conserva el suavizado del borde;
 *    el producto se centra por sí mismo, sin sombra; y se le pone una sola sombra
 *    de contacto, simétrica y suave (el manual pide luz suave, sin sombra dura).
 *
 *   node scripts/procesar-fotos.mjs                     # todas las fotos
 *   node scripts/procesar-fotos.mjs --solo=ID1,ID2      # solo esos productos: al agregar
 *                                                       # productos nuevos no se rehacen los ya publicados
 *   --sin-sombra                                        # sin la sombra de contacto
 *   --salida=carpeta                                    # para probar sin tocar public/img/productos
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ORIGEN = "C:/Users/conch/Downloads/imagenes editadas";
const ARG_SALIDA = process.argv.find((a) => a.startsWith("--salida="));
const DESTINO = ARG_SALIDA
  ? path.resolve(ARG_SALIDA.slice("--salida=".length))
  : path.resolve("public/img/productos");
const CON_SOMBRA = !process.argv.includes("--sin-sombra");
const PRODUCTOS = path.resolve("src/data/productos.json");

const LIENZO = 1000; // lado del cuadro final
const UMBRAL_SUAVE = 200; // el relleno se lleva también la sombra de contacto
const UMBRAL_ESTRICTO = 242; // solo blanco casi puro, para envases blancos

/* Encaje del producto dentro del lienzo. La línea de base es lo que hace que
   toda la fila se vea apoyada sobre el mismo suelo. */
const ALTO_MAXIMO = 0.78; // el producto ocupa como mucho el 78 % del alto
const ANCHO_MAXIMO = 0.8; // y el 80 % del ancho
const LINEA_BASE = 0.9; // su base queda al 90 % del alto del lienzo

/* Limpieza del borde: del fondo solo se conservan los píxeles pegados al
   producto, que son el suavizado de su contorno. */
const RADIO_BORDE = 2;

/* Las tapas blancas y los plásticos transparentes son casi tan claros como el
   fondo, y el relleno se les fuga por dentro: no se puede distinguir un pixel de
   tapa de uno de velo solo por el color. Lo que sí los separa es el valor: el
   velo del estudio está en 250-254, y las partes claras del producto, con su
   sombreado y sus bordes, por debajo de ese valor. Por eso, dentro de la caja
   del producto se conserva lo que baje de MUERTA; por encima, es fondo. */
const MUERTA = 249;
const HOLGURA_ARRIBA = 0.15; // margen sobre la caja para las tapas que el relleno se llevó

/* Sombra de contacto única, simétrica y suave, centrada bajo cada producto. */
const SOMBRA_OPACIDAD = 0.14;
const SOMBRA_ANCHO = 0.56; // semiancho, como fracción del ancho del producto
const SOMBRA_ALTO = 0.03; // semialto, como fracción del lienzo

/** Marca los píxeles a menos de `radio` del producto (lo que no es fondo). */
function cercaDelProducto(fondo, w, h, radio) {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (fondo[y * w + x]) continue;
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(w - 1, x + radio);
      for (let xx = x0; xx <= x1; xx++) tmp[y * w + xx] = 1;
    }
  }
  const cerca = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!tmp[y * w + x]) continue;
      const y0 = Math.max(0, y - radio);
      const y1 = Math.min(h - 1, y + radio);
      for (let yy = y0; yy <= y1; yy++) cerca[yy * w + x] = 1;
    }
  }
  return cerca;
}

/**
 * Extensión del producto por filas y por columnas. Un píxel de fondo está DENTRO
 * del producto si queda entre producto y producto tanto en su fila como en su
 * columna. Sirve para no vaciar los envases blancos: sobre fondo blanco el
 * relleno se les fuga por dentro y ese relleno hay que conservarlo, mientras que
 * el velo de fuera (los lados, arriba, abajo y entre objetos separados) sobra.
 */
function extensionDelProducto(fondo, w, h) {
  const filaMin = new Int32Array(h).fill(w);
  const filaMax = new Int32Array(h).fill(-1);
  const colMin = new Int32Array(w).fill(h);
  const colMax = new Int32Array(w).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (fondo[y * w + x]) continue;
      if (x < filaMin[y]) filaMin[y] = x;
      if (x > filaMax[y]) filaMax[y] = x;
      if (y < colMin[x]) colMin[x] = y;
      if (y > colMax[x]) colMax[x] = y;
    }
  }
  return { filaMin, filaMax, colMin, colMax };
}

/** Capa RGBA del lienzo entero con una elipse de sombra que se desvanece hacia los bordes. */
function capaSombra(centroX, anchoProducto, baseY) {
  const rx = Math.min(anchoProducto * SOMBRA_ANCHO, LIENZO * 0.47);
  const ry = LIENZO * SOMBRA_ALTO;
  const cy = baseY - ry * 0.2; // asienta justo bajo la base, sin separarse de ella
  const buf = Buffer.alloc(LIENZO * LIENZO * 4);

  const x0 = Math.max(0, Math.floor(centroX - rx));
  const x1 = Math.min(LIENZO - 1, Math.ceil(centroX + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(LIENZO - 1, Math.ceil(cy + ry));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - centroX) / rx;
      const dy = (y - cy) / ry;
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const i = (y * LIENZO + x) * 4;
      buf[i] = 43; // ciruela #2B0A26
      buf[i + 1] = 10;
      buf[i + 2] = 38;
      buf[i + 3] = Math.round(SOMBRA_OPACIDAD * (1 - r2) * (1 - r2) * 255);
    }
  }
  return buf;
}

function inundar(data, w, h, canales, umbral) {
  const fondo = new Uint8Array(w * h);
  const esFondo = (p) => {
    const i = p * canales;
    return Math.min(data[i], data[i + 1], data[i + 2]) >= umbral;
  };

  const cola = [];
  for (const inicio of [0, w - 1, (h - 1) * w, h * w - 1]) {
    if (esFondo(inicio) && !fondo[inicio]) {
      fondo[inicio] = 1;
      cola.push(inicio);
    }
  }

  while (cola.length) {
    const p = cola.pop();
    const x = p % w;
    const y = (p / w) | 0;

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (fondo[q] || !esFondo(q)) continue;
      fondo[q] = 1;
      cola.push(q);
    }
  }

  return fondo;
}

/**
 * El relleno suave se fuga hacia dentro cuando el envase es blanco. Se acepta
 * solo si la máscara es plausible: ni se come el centro ni se traga la imagen.
 */
function mascaraPlausible(fondo, w, h) {
  let n = 0;
  for (let i = 0; i < w * h; i++) n += fondo[i];
  const proporcion = n / (w * h);
  if (proporcion < 0.2 || proporcion > 0.93) return false;

  const cx = (w / 2) | 0;
  const cy = (h / 2) | 0;
  for (let y = cy - 20; y <= cy + 20; y += 10) {
    for (let x = cx - 20; x <= cx + 20; x += 10) {
      if (fondo[y * w + x]) return false;
    }
  }
  return true;
}

/** Caja del contenido, ignorando la sombra más tenue para no inflarla. */
function caja(data, w, h, canales, alfaMinimo = 40) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * canales + 3] < alfaMinimo) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  return x1 < 0 ? null : { x0, y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

async function procesar(rutaEntrada) {
  const { data, info } = await sharp(rutaEntrada)
    .resize(LIENZO, LIENZO, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels: c } = info;

  let fondo = inundar(data, w, h, c, UMBRAL_SUAVE);
  let modo = "suave";
  if (!mascaraPlausible(fondo, w, h)) {
    fondo = inundar(data, w, h, c, UMBRAL_ESTRICTO);
    modo = "estricto";
  }

  const rango = 255 - (modo === "suave" ? UMBRAL_SUAVE : UMBRAL_ESTRICTO);
  const cerca = cercaDelProducto(fondo, w, h, RADIO_BORDE);
  const { filaMin, filaMax, colMin, colMax } = extensionDelProducto(fondo, w, h);

  // caja del contenido duro (lo que el relleno no se llevó)
  let bx0 = w;
  let bx1 = -1;
  let by0 = -1;
  let by1 = -1;
  for (let y = 0; y < h; y++) {
    if (filaMax[y] < 0) continue;
    if (by0 < 0) by0 = y;
    by1 = y;
    if (filaMin[y] < bx0) bx0 = filaMin[y];
    if (filaMax[y] > bx1) bx1 = filaMax[y];
  }
  const holgura = Math.round((by1 - by0) * HOLGURA_ARRIBA);

  for (let p = 0; p < w * h; p++) {
    if (!fondo[p]) continue;
    const i = p * c;
    const x = p % w;
    const y = (p / w) | 0;
    const dentro = x >= filaMin[y] && x <= filaMax[y] && y >= colMin[x] && y <= colMax[x];
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    // parte clara del producto que el relleno se llevó (tapa blanca, plástico): dentro de la
    // caja, y por debajo del valor del velo. Nunca por debajo de la base: ahí solo hay sombra.
    const claraDelProducto =
      min < MUERTA && x >= bx0 - 4 && x <= bx1 + 4 && y >= by0 - holgura && y <= by1;
    if (!cerca[p] && !dentro && !claraDelProducto) {
      data[i + 3] = 0; // velo y halo del estudio, fuera del producto
      continue;
    }
    data[i + 3] = Math.max(0, Math.min(255, Math.round(((255 - min) / rango) * 255)));
  }

  const recortada = sharp(data, { raw: { width: w, height: h, channels: c } }).png();
  const cuadro = caja(data, w, h, c);
  if (!cuadro) return { buffer: await recortada.toBuffer(), modo, encaje: "sin contenido" };

  /* Escala común: el producto se ajusta al alto objetivo salvo que eso lo haga
     demasiado ancho, en cuyo caso manda el ancho. */
  const escala = Math.min(
    (LIENZO * ALTO_MAXIMO) / cuadro.alto,
    (LIENZO * ANCHO_MAXIMO) / cuadro.ancho
  );

  const anchoFinal = Math.max(1, Math.round(cuadro.ancho * escala));
  const altoFinal = Math.max(1, Math.round(cuadro.alto * escala));

  const producto = await recortada
    .extract({ left: cuadro.x0, top: cuadro.y0, width: cuadro.ancho, height: cuadro.alto })
    .resize(anchoFinal, altoFinal, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const izquierda = Math.round((LIENZO - anchoFinal) / 2);
  const arriba = Math.round(LIENZO * LINEA_BASE - altoFinal);

  const capas = [];
  if (CON_SOMBRA) {
    const sombra = capaSombra(LIENZO / 2, anchoFinal, Math.max(0, arriba) + altoFinal);
    capas.push({
      input: await sharp(sombra, { raw: { width: LIENZO, height: LIENZO, channels: 4 } }).png().toBuffer(),
      left: 0,
      top: 0,
    });
  }
  capas.push({ input: producto, left: izquierda, top: Math.max(0, arriba) });

  const compuesta = await sharp({
    create: { width: LIENZO, height: LIENZO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(capas)
    .png()
    .toBuffer();

  return { buffer: compuesta, modo, encaje: `${anchoFinal}×${altoFinal}` };
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });

  const productos = JSON.parse(fs.readFileSync(PRODUCTOS, "utf8"));
  const soloArg = process.argv.find((a) => a.startsWith("--solo="));
  const SOLO = soloArg ? new Set(soloArg.slice("--solo=".length).split(",")) : null;
  const revisar = [];
  const hechos = new Set();
  let n = 0;

  for (const p of productos) {
    if (SOLO && !SOLO.has(p.producto_id)) continue;
    for (const v of p.variantes) {
      const salida = path.basename(v.imagenes[0]);
      if (hechos.has(salida)) continue; // varias variantes pueden compartir una misma foto
      hechos.add(salida);
      const { buffer, modo } = await procesar(path.join(ORIGEN, v.origen[0]));

      await sharp(buffer).webp({ quality: 82, effort: 4 }).toFile(path.join(DESTINO, salida));

      /* Tamaños para srcset: la tarjeta pide ~270 px y la ficha ~600 px.
         Servir el original de 1000 px en una tarjeta es tirar ancho de banda. */
      for (const ancho of [400, 700]) {
        await sharp(buffer)
          .resize(ancho, ancho)
          .webp({ quality: 80, effort: 4 })
          .toFile(path.join(DESTINO, salida.replace(".webp", `-${ancho}.webp`)));
      }

      if (modo === "estricto") revisar.push(`${salida}  (${v.origen[0]})`);
      n++;
      if (n % 10 === 0) console.log(`  ${n} …`);
    }
  }

  const archivos = fs.readdirSync(DESTINO).filter((f) => f.endsWith(".webp"));
  const peso = archivos.reduce((s, f) => s + fs.statSync(path.join(DESTINO, f)).size, 0);

  console.log(`\n${n} productos · ${archivos.length} archivos (1000 / 700 / 400 px)`);
  console.log(`peso total    ${(peso / 1024 / 1024).toFixed(2)} MB`);
  console.log(`recorte estricto ${revisar.length} (envase blanco, revisar a ojo)`);
  for (const r of revisar) console.log(`  ${r}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
