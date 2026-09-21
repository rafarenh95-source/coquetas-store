/**
 * Coquetas — deja en blanco puro el fondo de una foto hecha con IA.
 *
 * El «blanco» que dibuja el modelo de imágenes no es 255: ronda 250-254. Sobre
 * blanco esa diferencia no se ve, pero `procesar-fotos.mjs` recorta el fondo a
 * transparencia según cuánto se aleja del blanco, y con envases blancos o
 * transparentes (donde tiene que usar el umbral estricto) esos 1-5 niveles se
 * vuelven un velo semitransparente: en la tarjeta, sobre el crema, aparece un
 * rectángulo apenas más claro alrededor del producto.
 *
 * Aquí se hace lo único que hace falta: todo lo que sea fondo -- lo conectado
 * con el borde de la foto y casi blanco -- pasa a 255. El producto no se toca ni
 * un píxel, porque el manual prohíbe corregir su color.
 *
 *   node scripts/blanquear-fondo.mjs "C:/ruta/foto.png" "C:/ruta/carpeta"
 *
 * Trabaja sobre el propio archivo (lo sobrescribe): úsalo sobre la copia que se
 * lleva a la carpeta de imágenes editadas, no sobre el original de la IA.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const UMBRAL = 246; // el fondo de la IA está en 250-254; la sombra y el borde del producto, por debajo

async function blanquear(ruta) {
  const { data, info } = await sharp(ruta)
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels: c } = info;
  const esFondo = (p) => {
    const i = p * c;
    return Math.min(data[i], data[i + 1], data[i + 2]) >= UMBRAL;
  };

  const visto = new Uint8Array(w * h);
  const cola = [];
  const sembrar = (p) => {
    if (!visto[p] && esFondo(p)) {
      visto[p] = 1;
      cola.push(p);
    }
  };

  for (let x = 0; x < w; x++) {
    sembrar(x);
    sembrar((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    sembrar(y * w);
    sembrar(y * w + w - 1);
  }

  while (cola.length) {
    const p = cola.pop();
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) sembrar(p - 1);
    if (x < w - 1) sembrar(p + 1);
    if (y > 0) sembrar(p - w);
    if (y < h - 1) sembrar(p + w);
  }

  let fondo = 0;
  let cambiados = 0;
  for (let p = 0; p < w * h; p++) {
    if (!visto[p]) continue;
    fondo++;
    const i = p * c;
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
      data[i] = data[i + 1] = data[i + 2] = 255;
      cambiados++;
    }
  }

  const png = await sharp(data, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
  fs.writeFileSync(ruta, png);
  return { proporcion: fondo / (w * h), cambiados };
}

const rutas = process.argv.slice(2).flatMap((a) =>
  fs.statSync(a).isDirectory()
    ? fs
        .readdirSync(a)
        .filter((f) => f.toLowerCase().endsWith(".png"))
        .map((f) => path.join(a, f))
    : [a]
);

if (!rutas.length) {
  console.error("Uso: node scripts/blanquear-fondo.mjs <foto.png | carpeta> ...");
  process.exit(1);
}

for (const r of rutas) {
  const { proporcion, cambiados } = await blanquear(r);
  const aviso = proporcion < 0.15 || proporcion > 0.95 ? "   ← revisar: proporción de fondo rara" : "";
  console.log(
    `${path.basename(r).padEnd(40)} fondo ${(proporcion * 100).toFixed(0)} %  · ${cambiados} píxeles a blanco puro${aviso}`
  );
}
