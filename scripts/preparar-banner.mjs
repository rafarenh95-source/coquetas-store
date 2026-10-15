/**
 * Prepara las fotos del banner de la tienda (la cinta de fotos de la portada).
 *
 *   node scripts/preparar-banner.mjs <carpeta-del-zip> [<otra-carpeta>…]
 *
 * Cada carpeta es un .zip de Claude Design descomprimido (diseños de la dueña):
 *
 *   uploads/banner-NN-computadora.png  → 12:5, para pantallas desde 640 px
 *       public/img/tienda/tienda-NN-{480,720,1080,1440}.webp
 *   uploads/banner-NN-telefono.png     → cuadradas, para teléfonos
 *       public/img/tienda/tienda-movil-NN-{360,540,720,1080}.webp
 *   assets/coquetas-badge.png          → sello de la marca, 144 px
 *       public/img/tienda/sello-coquetas.webp
 *
 * Se procesa lo que haya en cada carpeta. Recorte desde el centro a la
 * proporción exacta, WebP calidad 72.
 *
 * Para cambiar o agregar fotos: ponerlas con esos nombres y actualizar las
 * listas de BannerTienda.astro.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const carpetas = process.argv.slice(2);
if (!carpetas.length) {
  console.error("Uso: node scripts/preparar-banner.mjs <carpeta-del-zip> [<otra-carpeta>…]");
  process.exit(1);
}

const destino = "public/img/tienda";
fs.mkdirSync(destino, { recursive: true });

const TIPOS = [
  { sufijo: "computadora", prefijo: "tienda", anchos: [480, 720, 1080, 1440], proporcion: 5 / 12 },
  { sufijo: "telefono", prefijo: "tienda-movil", anchos: [360, 540, 720, 1080], proporcion: 1 },
];

let total = 0;
for (const carpeta of carpetas) {
  const uploads = path.join(carpeta, "uploads");
  const archivos = fs.existsSync(uploads) ? fs.readdirSync(uploads) : [];

  for (const tipo of TIPOS) {
    for (const archivo of archivos) {
      const m = archivo.match(new RegExp(`^banner-(\\d+)-${tipo.sufijo}\\.png$`));
      if (!m) continue;
      for (const ancho of tipo.anchos) {
        const alto = Math.round(ancho * tipo.proporcion);
        const salida = path.join(destino, `${tipo.prefijo}-${m[1]}-${ancho}.webp`);
        await sharp(path.join(uploads, archivo))
          .flatten({ background: "#fff8f4" }) // la fachada trae bordes transparentes
          .resize(ancho, alto, { fit: "cover", position: "centre" })
          .webp({ quality: 72, effort: 6 })
          .toFile(salida);
        const kb = fs.statSync(salida).size / 1024;
        total += kb;
        console.log(`${salida}  ${kb.toFixed(0)} KB`);
      }
    }
  }

  const insignia = path.join(carpeta, "assets", "coquetas-badge.png");
  if (fs.existsSync(insignia)) {
    const sello = path.join(destino, "sello-coquetas.webp");
    await sharp(insignia)
      .resize(144, 144, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, alphaQuality: 90, effort: 6 })
      .toFile(sello);
    console.log(`${sello}  ${(fs.statSync(sello).size / 1024).toFixed(0)} KB`);
  }
}
console.log(`Total fotos: ${total.toFixed(0)} KB`);
