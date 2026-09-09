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
 *   node scripts/procesar-fotos.mjs
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ORIGEN = "C:/Users/conch/Downloads/imagenes editadas";
const DESTINO = path.resolve("public/img/productos");
const PRODUCTOS = path.resolve("src/data/productos.json");

const LIENZO = 1000; // lado del cuadro final
const UMBRAL_SUAVE = 200; // el relleno se lleva también la sombra de contacto
const UMBRAL_ESTRICTO = 242; // solo blanco casi puro, para envases blancos

/* Encaje del producto dentro del lienzo. La línea de base es lo que hace que
   toda la fila se vea apoyada sobre el mismo suelo. */
const ALTO_MAXIMO = 0.78; // el producto ocupa como mucho el 78 % del alto
const ANCHO_MAXIMO = 0.8; // y el 80 % del ancho
const LINEA_BASE = 0.9; // su base queda al 90 % del alto del lienzo

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
  for (let p = 0; p < w * h; p++) {
    if (!fondo[p]) continue;
    const i = p * c;
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
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

  const compuesta = await sharp({
    create: { width: LIENZO, height: LIENZO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: producto, left: izquierda, top: Math.max(0, arriba) }])
    .png()
    .toBuffer();

  return { buffer: compuesta, modo, encaje: `${anchoFinal}×${altoFinal}` };
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });

  const productos = JSON.parse(fs.readFileSync(PRODUCTOS, "utf8"));
  const revisar = [];
  let n = 0;

  for (const p of productos) {
    for (const v of p.variantes) {
      const salida = path.basename(v.imagenes[0]);
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
