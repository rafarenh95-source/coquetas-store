/**
 * Prepara las fotos del banner de la tienda (la cinta de fotos de la portada).
 *
 *   node scripts/preparar-banner.mjs <carpeta-con-las-fotos>
 *
 * Toma las fotos tal como vienen del diseño de la dueña (PNG de ~3 MB, ya en
 * proporción 12:5), las recorta exacto a 12:5 desde el centro y genera WebP en
 * 480 / 720 / 1080 / 1440 px de ancho en public/img/tienda/. El sello redondo
 * de la marca sale a 144 px (se muestra a 72 px como máximo).
 *
 * Para cambiar o agregar fotos: ponerlas en la carpeta con el nombre
 * banner-NN-computadora.png y agregarlas a FOTOS de abajo y a BannerTienda.astro.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const origen = process.argv[2];
if (!origen) {
  console.error("Uso: node scripts/preparar-banner.mjs <carpeta-con-las-fotos>");
  process.exit(1);
}

const FOTOS = ["01", "04", "05", "07"];
const ANCHOS = [480, 720, 1080, 1440];
const destino = "public/img/tienda";
fs.mkdirSync(destino, { recursive: true });

let total = 0;
for (const n of FOTOS) {
  const archivo = path.join(origen, "uploads", `banner-${n}-computadora.png`);
  for (const ancho of ANCHOS) {
    const alto = Math.round((ancho * 5) / 12);
    const salida = path.join(destino, `tienda-${n}-${ancho}.webp`);
    await sharp(archivo)
      .flatten({ background: "#fff8f4" }) // la fachada trae bordes transparentes
      .resize(ancho, alto, { fit: "cover", position: "centre" })
      .webp({ quality: 72, effort: 6 })
      .toFile(salida);
    const kb = fs.statSync(salida).size / 1024;
    total += kb;
    console.log(`${salida}  ${kb.toFixed(0)} KB`);
  }
}

const sello = path.join(destino, "sello-coquetas.webp");
await sharp(path.join(origen, "assets", "coquetas-badge.png"))
  .resize(144, 144, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 85, alphaQuality: 90, effort: 6 })
  .toFile(sello);
console.log(`${sello}  ${(fs.statSync(sello).size / 1024).toFixed(0)} KB`);
console.log(`Total fotos: ${total.toFixed(0)} KB`);
