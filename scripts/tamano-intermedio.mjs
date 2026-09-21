/**
 * Añade el tamaño de 550 px a las fotos ya procesadas.
 *
 * Una tarjeta ocupa unos 175 px en un teléfono. Con densidad 2 el navegador
 * pedía la de 400 px (36 kB) y con densidad 3 saltaba directo a la de 700
 * (100 kB), porque no había nada en medio. Ocho fotos visibles pasaban de
 * 261 kB a 751 kB solo por cambiar de teléfono.
 *
 * 175 × 3 = 525, así que 550 px es el escalón que faltaba.
 *
 * No rehace el recorte: parte del webp de 1000 px que ya existe, así que son
 * minutos en vez de media hora.
 *
 *   node scripts/tamano-intermedio.mjs                  # todas
 *   node scripts/tamano-intermedio.mjs --solo=ID1,ID2   # solo las fotos de esos productos
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DIR = path.resolve("public/img/productos");
const ANCHO = 550;

const soloArg = process.argv.find((a) => a.startsWith("--solo="));
const SOLO = soloArg ? soloArg.slice("--solo=".length).split(",") : null;

const esDeLosElegidos = (f) =>
  !SOLO || SOLO.some((id) => f.startsWith(`${id}-`) && /^[0-9]{2}[.]webp$/.test(f.slice(id.length + 1)));

const originales = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".webp") && !/-[0-9]{3}[.]webp$/.test(f))
  .filter(esDeLosElegidos);

let hechas = 0;
let peso = 0;

for (const archivo of originales) {
  const salida = archivo.replace(".webp", `-${ANCHO}.webp`);
  const destino = path.join(DIR, salida);

  await sharp(path.join(DIR, archivo))
    .resize(ANCHO, ANCHO)
    .webp({ quality: 80, effort: 5 })
    .toFile(destino);

  peso += fs.statSync(destino).size;
  hechas++;
  if (hechas % 20 === 0) console.log(`  ${hechas} / ${originales.length}`);
}

console.log(`\n${hechas} fotos a ${ANCHO} px`);
console.log(`media ${(peso / hechas / 1024).toFixed(0)} kB por foto`);
