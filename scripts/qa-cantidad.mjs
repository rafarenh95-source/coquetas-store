/**
 * QA del selector de cantidad: recorre el flujo completo como lo haría una
 * clienta — elegir cantidad, agregar, ver la bolsa, cambiar la cantidad,
 * eliminar — en el teléfono (375 px) y con teclado.
 *
 *   npx astro preview --port 4322 &
 *   node scripts/qa-cantidad.mjs [--capturas=carpeta]
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:4322";
const productos = JSON.parse(fs.readFileSync("src/data/productos.json", "utf8"));
const argCapturas = process.argv.find((a) => a.startsWith("--capturas="));
const carpeta = argCapturas ? argCapturas.split("=")[1] : null;
if (carpeta) fs.mkdirSync(carpeta, { recursive: true });

const fallos = [];
let pruebas = 0;
const comprobar = (ok, mensaje) => {
  pruebas++;
  if (!ok) fallos.push(mensaje);
};
const dinero = (n) => n.toFixed(2).replace(".", ",");
const numero = (t) => Number(String(t).replace(/[^\d,]/g, "").replace(",", "."));

const b = await chromium.launch({ channel: "msedge" });
const c = await b.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await c.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
const foto = async (n) => carpeta && p.screenshot({ path: path.join(carpeta, `${n}.png`) });

const bolsa = () => p.evaluate(() => JSON.parse(localStorage.getItem("coquetas:bolsa") ?? "[]"));

/* ── 1 · tarjeta: estado inicial y validación ─────────────────────────── */

const conTonos = productos.find((x) => x.categoria === "unas" && x.tipo_variante === "color" && x.variantes.length > 3);
await p.goto(`${BASE}/?categoria=unas`, { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(800);

const tarjeta = p.locator(`[data-tarjeta][data-id="${conTonos.producto_id}"]`);
const campo = tarjeta.locator("[data-cantidad-valor]");
const menos = tarjeta.locator("[data-cantidad-menos]");
const mas = tarjeta.locator("[data-cantidad-mas]");
await tarjeta.scrollIntoViewIfNeeded();

comprobar((await campo.inputValue()) === "1", "la cantidad no empieza en 1");
comprobar(await menos.isDisabled(), "«−» no está deshabilitado en 1");

for (const [lado, nombre] of [[menos, "−"], [mas, "+"], [campo, "número"]]) {
  const caja = await lado.boundingBox();
  comprobar(caja.width >= 44 && caja.height >= 44, `«${nombre}» mide ${Math.round(caja.width)}×${Math.round(caja.height)}`);
}

await mas.click();
await mas.click();
comprobar((await campo.inputValue()) === "3", "«+» dos veces no da 3");
comprobar(!(await menos.isDisabled()), "«−» sigue deshabilitado en 3");

const casos = [["0", "1"], ["-4", "1"], ["2.7", "2"], ["2,9", "2"], ["", "1"], ["abc", "1"], ["150", "99"], ["7", "7"]];
for (const [escrito, esperado] of casos) {
  await campo.fill(escrito);
  await campo.press("Tab");
  const v = await campo.inputValue();
  comprobar(v === esperado, `escribir "${escrito}" deja ${v}, esperaba ${esperado}`);
  if (esperado === "99") comprobar(await mas.isDisabled(), "«+» no se deshabilita en el tope (99)");
}

await campo.fill("3");
await campo.press("ArrowUp");
comprobar((await campo.inputValue()) === "4", "la flecha ↑ no suma");
await campo.press("ArrowDown");
comprobar((await campo.inputValue()) === "3", "la flecha ↓ no resta");
await foto("1-tarjeta-3");

/* ── 2 · agregar suma la cantidad elegida ─────────────────────────────── */

await tarjeta.locator("[data-agregar-tarjeta]").click();
await p.waitForTimeout(400);
comprobar((await p.textContent("[data-aviso-titulo]")).trim() === "3 unidades agregadas", "el aviso no dice «3 unidades agregadas»");
comprobar(!!(await p.$("[data-aviso][data-visible]")), "el aviso no se ve");
await foto("2-aviso");
comprobar((await campo.inputValue()) === "1", "el selector no vuelve a 1 después de agregar");
comprobar((await p.textContent("[data-bolsa-cuenta]")).trim() === "3", "el contador del ícono no dice 3");
let items = await bolsa();
comprobar(items.length === 1 && items[0].cantidad === 3, `la bolsa guarda ${JSON.stringify(items.map((i) => i.cantidad))}`);

// El mismo producto y tono otra vez: se suma a lo que había
await mas.click();
await tarjeta.locator("[data-agregar-tarjeta]").click();
await p.waitForTimeout(400);
items = await bolsa();
comprobar(items.length === 1 && items[0].cantidad === 5, "agregar 2 más del mismo tono no suma a 5");
comprobar((await p.textContent("[data-aviso-detalle]")).includes("5 unidades en tu bolsa"), "el aviso no dice cuántas hay en total");

// Otro tono: renglón aparte
await tarjeta.locator('[role="radio"]').nth(1).click();
await tarjeta.locator("[data-agregar-tarjeta]").click();
await p.waitForTimeout(400);
items = await bolsa();
comprobar(items.length === 2, "otro tono no crea un renglón aparte");
comprobar((await p.textContent("[data-bolsa-cuenta]")).trim() === "6", "el contador no dice 6");

// Tras 4 s el aviso se va solo
await p.waitForTimeout(4500);
comprobar(!(await p.$("[data-aviso][data-visible]")), "el aviso no se va solo");

/* ── 3 · la bolsa: total, cambiar cantidad, eliminar ──────────────────── */

await p.evaluate(() => window.scrollTo(0, 0));
await p.click("[data-bolsa-abrir]");
await p.waitForTimeout(800);
const total = () => p.textContent("[data-bolsa-divisa]").then(numero);
comprobar(Math.abs((await total()) - conTonos.precio_divisa * 6) < 0.005, `el subtotal no es ${dinero(conTonos.precio_divisa * 6)}`);
await foto("3-bolsa");

const fila = p.locator("[data-bolsa-lista] li").first();
await fila.locator("[data-cantidad-mas]").click();
await p.waitForTimeout(200);
items = await bolsa();
comprobar(items[0].cantidad === 6, "«+» en la bolsa no suma");
comprobar(Math.abs((await total()) - conTonos.precio_divisa * 7) < 0.005, "el subtotal no se recalcula con «+»");
const focoTrasMas = await p.evaluate(() => document.activeElement?.hasAttribute("data-cantidad-mas"));
comprobar(focoTrasMas, "el foco se pierde al tocar «+» en la bolsa");

const campoBolsa = p.locator("[data-bolsa-lista] li").first().locator("[data-cantidad-valor]");
await campoBolsa.fill("10");
await campoBolsa.press("Enter");
await p.waitForTimeout(200);
items = await bolsa();
comprobar(items[0].cantidad === 10, `escribir 10 en la bolsa deja ${items[0].cantidad}`);
comprobar(Math.abs((await total()) - conTonos.precio_divisa * 11) < 0.005, "el subtotal no se recalcula al escribir");
const focoEnCampo = await p.evaluate(() => document.activeElement?.hasAttribute("data-cantidad-valor"));
comprobar(focoEnCampo, "el foco se pierde al escribir la cantidad en la bolsa");
comprobar((await p.locator("[data-bolsa-lista] li").first().textContent()).includes("c/u"), "con varias unidades no se ve el precio por unidad");

await campoBolsa.fill("0");
await campoBolsa.press("Enter");
await p.waitForTimeout(200);
items = await bolsa();
comprobar(items[0].cantidad === 1, "escribir 0 en la bolsa no lo corrige a 1");
comprobar(await p.locator("[data-bolsa-lista] li").first().locator("[data-cantidad-menos]").isDisabled(), "«−» en la bolsa no se deshabilita en 1");

const href = await p.getAttribute("[data-bolsa-pedir]", "href");
const mensaje = decodeURIComponent(new URL(href).searchParams.get("text") ?? "");
comprobar(/× 1\b/.test(mensaje) === false, "el mensaje marca «× 1» cuando es una sola");
await foto("4-bolsa-editada");

await p.locator("[data-bolsa-lista] li").nth(1).locator("[data-quitar]").click();
await p.waitForTimeout(200);
items = await bolsa();
comprobar(items.length === 1, "«Eliminar» no quita el renglón");
comprobar((await p.textContent("[data-bolsa-cuenta]")).trim() === "1", "el contador no se actualiza al eliminar");
const focoTrasQuitar = await p.evaluate(() => document.activeElement?.hasAttribute("data-quitar") || document.activeElement?.hasAttribute("data-bolsa-cerrar"));
comprobar(focoTrasQuitar, "el foco se pierde al eliminar un renglón");

/* ── 4 · teclado: Tab hasta «+» y Enter ───────────────────────────────── */

await p.keyboard.press("Escape");
await p.waitForTimeout(400);
const conChips = productos.find((x) => x.tipo_variante !== "color" && x.variantes.length === 1);
await p.goto(`${BASE}/producto/${conChips.producto_id.toLowerCase()}`, { waitUntil: "networkidle" });
await p.waitForTimeout(600);
await p.focus("[data-producto] [data-cantidad-mas]");
await p.keyboard.press("Enter");
await p.keyboard.press(" ");
const valorFicha = await p.inputValue("[data-producto] [data-cantidad-valor]");
comprobar(valorFicha === "3", `Enter y Espacio sobre «+» dejan ${valorFicha}`);
const anillo = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
comprobar(anillo !== "none", "el «+» enfocado con teclado no muestra anillo de foco");

/* ── 5 · ficha: el botón dice el total y agrega esa cantidad ──────────── */

const etiqueta = (await p.textContent("[data-agregar]")).replace(/\s+/g, " ").trim();
comprobar(etiqueta.includes(dinero(conChips.precio_divisa * 3)), `el botón de la ficha dice "${etiqueta}"`);
await foto("5-ficha-3");
await p.click("[data-agregar]");
await p.waitForTimeout(400);
items = await bolsa();
const enFicha = items.find((i) => i.id === conChips.producto_id);
comprobar(enFicha?.cantidad === 3, "la ficha no agrega 3");
comprobar((await p.inputValue("[data-producto] [data-cantidad-valor]")) === "1", "la ficha no vuelve a 1");
comprobar((await p.textContent("[data-agregar]")).includes(dinero(conChips.precio_divisa)), "el botón de la ficha no vuelve al precio de una");

/* ── 6 · tope: no pasa de 99 por renglón ──────────────────────────────── */

await p.fill("[data-producto] [data-cantidad-valor]", "99");
await p.press("[data-producto] [data-cantidad-valor]", "Tab");
await p.click("[data-agregar]");
await p.waitForTimeout(400);
items = await bolsa();
comprobar(items.find((i) => i.id === conChips.producto_id)?.cantidad === 99, "pasó del tope de 99");
await p.click("[data-agregar]");
await p.waitForTimeout(400);
comprobar((await p.textContent("[data-aviso-titulo]")).trim() === "No se agregó nada", "en el tope no avisa que no se agregó");

comprobar(errores.length === 0, `errores en consola: ${errores.join(" | ")}`);

await b.close();
console.log(`${pruebas} comprobaciones`);
if (fallos.length) {
  for (const f of fallos) console.log("✗ " + f);
  console.log(`\nCantidad: ${fallos.length} fallos.`);
  process.exitCode = 1;
} else console.log("\nCantidad: sin fallos.");
