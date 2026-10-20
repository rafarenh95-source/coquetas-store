/**
 * QA del banner de la tienda (cinta de fotos de la portada):
 *   · forma de 320 px a escritorio: fotos 12:5 del mismo tamaño, sello a la
 *     vista, sin desbordar la página;
 *   · la vuelta sin salto: media cinta = 4 fotos exactas (sin huecos);
 *   · velocidad ~40 px/s; se detiene con el ratón encima, con el dedo
 *     apoyado (sin botón de pausa); con movimiento reducido no se mueve.
 *
 *   npx astro preview --port 4322 &
 *   node scripts/qa-banner.mjs [--capturas=carpeta]
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:4322";
const arg = process.argv.find((a) => a.startsWith("--capturas="));
const carpeta = arg ? arg.split("=")[1] : null;
if (carpeta) fs.mkdirSync(carpeta, { recursive: true });

const fallos = [];
const ok = (c, m) => {
  if (!c) fallos.push(m);
};
const errores = [];
const b = await chromium.launch({ channel: "msedge" });

async function abrir(opciones) {
  const c = await b.newContext({ deviceScaleFactor: 2, ...opciones });
  const p = await c.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  return { c, p };
}

/* Posición actual de la cinta (lo que la animación lleva desplazado). */
const posicion = (p) =>
  p.evaluate(() => document.querySelector("[data-desfile-pista]").getBoundingClientRect().left);

/* ── forma ─────────────────────────────────────────────────────────────── */
for (const [w, h] of [[320, 640], [390, 844], [768, 1024], [1280, 900]]) {
  const { c, p } = await abrir({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });
  const f = await p.evaluate(() => {
    const pista = document.querySelector("[data-desfile-pista]");
    const fotos = [...pista.children];
    const cajas = fotos.map((x) => x.getBoundingClientRect());
    const sello = fotos[0].querySelector("img[src*='sello']").getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(pista).columnGap) || 0; // sin hueco: «normal»
    const reales = fotos.filter((x) => !x.hasAttribute("data-copia-desfile"));
    return {
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      n: reales.length,
      copias: fotos.length - reales.length,
      copiasOcultas: fotos.filter((x) => x.hasAttribute("data-copia-desfile")).every((x) => x.getAttribute("aria-hidden") === "true"),
      // Teléfono: cuadradas (fotos para teléfono); desde 640 px: 12:5
      proporcion: cajas.every((r) => Math.abs(r.width / r.height - (innerWidth < 640 ? 1 : 12 / 5)) < 0.03),
      fotoCorrecta: (innerWidth < 640) === reales[0].querySelector("picture img").currentSrc.includes("tienda-movil"),
      iguales: new Set(cajas.map((r) => Math.round(r.width))).size === 1,
      selloVisible: sello.width >= 30,
      mitadExacta: Math.abs(pista.scrollWidth / 2 - reales.length * (cajas[0].width + gap)) < 1.5,
      alts: reales.every((x) => x.querySelector("picture img").alt.length > 5),
      primeraPrioridad: reales[0].querySelector("picture img").getAttribute("fetchpriority") === "high",
      h1: document.querySelector("h1")?.textContent.trim(),
    };
  });
  ok(f.desborde === 0, `${w}px: la página se desborda ${f.desborde}px`);
  ok(f.n === 4 && f.copias === 4 && f.copiasOcultas, `${w}px: fotos ${f.n} + copias ${f.copias} (ocultas al lector: ${f.copiasOcultas})`);
  ok(f.proporcion, `${w}px: las fotos no tienen la proporción esperada`);
  ok(f.fotoCorrecta, `${w}px: carga el juego de fotos equivocado (teléfono/computadora)`);
  ok(f.iguales, `${w}px: las fotos no miden lo mismo`);
  ok(f.selloVisible, `${w}px: no se ve el sello`);
  ok(f.mitadExacta, `${w}px: la media cinta no calza con 4 fotos + huecos (la vuelta daría un salto)`);
  ok(f.alts, `${w}px: foto sin texto alternativo`);
  ok(f.primeraPrioridad, `${w}px: la primera foto no carga con prioridad`);
  ok(f.h1 === "Catálogo de Coquetas Store", `${w}px: H1 «${f.h1}»`);
  if (carpeta) await p.screenshot({ path: path.join(carpeta, `banner-${w}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(h, 520) } });
  await c.close();
}

/* ── movimiento y pausas (escritorio) ──────────────────────────────────── */
{
  const { c, p } = await abrir({ viewport: { width: 1280, height: 900 } });
  await p.mouse.move(5, 890);
  const x0 = await posicion(p);
  await p.waitForTimeout(2000);
  const x1 = await posicion(p);
  const velocidad = (x0 - x1) / 2;
  ok(velocidad > 30 && velocidad < 50, `velocidad ${velocidad.toFixed(1)} px/s, esperaba ~40`);

  // La cinta nunca está quieta: el ratón va a un punto fijo dentro del banner.
  const caja = await p.$eval("[data-desfile]", (x) => { const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(caja.x, caja.y);
  await p.waitForTimeout(200);
  const h0 = await posicion(p);
  await p.waitForTimeout(1200);
  ok(Math.abs((await posicion(p)) - h0) < 1, "con el ratón encima sigue moviéndose");
  await p.mouse.move(5, 890);

  ok(!(await p.$("[data-desfile-pausa]")), "el banner tiene botón de pausa (la dueña lo quitó)");
  await c.close();
}

/* ── dedo apoyado (teléfono) ───────────────────────────────────────────── */
{
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await p.dispatchEvent("[data-desfile]", "pointerdown", { pointerType: "touch" });
  const t0 = await posicion(p);
  await p.waitForTimeout(1200);
  ok(Math.abs((await posicion(p)) - t0) < 1, "con el dedo apoyado sigue moviéndose");
  await p.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" })));
  const t1 = await posicion(p);
  await p.waitForTimeout(1000);
  ok(Math.abs((await posicion(p)) - t1) > 20, "al soltar el dedo no se reanuda");
  await c.close();
}

/* ── movimiento reducido ───────────────────────────────────────────────── */
{
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const m0 = await posicion(p);
  await p.waitForTimeout(1200);
  ok(Math.abs((await posicion(p)) - m0) < 1, "con movimiento reducido se mueve");
  const r = await p.evaluate(() => ({
    copiasVisibles: [...document.querySelectorAll("[data-copia-desfile]")].some((x) => getComputedStyle(x).display !== "none"),
    deslizable: (() => { const d = document.querySelector("[data-desfile]"); return d.scrollWidth > d.clientWidth; })(),
  }));
  ok(!r.copiasVisibles, "con movimiento reducido se ven las fotos repetidas");
  ok(r.deslizable, "con movimiento reducido no se puede deslizar a mano");
  await c.close();
}

ok(errores.length === 0, `errores en consola: ${errores.join(" | ")}`);
await b.close();

if (fallos.length) {
  for (const f of fallos) console.log("✗ " + f);
  console.log(`\nBanner: ${fallos.length} fallos.`);
  process.exitCode = 1;
} else console.log("Banner: sin fallos.");
