/**
 * QA del carrusel de categorías: forma (una fila, tarjetas iguales, asoma la
 * siguiente) de 320 px a escritorio, y comportamiento (avance solo, vuelta sin
 * fin, pausas, movimiento reducido, flechas y teclado).
 *
 *   npx astro preview --port 4322 &
 *   node scripts/qa-carrusel.mjs [--capturas=carpeta]
 *
 * Tarda ~1 minuto: hay que esperar al avance automático de verdad.
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:4322";
const argCapturas = process.argv.find((a) => a.startsWith("--capturas="));
const carpeta = argCapturas ? argCapturas.split("=")[1] : null;
if (carpeta) fs.mkdirSync(carpeta, { recursive: true });

const fallos = [];
let pruebas = 0;
const comprobar = (ok, m) => {
  pruebas++;
  if (!ok) fallos.push(m);
};

const b = await chromium.launch({ channel: "msedge" });
const errores = [];

async function abrir(opciones = {}, ruta = "/") {
  const c = await b.newContext({ deviceScaleFactor: 2, hasTouch: true, ...opciones });
  const p = await c.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE + ruta, { waitUntil: "networkidle" });
  /* El carrusel solo avanza a la vista; en el teléfono está debajo de la
     muestra de productos, así que se baja hasta él. */
  await p.evaluate(() => document.querySelector("[data-carrusel]")?.scrollIntoView({ block: "center", behavior: "instant" }));
  await p.waitForTimeout(500);
  return { c, p };
}

const estado = (p) =>
  p.evaluate(() => {
    const pista = document.querySelector("[data-carrusel-pista]");
    const reales = [...pista.querySelectorAll("[data-carrusel-diapositiva]:not([data-copia])")];
    const paso = reales[1].offsetLeft - reales[0].offsetLeft;
    return {
      scroll: pista.scrollLeft,
      paso,
      indice: Math.round(pista.scrollLeft / paso) % reales.length,
      n: reales.length,
      punto: [...document.querySelectorAll("[data-carrusel-puntos] span")].findIndex((s) =>
        s.classList.contains("bg-ciruela")
      ),
    };
  });

/* ── 1 · forma en cada ancho ──────────────────────────────────────────── */

for (const [w, h] of [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 800], [1280, 900]]) {
  const { c, p } = await abrir({ viewport: { width: w, height: h }, isMobile: w < 768 });
  const f = await p.evaluate(() => {
    const pista = document.querySelector("[data-carrusel-pista]");
    const diapos = [...pista.querySelectorAll("[data-carrusel-diapositiva]")];
    const cajas = diapos.map((d) => d.getBoundingClientRect());
    const vista = pista.getBoundingClientRect();
    const visibles = cajas.filter((r) => r.left < vista.right && r.right > vista.left);
    const ultimaVisible = visibles[visibles.length - 1];
    return {
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      unaFila: new Set(cajas.map((r) => Math.round(r.top))).size === 1,
      anchos: new Set(cajas.map((r) => Math.round(r.width))).size,
      altos: new Set(diapos.map((d) => Math.round(d.querySelector("a").getBoundingClientRect().height))).size,
      asoma: ultimaVisible ? ultimaVisible.right > vista.right + 8 : false,
      controles: !document.querySelector("[data-carrusel-controles]").hidden,
      ancho: Math.round(cajas[0].width),
    };
  });
  comprobar(f.desborde === 0, `${w}px: la página se desborda ${f.desborde}px`);
  comprobar(f.unaFila, `${w}px: las categorías no están en una sola fila`);
  comprobar(f.anchos === 1, `${w}px: las tarjetas no miden lo mismo de ancho`);
  comprobar(f.altos === 1, `${w}px: las tarjetas no miden lo mismo de alto`);
  comprobar(f.asoma, `${w}px: no asoma la tarjeta siguiente`);
  comprobar(f.controles, `${w}px: no se ven los controles`);
  if (carpeta) await p.screenshot({ path: path.join(carpeta, `carrusel-${w}.png`), clip: { x: 0, y: 380, width: w, height: Math.min(h - 380, 520) } });
  await c.close();
}

/* ── 2 · avanza solo y da la vuelta ───────────────────────────────────── */
{
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true });
  const e0 = await estado(p);
  comprobar(e0.indice === 0 && e0.punto === 0, "no arranca en la primera tarjeta");
  await p.waitForTimeout(4200);
  const e1 = await estado(p);
  comprobar(e1.indice === 1, `a los 4 s no avanzó una tarjeta (está en ${e1.indice})`);
  comprobar(e1.punto === 1, "el punto no sigue a la tarjeta");
  // Hasta dar la vuelta: n avances en total
  await p.waitForTimeout(3500 * (e0.n - 1) + 900);
  const e2 = await estado(p);
  comprobar(e2.indice === 0, `tras ${e0.n} avances no volvió a la primera (está en ${e2.indice})`);
  comprobar(e2.scroll < e2.paso * e2.n, "se quedó dentro de las copias en vez de volver a la tarjeta real");
  await c.close();
}

/* ── 3 · pausas ───────────────────────────────────────────────────────── */
{
  // Ratón encima (escritorio)
  const { c, p } = await abrir({ viewport: { width: 1280, height: 900 }, hasTouch: false });
  await p.hover("[data-carrusel-pista]");
  const a = await estado(p);
  await p.waitForTimeout(4500);
  comprobar((await estado(p)).indice === a.indice, "con el ratón encima sigue avanzando");
  await p.mouse.move(5, 5);
  await p.waitForTimeout(4200);
  comprobar((await estado(p)).indice !== a.indice, "al quitar el ratón no se reanuda");

  // Botón de pausa
  await p.click("[data-carrusel-pausa]");
  await p.mouse.move(5, 5);
  comprobar((await p.getAttribute("[data-carrusel-pausa]", "aria-label")) === "Reanudar el carrusel", "el botón no cambia a «Reanudar»");
  const b0 = await estado(p);
  await p.waitForTimeout(4500);
  comprobar((await estado(p)).indice === b0.indice, "pausado con el botón sigue avanzando");
  await p.click("[data-carrusel-pausa]");
  await p.mouse.move(5, 5);
  await p.evaluate(() => document.activeElement?.blur());
  await p.waitForTimeout(4200);
  comprobar((await estado(p)).indice !== b0.indice, "al reanudar con el botón no avanza");
  await c.close();
}
{
  // Dedo apoyado (teléfono)
  const { c, p } = await abrir({ viewport: { width: 375, height: 740 }, isMobile: true });
  await p.dispatchEvent("[data-carrusel-pista]", "pointerdown", { pointerType: "touch" });
  const a = await estado(p);
  await p.waitForTimeout(4500);
  comprobar((await estado(p)).indice === a.indice, "con el dedo apoyado sigue avanzando");
  await p.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" })));
  await p.waitForTimeout(5400);
  comprobar((await estado(p)).indice !== a.indice, "al soltar el dedo no se reanuda");
  await c.close();
}
{
  // Movimiento reducido: nunca avanza solo y no hay botón de pausa
  const { c, p } = await abrir({ viewport: { width: 375, height: 740 }, isMobile: true, reducedMotion: "reduce" });
  await p.waitForTimeout(4500);
  comprobar((await estado(p)).indice === 0, "con movimiento reducido avanza solo");
  comprobar(await p.$eval("[data-carrusel-pausa]", (x) => x.hidden), "con movimiento reducido se ve el botón de pausa");
  // Las flechas siguen funcionando
  await p.click("[data-carrusel-siguiente]");
  await p.waitForTimeout(300);
  comprobar((await estado(p)).indice === 1, "con movimiento reducido la flecha no avanza");
  await c.close();
}

/* ── 4 · flechas, teclado, copias ─────────────────────────────────────── */
{
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true });
  await p.click("[data-carrusel-pausa]");
  await p.click("[data-carrusel-anterior]");
  await p.waitForTimeout(900);
  const e = await estado(p);
  comprobar(e.indice === e.n - 1, `«anterior» desde la primera no lleva a la última (está en ${e.indice})`);
  await p.click("[data-carrusel-siguiente]");
  await p.waitForTimeout(900);
  comprobar((await estado(p)).indice === 0, "«siguiente» desde la última no vuelve a la primera");

  for (const sel of ["[data-carrusel-pausa]", "[data-carrusel-anterior]", "[data-carrusel-siguiente]"]) {
    const r = await p.$eval(sel, (x) => x.getBoundingClientRect());
    comprobar(r.width >= 44 && r.height >= 44, `${sel} mide ${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  await p.focus("[data-carrusel-diapositiva]:not([data-copia]) a");
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(900);
  const enfocada = await p.evaluate(() => document.activeElement?.dataset.categoriaTile);
  comprobar(enfocada === "herramientas", `→ no lleva el foco a la segunda categoría (${enfocada})`);
  comprobar((await estado(p)).indice === 1, "→ no desplaza a la segunda categoría");

  const copias = await p.$$eval("[data-copia]", (cs) => ({
    n: cs.length,
    ocultas: cs.every((x) => x.getAttribute("aria-hidden") === "true"),
    sinTab: cs.every((x) => [...x.querySelectorAll("a")].every((a) => a.tabIndex === -1)),
  }));
  comprobar(copias.n > 0 && copias.ocultas && copias.sinTab, "las copias se ven para el lector de pantalla o el tabulador");

  // Tocar una copia también abre su categoría
  await p.$eval("[data-copia] [data-categoria-tile]", (a) => a.click());
  await p.waitForTimeout(600);
  comprobar(await p.$eval("#vista-portada", (x) => x.hidden), "tocar una copia no abre la categoría");
  await c.close();
}
{
  // Se llega a una categoría y se vuelve: el carrusel se mide al aparecer
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/?categoria=unas");
  await p.click("[data-volver]");
  await p.waitForTimeout(1200);
  comprobar(!(await p.$eval("[data-carrusel-controles]", (x) => x.hidden)), "al volver desde una categoría no aparecen los controles");
  await p.click("[data-carrusel-siguiente]");
  await p.waitForTimeout(900);
  comprobar((await estado(p)).indice === 1, "al volver desde una categoría la flecha no funciona");
  await c.close();
}

comprobar(errores.length === 0, `errores en consola: ${errores.join(" | ")}`);
await b.close();

console.log(`${pruebas} comprobaciones`);
if (fallos.length) {
  for (const f of fallos) console.log("✗ " + f);
  console.log(`\nCarrusel: ${fallos.length} fallos.`);
  process.exitCode = 1;
} else console.log("\nCarrusel: sin fallos.");
