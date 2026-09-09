/**
 * Coquetas — versiones web del logo.
 *
 * Solo existen las cuatro versiones positivas del manual §6. La versión negativa
 * y la monocroma están [POR DEFINIR] y el manual dice explícitamente que no se
 * dibujan de memoria, así que aquí no se inventa ninguna.
 *
 * Los mínimos digitales del manual §7 se respetan en el componente Logo.astro.
 *
 *   node scripts/preparar-logos.mjs
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ORIGEN = "C:/Users/conch/Downloads/COQUETAS";
const DESTINO = path.resolve("public/img/marca");

const VERSIONES = [
  { entrada: "horizontal vectorizado.png", salida: "coquetas-horizontal.webp", ancho: 720, minimo: 180 },
  { entrada: "vertical vectorizado.png", salida: "coquetas-vertical.webp", ancho: 480, minimo: 120 },
  { entrada: "isotipo vectorizado.png", salida: "coquetas-isotipo.webp", ancho: 240, minimo: 40 },
];

fs.mkdirSync(DESTINO, { recursive: true });

for (const v of VERSIONES) {
  const salida = path.join(DESTINO, v.salida);

  const info = await sharp(path.join(ORIGEN, v.entrada))
    .trim() // quita el aire sobrante del PNG; el resguardo lo pone el CSS
    .resize({ width: v.ancho, withoutEnlargement: true })
    .webp({ quality: 92, effort: 6 })
    .toFile(salida);

  const kb = (fs.statSync(salida).size / 1024).toFixed(1);
  console.log(
    `${v.salida.padEnd(28)} ${String(info.width + "×" + info.height).padStart(10)}  ${String(kb + " kB").padStart(9)}   mínimo en pantalla ${v.minimo} px`
  );
}
