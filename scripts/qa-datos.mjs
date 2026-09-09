/**
 * QA de datos y archivos. No abre navegador: comprueba que lo que el sitio dice
 * que existe, existe de verdad.
 *
 *   node scripts/qa-datos.mjs
 */

import fs from "node:fs";
import path from "node:path";

const productos = JSON.parse(fs.readFileSync("src/data/productos.json", "utf8"));
const textos = JSON.parse(fs.readFileSync("src/data/textos.json", "utf8"));
const tienda = JSON.parse(fs.readFileSync("src/data/tienda.json", "utf8"));

const fallos = [];
const avisos = [];
const fallo = (m) => fallos.push(m);
const aviso = (m) => avisos.push(m);

/* ── 1 · imágenes ─────────────────────────────────────────────────────── */

let imagenes = 0;
let faltantes = 0;

for (const p of productos) {
  for (const v of p.variantes) {
    for (const img of v.imagenes) {
      for (const variante of [img, img.replace(".webp", "-400.webp"), img.replace(".webp", "-700.webp")]) {
        imagenes++;
        if (!fs.existsSync(path.join("public", variante))) {
          faltantes++;
          fallo(`falta la imagen ${variante} (${p.producto_id})`);
        }
      }
    }
  }
}

/* ── 2 · integridad del catálogo ──────────────────────────────────────── */

const ids = new Set();
const RECARGO = 1.35;

for (const p of productos) {
  if (ids.has(p.producto_id)) fallo(`producto_id repetido: ${p.producto_id}`);
  ids.add(p.producto_id);

  if (!p.nombre) fallo(`${p.producto_id}: sin nombre`);
  if (!(p.precio_divisa > 0)) fallo(`${p.producto_id}: precio_divisa inválido`);

  const esperado = Math.round(p.precio_divisa * RECARGO * 100) / 100;
  if (p.precio_referencia !== esperado) {
    fallo(`${p.producto_id}: precio_referencia ${p.precio_referencia}, esperado ${esperado}`);
  }

  if (!p.descripcion) fallo(`${p.producto_id}: sin descripción`);
  if (!p.modo_uso) fallo(`${p.producto_id}: sin modo de uso`);
  if (!p.rendimiento) aviso(`${p.producto_id}: sin rendimiento`);

  if (!p.variantes.length) fallo(`${p.producto_id}: sin variantes`);

  const tonos = p.variantes.map((v) => v.tono);
  if (p.variantes.length > 1 && new Set(tonos).size !== tonos.length) {
    fallo(`${p.producto_id}: tonos repetidos — el pedido saldría ambiguo`);
  }

  if (p.tipo_variante === "color") {
    for (const v of p.variantes) {
      if (!v.swatch_hex && !v.swatch_revisar) {
        fallo(`${p.producto_id}/${v.tono}: swatch de color vacío sin marcar para revisión`);
      }
    }
  }

  if (p.variantes.length > 1 && !p.tipo_variante) {
    fallo(`${p.producto_id}: tiene ${p.variantes.length} variantes pero tipo_variante es null`);
  }

  if (!["unas", "facial", "cuerpo"].includes(p.categoria)) {
    fallo(`${p.producto_id}: categoría desconocida "${p.categoria}"`);
  }
}

/* ── 3 · textos sin producto y al revés ───────────────────────────────── */

for (const clave of Object.keys(textos)) {
  if (clave.startsWith("_")) continue;
  if (!ids.has(clave)) aviso(`textos.json tiene "${clave}", que ya no existe en el catálogo`);
}

/* ── 4 · configuración de la tienda ───────────────────────────────────── */

if (!tienda.whatsapp) fallo("falta el número de WhatsApp");
else if (!/^\d{10,15}$/.test(tienda.whatsapp)) {
  fallo(`WhatsApp "${tienda.whatsapp}" debe ser solo dígitos con código de país`);
}
if (!tienda.tasa_bcv_respaldo?.valor) fallo("falta la tasa BCV de respaldo");

/* ── 5 · el build coincide con los datos ──────────────────────────────── */

if (fs.existsSync("dist")) {
  for (const p of productos) {
    const ruta = path.join("dist", "producto", p.producto_id.toLowerCase(), "index.html");
    if (!fs.existsSync(ruta)) fallo(`el build no generó la ficha de ${p.producto_id}`);
  }

  const sistema = path.join("dist", "sistema", "index.html");
  if (fs.existsSync(sistema)) {
    const html = fs.readFileSync(sistema, "utf8");
    if (!html.includes("noindex") || !html.includes("Redirecting")) {
      fallo("/sistema no está cerrado en producción");
    }
  }

  const portada = fs.readFileSync(path.join("dist", "index.html"), "utf8");
  if (portada.includes("Falta el número de WhatsApp")) {
    fallo("la portada sigue mostrando el aviso de WhatsApp pendiente");
  }
  if (!portada.includes(tienda.whatsapp)) {
    aviso("el número de WhatsApp no aparece en el HTML de la portada");
  }
} else {
  aviso("no hay carpeta dist/: no se pudo contrastar contra el build");
}

/* ── informe ──────────────────────────────────────────────────────────── */

console.log(`productos      ${productos.length}`);
console.log(`variantes      ${productos.reduce((n, p) => n + p.variantes.length, 0)}`);
console.log(`imágenes       ${imagenes} referenciadas · ${faltantes} faltan`);
console.log(`categorías     ${["unas", "facial", "cuerpo"].map((c) => `${c} ${productos.filter((p) => p.categoria === c).length}`).join(" · ")}`);
console.log();

if (avisos.length) {
  console.log(`AVISOS (${avisos.length})`);
  for (const a of avisos) console.log(`  · ${a}`);
  console.log();
}

if (fallos.length) {
  console.log(`FALLOS (${fallos.length})`);
  for (const f of fallos) console.log(`  ✗ ${f}`);
  process.exit(1);
}

console.log("Datos y archivos: sin fallos.");
