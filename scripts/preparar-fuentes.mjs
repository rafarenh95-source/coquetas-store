/**
 * Coquetas — verificación y empaquetado de las dos familias de marca.
 *
 * 1. Comprueba que cada fuente cubre el castellano completo. GFS Didot es una
 *    tipografía griega: si le falta la Ñ, la palabra UÑAS —que es una categoría
 *    del catálogo— saldría rota en el titular.
 * 2. Subsetea a Latin y exporta woff2.
 *
 *   node scripts/preparar-fuentes.mjs
 */

import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import subsetFont from "subset-font";

const TMP = path.resolve("tmp-fonts");
const DESTINO = path.resolve("public/fuentes");

const FUENTES = [
  { archivo: "didot/GFSDidot-Regular.ttf", salida: "gfs-didot-400.woff2", familia: "GFS Didot", peso: 400 },
  { archivo: "montserrat/static/Montserrat-Light.ttf", salida: "montserrat-300.woff2", familia: "Montserrat", peso: 300 },
  { archivo: "montserrat/static/Montserrat-Regular.ttf", salida: "montserrat-400.woff2", familia: "Montserrat", peso: 400 },
  { archivo: "montserrat/static/Montserrat-SemiBold.ttf", salida: "montserrat-600.woff2", familia: "Montserrat", peso: 600 },
];

/* Todo lo que el sitio puede llegar a escribir en castellano, más los signos
   que usa la marca (comillas angulares, medio guion, punto medio del filete). */
const CASTELLANO =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "abcdefghijklmnopqrstuvwxyz" +
  "0123456789" +
  "ÁÉÍÓÚÜÑáéíóúüñ" +
  "¿?¡!.,;:·—–-()[]{}/\\|&%$#@*+=<>\"'«»“”‘’…" +
  "  ";

const CRITICOS = [..."ÑñÁÉÍÓÚÜáéíóúü¿¡«»°"];

let fallo = false;

fs.mkdirSync(DESTINO, { recursive: true });

for (const f of FUENTES) {
  const ruta = path.join(TMP, f.archivo);
  const buffer = fs.readFileSync(ruta);

  /* ── cobertura ──────────────────────────────────────────────────────── */
  const fuente = opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );

  const faltan = CRITICOS.filter((c) => {
    const glifo = fuente.charToGlyph(c);
    return !glifo || glifo.index === 0;
  });

  /* ── subset ─────────────────────────────────────────────────────────── */
  const woff2 = await subsetFont(buffer, CASTELLANO, { targetFormat: "woff2" });
  fs.writeFileSync(path.join(DESTINO, f.salida), woff2);

  const antes = (buffer.length / 1024).toFixed(0);
  const despues = (woff2.length / 1024).toFixed(1);
  const estado = faltan.length ? `FALTAN ${faltan.join(" ")}` : "castellano completo";

  if (faltan.length) fallo = true;

  console.log(
    `${f.salida.padEnd(24)} ${String(antes + " kB").padStart(8)} → ${String(despues + " kB").padStart(8)}   ${estado}`
  );
}

if (fallo) {
  console.log("\nAlguna fuente no cubre el castellano. No se puede usar tal cual.");
  process.exit(1);
}
