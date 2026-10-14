/**
 * QA de los carruseles de la portada («Favoritos de Coquetas» y «Categorías»):
 * forma (una fila, tarjetas iguales, asoma la siguiente, flechas a los lados
 * a la altura de las fotos) de 320 px a escritorio, y comportamiento (avance
 * solo con 1,3 s de pausa, vuelta sin fin, pausas, movimiento reducido,
 * flechas, teclado).
 *
 *   npx astro preview --port 4322 &
 *   node scripts/qa-carrusel.mjs [--capturas=carpeta]
 *
 * Tarda ~1-2 minutos: hay que esperar al avance automático de verdad.
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:4322";
const PAUSA = 1300; // la de scripts/carrusel.js
const MOVIMIENTO = 900; // margen para el desplazamiento suave
const CARRUSELES = ["muestra", "categorias"];

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
const raiz = (nombre) => `[data-carrusel="${nombre}"]`;

async function abrir(opciones = {}, ruta = "/", nombre = "categorias") {
  const c = await b.newContext({ deviceScaleFactor: 2, hasTouch: true, ...opciones });
  const p = await c.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE + ruta, { waitUntil: "networkidle" });
  /* Solo avanza a la vista: se baja hasta el carrusel que se va a probar. */
  await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center", behavior: "instant" }), raiz(nombre));
  await p.waitForTimeout(400);
  return { c, p };
}

const estado = (p, nombre) =>
  p.evaluate((sel) => {
    const pista = document.querySelector(`${sel} [data-carrusel-pista]`);
    const reales = [...pista.querySelectorAll("[data-carrusel-diapositiva]:not([data-copia])")];
    const paso = reales[1].offsetLeft - reales[0].offsetLeft;
    return {
      scroll: pista.scrollLeft,
      paso,
      indice: ((Math.round(pista.scrollLeft / paso) % reales.length) + reales.length) % reales.length,
      n: reales.length,
      punto: [...document.querySelectorAll(`${sel} [data-carrusel-puntos] span`)].findIndex((s) =>
        s.classList.contains("bg-ciruela")
      ),
    };
  }, raiz(nombre));

/* ── 1 · forma en cada ancho ──────────────────────────────────────────── */

for (const [w, h] of [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 800], [1280, 900]]) {
  const { c, p } = await abrir({ viewport: { width: w, height: h }, isMobile: w < 768 });
  comprobar((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, `${w}px: la página se desborda`);
  for (const nombre of CARRUSELES) {
    const f = await p.evaluate((sel) => {
      const r = document.querySelector(sel);
      const pista = r.querySelector("[data-carrusel-pista]");
      const diapos = [...pista.querySelectorAll("[data-carrusel-diapositiva]")];
      const cajas = diapos.map((d) => d.getBoundingClientRect());
      const vista = pista.getBoundingClientRect();
      const visibles = cajas.filter((x) => x.left < vista.right && x.right > vista.left);
      const ultima = visibles[visibles.length - 1];
      const foto = diapos[0].querySelector(".aspect-square").getBoundingClientRect();
      const flechas = [...r.querySelectorAll("[data-carrusel-anterior], [data-carrusel-siguiente]")].map((x) => ({
        oculta: x.hidden,
        caja: x.getBoundingClientRect(),
      }));
      return {
        unaFila: new Set(cajas.map((x) => Math.round(x.top))).size === 1,
        anchos: new Set(cajas.map((x) => Math.round(x.width))).size,
        altos: new Set(cajas.map((x) => Math.round(x.height))).size,
        asoma: ultima ? ultima.right > vista.right + 8 : false,
        flechasVisibles: flechas.every((x) => !x.oculta),
        flechas44: flechas.every((x) => x.caja.width >= 44 && x.caja.height >= 44),
        flechasALosLados:
          flechas.length === 2 &&
          flechas[0].caja.left < vista.left + 60 &&
          flechas[1].caja.right > vista.right - 60,
        flechasEnLaFoto: flechas.every((x) => {
          const centro = x.caja.top + x.caja.height / 2;
          return centro > foto.top && centro < foto.bottom;
        }),
      };
    }, raiz(nombre));
    comprobar(f.unaFila, `${w}px ${nombre}: no está en una sola fila`);
    comprobar(f.anchos === 1, `${w}px ${nombre}: las tarjetas no miden lo mismo de ancho`);
    comprobar(f.altos === 1, `${w}px ${nombre}: las tarjetas no miden lo mismo de alto`);
    comprobar(f.asoma, `${w}px ${nombre}: no asoma la tarjeta siguiente`);
    comprobar(f.flechasVisibles, `${w}px ${nombre}: no se ven las flechas`);
    comprobar(f.flechas44, `${w}px ${nombre}: flechas de menos de 44 px`);
    comprobar(f.flechasALosLados, `${w}px ${nombre}: las flechas no están a los lados`);
    comprobar(f.flechasEnLaFoto, `${w}px ${nombre}: las flechas no están a la altura de la foto`);
  }
  if (carpeta) {
    await p.evaluate(() => scrollTo(0, document.querySelector('[data-carrusel="muestra"]').getBoundingClientRect().top + scrollY - 80));
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(carpeta, `carruseles-${w}.png`) });
  }
  await c.close();
}

/* ── 2 · avanza solo, con la pausa justa, y da la vuelta ──────────────────
   Se registra el desplazamiento cada 40 ms dentro de la página: de ahí salen
   los tramos quietos (las pausas, que deben durar ~1,3 s) y la tarjeta en la
   que se detuvo cada vez (que debe recorrer 1, 2, …, última, 0). */
for (const nombre of CARRUSELES) {
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/", nombre);
  // La fila de arriba arranca apenas carga la página: puede ir ya por la 2.ª.
  const e0 = await estado(p, nombre);

  const duracion = (PAUSA + MOVIMIENTO) * (e0.n + 2);
  const muestras = await p.evaluate(
    ({ sel, duracion }) =>
      new Promise((listo) => {
        const pista = document.querySelector(`${sel} [data-carrusel-pista]`);
        const datos = [];
        const t0 = performance.now();
        const id = setInterval(() => {
          datos.push([performance.now() - t0, pista.scrollLeft]);
          if (performance.now() - t0 > duracion) {
            clearInterval(id);
            listo(datos);
          }
        }, 40);
      }),
    { sel: raiz(nombre), duracion }
  );

  // Tramos quietos: el desplazamiento no cambia más de 1 px entre muestras
  const quietos = [];
  let inicio = muestras[0];
  for (let i = 1; i < muestras.length; i++) {
    if (Math.abs(muestras[i][1] - muestras[i - 1][1]) > 1) {
      if (muestras[i - 1][0] - inicio[0] > 200) quietos.push({ desde: inicio[0], hasta: muestras[i - 1][0], x: inicio[1] });
      inicio = muestras[i];
    }
  }
  const paso = e0.paso;
  const indices = quietos.map((q) => ((Math.round(q.x / paso) % e0.n) + e0.n) % e0.n);
  // Las pausas intermedias (la primera arranca antes de medir y la última sigue)
  const pausas = quietos.slice(1).map((q) => q.hasta - q.desde);
  // De a una, en orden, y pasando de la última a la primera
  const enOrden = indices.every((x, i) => i === 0 || x === (indices[i - 1] + 1) % e0.n);
  const daLaVuelta = indices.some((x, i) => i > 0 && x === 0 && indices[i - 1] === e0.n - 1);
  comprobar(
    enOrden && daLaVuelta && indices.length > e0.n,
    `${nombre}: recorrido ${indices.join("→")}, esperaba de a una en orden y dando la vuelta`
  );
  comprobar(
    pausas.length >= e0.n - 1 && pausas.slice(0, e0.n - 1).every((d) => d > PAUSA - 250 && d < PAUSA + 450),
    `${nombre}: pausas de ${pausas.map((d) => (d / 1000).toFixed(2)).join(" · ")} s, esperaba ~${PAUSA / 1000} s`
  );
  const eFin = await estado(p, nombre);
  comprobar(eFin.scroll < eFin.paso * eFin.n + 2, `${nombre}: se quedó dentro de las copias`);
  comprobar(eFin.punto === eFin.indice, `${nombre}: el punto no sigue a la tarjeta`);
  await c.close();
}

/* ── 3 · pausas ───────────────────────────────────────────────────────── */
{
  const nombre = "muestra";
  const { c, p } = await abrir({ viewport: { width: 1280, height: 900 }, hasTouch: false }, "/", nombre);
  // Ratón encima
  await p.hover(`${raiz(nombre)} [data-carrusel-pista]`);
  const a = await estado(p, nombre);
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === a.indice, "con el ratón encima sigue avanzando");
  await p.mouse.move(5, 5);
  await p.waitForTimeout(PAUSA + MOVIMIENTO + 400);
  comprobar((await estado(p, nombre)).indice !== a.indice, "al quitar el ratón no se reanuda");

  // Botón de pausa
  await p.click(`${raiz(nombre)} [data-carrusel-pausa]`);
  await p.mouse.move(5, 5);
  await p.evaluate(() => document.activeElement?.blur());
  comprobar((await p.getAttribute(`${raiz(nombre)} [data-carrusel-pausa]`, "aria-label")) === "Reanudar el carrusel", "el botón no cambia a «Reanudar»");
  await p.waitForTimeout(MOVIMIENTO);
  const b0 = await estado(p, nombre);
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === b0.indice, "pausado con el botón sigue avanzando");
  await p.click(`${raiz(nombre)} [data-carrusel-pausa]`);
  await p.mouse.move(5, 5);
  await p.evaluate(() => document.activeElement?.blur());
  await p.waitForTimeout(PAUSA + MOVIMIENTO + 400);
  comprobar((await estado(p, nombre)).indice !== b0.indice, "al reanudar con el botón no avanza");
  await c.close();
}
{
  // Dedo apoyado (teléfono)
  const nombre = "categorias";
  const { c, p } = await abrir({ viewport: { width: 375, height: 740 }, isMobile: true }, "/", nombre);
  await p.dispatchEvent(`${raiz(nombre)} [data-carrusel-pista]`, "pointerdown", { pointerType: "touch" });
  const a = await estado(p, nombre);
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === a.indice, "con el dedo apoyado sigue avanzando");
  await p.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" })));
  await p.waitForTimeout(PAUSA + 1500 + MOVIMIENTO + 400);
  comprobar((await estado(p, nombre)).indice !== a.indice, "al soltar el dedo no se reanuda");
  await c.close();
}
{
  // Movimiento reducido: nunca avanza solo y no hay botón de pausa
  const { c, p } = await abrir({ viewport: { width: 375, height: 740 }, isMobile: true, reducedMotion: "reduce" }, "/", "muestra");
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  for (const nombre of CARRUSELES) {
    comprobar((await estado(p, nombre)).indice === 0, `${nombre}: con movimiento reducido avanza solo`);
    comprobar(await p.$eval(`${raiz(nombre)} [data-carrusel-pausa]`, (x) => x.hidden), `${nombre}: con movimiento reducido se ve el botón de pausa`);
  }
  await p.click(`${raiz("muestra")} [data-carrusel-siguiente]`);
  await p.waitForTimeout(300);
  comprobar((await estado(p, "muestra")).indice === 1, "con movimiento reducido la flecha no avanza");
  await c.close();
}

/* ── 4 · flechas, teclado, copias ─────────────────────────────────────── */
for (const nombre of CARRUSELES) {
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/", nombre);
  await p.click(`${raiz(nombre)} [data-carrusel-pausa]`);
  await p.waitForTimeout(MOVIMIENTO);
  // Volver a la primera si alcanzó a moverse
  await p.evaluate((sel) => document.querySelector(`${sel} [data-carrusel-pista]`).scrollTo({ left: 0, behavior: "instant" }), raiz(nombre));
  await p.waitForTimeout(300);
  await p.click(`${raiz(nombre)} [data-carrusel-anterior]`);
  await p.waitForTimeout(MOVIMIENTO);
  const e = await estado(p, nombre);
  comprobar(e.indice === e.n - 1, `${nombre}: «anterior» desde la primera no lleva a la última (está en ${e.indice})`);
  await p.click(`${raiz(nombre)} [data-carrusel-siguiente]`);
  await p.waitForTimeout(MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === 0, `${nombre}: «siguiente» desde la última no vuelve a la primera`);

  await p.focus(`${raiz(nombre)} [data-carrusel-diapositiva]:not([data-copia]) a`);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(MOVIMIENTO);
  const enfocada = await p.evaluate((sel) => {
    const reales = [...document.querySelectorAll(`${sel} [data-carrusel-diapositiva]:not([data-copia])`)];
    return reales.indexOf(document.activeElement?.closest("[data-carrusel-diapositiva]"));
  }, raiz(nombre));
  comprobar(enfocada === 1, `${nombre}: → no lleva el foco a la segunda tarjeta (${enfocada})`);
  comprobar((await estado(p, nombre)).indice === 1, `${nombre}: → no desplaza a la segunda tarjeta`);

  const copias = await p.$$eval(`${raiz(nombre)} [data-copia]`, (cs) => ({
    n: cs.length,
    ocultas: cs.every((x) => x.getAttribute("aria-hidden") === "true"),
    sinTab: cs.every((x) => [...x.querySelectorAll("a, button, input")].every((a) => a.tabIndex === -1)),
  }));
  comprobar(copias.n > 0 && copias.ocultas && copias.sinTab, `${nombre}: las copias se ven para el lector de pantalla o el tabulador`);
  await c.close();
}
{
  // Tocar una copia de categoría también abre su categoría
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true });
  await p.$eval('[data-carrusel="categorias"] [data-copia] [data-categoria-tile]', (a) => a.click());
  await p.waitForTimeout(600);
  comprobar(await p.$eval("#vista-portada", (x) => x.hidden), "tocar una copia no abre la categoría");
  await c.close();
}
{
  // Se llega a una categoría y se vuelve: los carruseles se miden al aparecer
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/?categoria=unas");
  await p.click("[data-volver]");
  await p.waitForTimeout(1200);
  for (const nombre of CARRUSELES) {
    comprobar(!(await p.$eval(`${raiz(nombre)} [data-carrusel-siguiente]`, (x) => x.hidden)), `${nombre}: al volver desde una categoría no aparecen las flechas`);
  }
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
