/**
 * QA de los carruseles de la portada.
 *
 *   «Favoritos de Coquetas» — avanza solo con 1,3 s de pausa, vuelta sin fin,
 *   pausas (ratón, dedo; sin botón de pausa), movimiento reducido, flechas, teclado.
 *
 *   «Categorías» — fila QUIETA con íconos (decisión de la dueña): no se mueve
 *   sola, sin pausa ni copias; ~3 a la vista en el teléfono con flechas que
 *   solo aparecen hacia donde hay más; desde 640 px caben las 5, sin flechas.
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
      max: pista.scrollWidth - pista.clientWidth,
      paso,
      indice: ((Math.round(pista.scrollLeft / paso) % reales.length) + reales.length) % reales.length,
      n: reales.length,
      punto: [...document.querySelectorAll(`${sel} [data-carrusel-puntos] span`)].findIndex((s) =>
        s.classList.contains("bg-ciruela")
      ),
    };
  }, raiz(nombre));

const forma = (p, nombre) =>
  p.evaluate((sel) => {
    const r = document.querySelector(sel);
    const pista = r.querySelector("[data-carrusel-pista]");
    const diapos = [...pista.querySelectorAll("[data-carrusel-diapositiva]")];
    const reales = diapos.filter((d) => !d.hasAttribute("data-copia"));
    const cajas = diapos.map((d) => d.getBoundingClientRect());
    const vista = pista.getBoundingClientRect();
    const visibles = cajas.filter((x) => x.left < vista.right && x.right > vista.left);
    const enteras = reales.filter((d) => {
      const x = d.getBoundingClientRect();
      return x.left >= vista.left - 1 && x.right <= vista.right + 1;
    }).length;
    const ultima = visibles[visibles.length - 1];
    const foto = diapos[0].querySelector("[data-carrusel-foto], .aspect-square").getBoundingClientRect();
    const flecha = (s) => {
      const x = r.querySelector(s);
      return { oculta: x.hidden, caja: x.getBoundingClientRect() };
    };
    const ant = flecha("[data-carrusel-anterior]");
    const sig = flecha("[data-carrusel-siguiente]");
    const enLaFoto = (f) => {
      const centro = f.caja.top + f.caja.height / 2;
      return centro > foto.top && centro < foto.bottom;
    };
    return {
      copias: diapos.length - reales.length,
      enteras,
      unaFila: new Set(cajas.map((x) => Math.round(x.top))).size === 1,
      anchos: new Set(cajas.map((x) => Math.round(x.width))).size,
      altos: new Set(cajas.map((x) => Math.round(x.height))).size,
      asoma: ultima ? ultima.right > vista.right + 8 : false,
      ant: ant.oculta ? null : { lado: ant.caja.left < vista.left + 60, t44: ant.caja.width >= 44 && ant.caja.height >= 44, foto: enLaFoto(ant) },
      sig: sig.oculta ? null : { lado: sig.caja.right > vista.right - 60, t44: sig.caja.width >= 44 && sig.caja.height >= 44, foto: enLaFoto(sig) },
      pausa: !!r.querySelector("[data-carrusel-pausa]"),
      nombresCortados: reales.some((d) => [...d.querySelectorAll("a span")].some((s) => s.scrollWidth > s.clientWidth + 1)),
    };
  }, raiz(nombre));

/* ── 1 · forma en cada ancho ──────────────────────────────────────────── */

for (const [w, h] of [[320, 568], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 800], [1280, 900]]) {
  const { c, p } = await abrir({ viewport: { width: w, height: h }, isMobile: w < 768 });
  comprobar((await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, `${w}px: la página se desborda`);

  // Favoritos
  const m = await forma(p, "muestra");
  comprobar(m.unaFila, `${w}px favoritos: no está en una sola fila`);
  comprobar(m.anchos === 1 && m.altos === 1, `${w}px favoritos: las fotos no miden lo mismo`);
  comprobar(m.asoma, `${w}px favoritos: no asoma la siguiente`);
  comprobar(m.ant && m.sig, `${w}px favoritos: no se ven las dos flechas`);
  comprobar(m.ant?.lado && m.sig?.lado, `${w}px favoritos: las flechas no están a los lados`);
  comprobar(m.ant?.t44 && m.sig?.t44, `${w}px favoritos: flechas de menos de 44 px`);
  comprobar(m.ant?.foto && m.sig?.foto, `${w}px favoritos: las flechas no están a la altura de la foto`);
  comprobar(!m.pausa, `${w}px favoritos: tiene botón de pausa (la dueña lo quitó)`);

  // Categorías
  const k = await forma(p, "categorias");
  comprobar(k.copias === 0 && !k.pausa, `${w}px categorías: tiene copias o botón de pausa`);
  comprobar(k.unaFila, `${w}px categorías: no está en una sola fila`);
  comprobar(k.anchos === 1 && k.altos === 1, `${w}px categorías: las tarjetas no miden lo mismo`);
  comprobar(!k.nombresCortados, `${w}px categorías: nombre cortado`);
  if (w < 640) {
    comprobar(k.enteras >= 2, `${w}px categorías: se ven ${k.enteras} enteras`);
    comprobar(k.asoma, `${w}px categorías: no asoma la siguiente`);
    comprobar(!k.ant, `${w}px categorías: «anterior» visible al principio`);
    comprobar(k.sig && k.sig.lado && k.sig.t44 && k.sig.foto, `${w}px categorías: «siguiente» mal puesta o ausente`);
  } else {
    comprobar(k.enteras >= 3, `${w}px categorías: se ven ${k.enteras} enteras`);
    comprobar(!k.ant && k.sig && k.sig.t44, `${w}px categorías: flechas mal (solo «siguiente» al principio)`);
  }

  if (carpeta) {
    await p.evaluate(() => scrollTo(0, document.querySelector('[data-carrusel="muestra"]').getBoundingClientRect().top + scrollY - 80));
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(carpeta, `carruseles-${w}.png`) });
  }
  await c.close();
}

/* ── 2 · favoritos avanza solo, con la pausa justa, y da la vuelta ─────────
   Se registra el desplazamiento cada 40 ms dentro de la página: de ahí salen
   los tramos quietos (las pausas, que deben durar ~1,3 s) y la tarjeta en la
   que se detuvo cada vez. */
{
  const nombre = "muestra";
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/", nombre);
  // Arranca apenas carga la página: puede ir ya por la 2.ª.
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

  const quietos = [];
  let inicio = muestras[0];
  for (let i = 1; i < muestras.length; i++) {
    if (Math.abs(muestras[i][1] - muestras[i - 1][1]) > 1) {
      if (muestras[i - 1][0] - inicio[0] > 200) quietos.push({ desde: inicio[0], hasta: muestras[i - 1][0], x: inicio[1] });
      inicio = muestras[i];
    }
  }
  const indices = quietos.map((q) => ((Math.round(q.x / e0.paso) % e0.n) + e0.n) % e0.n);
  const pausas = quietos.slice(1).map((q) => q.hasta - q.desde);
  const enOrden = indices.every((x, i) => i === 0 || x === (indices[i - 1] + 1) % e0.n);
  const daLaVuelta = indices.some((x, i) => i > 0 && x === 0 && indices[i - 1] === e0.n - 1);
  comprobar(
    enOrden && daLaVuelta && indices.length > e0.n,
    `favoritos: recorrido ${indices.join("→")}, esperaba de a una en orden y dando la vuelta`
  );
  comprobar(
    pausas.length >= e0.n - 1 && pausas.slice(0, e0.n - 1).every((d) => d > PAUSA - 250 && d < PAUSA + 450),
    `favoritos: pausas de ${pausas.map((d) => (d / 1000).toFixed(2)).join(" · ")} s, esperaba ~${PAUSA / 1000} s`
  );
  const eFin = await estado(p, nombre);
  comprobar(eFin.scroll < eFin.paso * eFin.n + 2, "favoritos: se quedó dentro de las copias");
  comprobar(eFin.punto === eFin.indice, "favoritos: el punto no sigue a la tarjeta");

  // Categorías, en la misma página: quieta
  await p.evaluate(() => document.querySelector('[data-carrusel="categorias"]').scrollIntoView({ block: "center", behavior: "instant" }));
  const k0 = (await estado(p, "categorias")).scroll;
  await p.waitForTimeout(PAUSA * 3);
  comprobar((await estado(p, "categorias")).scroll === k0, "categorías: se mueve sola");
  await c.close();
}

/* ── 3 · pausas de favoritos ───────────────────────────────────────────── */
{
  const nombre = "muestra";
  const { c, p } = await abrir({ viewport: { width: 1280, height: 900 }, hasTouch: false }, "/", nombre);
  await p.hover(`${raiz(nombre)} [data-carrusel-pista]`);
  const a = await estado(p, nombre);
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === a.indice, "con el ratón encima sigue avanzando");
  await p.mouse.move(5, 5);
  await p.waitForTimeout(PAUSA + MOVIMIENTO + 400);
  comprobar((await estado(p, nombre)).indice !== a.indice, "al quitar el ratón no se reanuda");

  await c.close();
}
{
  const nombre = "muestra";
  const { c, p } = await abrir({ viewport: { width: 375, height: 740 }, isMobile: true }, "/", nombre);
  await p.dispatchEvent(`${raiz(nombre)} [data-carrusel-pista]`, "pointerdown", { pointerType: "touch" });
  await p.waitForTimeout(MOVIMIENTO);
  const a = await estado(p, nombre);
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === a.indice, "con el dedo apoyado sigue avanzando");
  await p.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch" })));
  await p.waitForTimeout(PAUSA + 1500 + MOVIMIENTO + 400);
  comprobar((await estado(p, nombre)).indice !== a.indice, "al soltar el dedo no se reanuda");
  await c.close();
}
{
  const { c, p } = await abrir({ viewport: { width: 375, height: 740 }, isMobile: true, reducedMotion: "reduce" }, "/", "muestra");
  await p.waitForTimeout(PAUSA * 2 + MOVIMIENTO);
  comprobar((await estado(p, "muestra")).indice === 0, "favoritos: con movimiento reducido avanza solo");
  await p.click(`${raiz("muestra")} [data-carrusel-siguiente]`);
  await p.waitForTimeout(300);
  comprobar((await estado(p, "muestra")).indice === 1, "con movimiento reducido la flecha no avanza");
  await c.close();
}

/* ── 4 · flechas y teclado ─────────────────────────────────────────────── */
{
  const nombre = "muestra";
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/", nombre);
  // Sin botón de pausa: un dedo apoyado detiene el avance mientras se prueban las flechas.
  await p.dispatchEvent(`${raiz(nombre)} [data-carrusel-pista]`, "pointerdown", { pointerType: "touch" });
  await p.waitForTimeout(MOVIMIENTO);
  await p.evaluate((sel) => document.querySelector(`${sel} [data-carrusel-pista]`).scrollTo({ left: 0, behavior: "instant" }), raiz(nombre));
  await p.waitForTimeout(300);
  await p.click(`${raiz(nombre)} [data-carrusel-anterior]`);
  await p.waitForTimeout(MOVIMIENTO);
  const e = await estado(p, nombre);
  comprobar(e.indice === e.n - 1, `favoritos: «anterior» desde la primera no lleva a la última (está en ${e.indice})`);
  await p.click(`${raiz(nombre)} [data-carrusel-siguiente]`);
  await p.waitForTimeout(MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === 0, "favoritos: «siguiente» desde la última no vuelve a la primera");

  await p.focus(`${raiz(nombre)} [data-carrusel-diapositiva]:not([data-copia]) a`);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(MOVIMIENTO);
  const enfocada = await p.evaluate((sel) => {
    const reales = [...document.querySelectorAll(`${sel} [data-carrusel-diapositiva]:not([data-copia])`)];
    return reales.indexOf(document.activeElement?.closest("[data-carrusel-diapositiva]"));
  }, raiz(nombre));
  comprobar(enfocada === 1, `favoritos: → no lleva el foco a la segunda (${enfocada})`);

  const copias = await p.$$eval(`${raiz(nombre)} [data-copia]`, (cs) => ({
    n: cs.length,
    ocultas: cs.every((x) => x.getAttribute("aria-hidden") === "true"),
    sinTab: cs.every((x) => [...x.querySelectorAll("a, button, input")].every((a) => a.tabIndex === -1)),
  }));
  comprobar(copias.n > 0 && copias.ocultas && copias.sinTab, "favoritos: las copias se ven para el lector de pantalla o el tabulador");
  await c.close();
}
{
  const nombre = "categorias";
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/", nombre);
  const oculta = (s) => p.$eval(`${raiz(nombre)} ${s}`, (x) => x.hidden);
  await p.click(`${raiz(nombre)} [data-carrusel-siguiente]`);
  await p.waitForTimeout(MOVIMIENTO);
  comprobar((await estado(p, nombre)).indice === 1, "categorías: «siguiente» no avanza una");
  comprobar(!(await oculta("[data-carrusel-anterior]")), "categorías: tras avanzar no aparece «anterior»");
  await p.click(`${raiz(nombre)} [data-carrusel-anterior]`);
  await p.waitForTimeout(MOVIMIENTO);
  comprobar((await estado(p, nombre)).scroll <= 2, "categorías: «anterior» no vuelve al principio");
  comprobar(await oculta("[data-carrusel-anterior]"), "categorías: «anterior» sigue visible al principio");
  // Hasta el final
  for (let i = 0; i < 5 && !(await oculta("[data-carrusel-siguiente]")); i++) {
    await p.click(`${raiz(nombre)} [data-carrusel-siguiente]`);
    await p.waitForTimeout(MOVIMIENTO);
  }
  const fin = await estado(p, nombre);
  comprobar(fin.scroll >= fin.max - 2, "categorías: con «siguiente» no se llega al final");
  comprobar(await oculta("[data-carrusel-siguiente]"), "categorías: «siguiente» sigue visible al final");

  await p.evaluate((sel) => document.querySelector(`${sel} [data-carrusel-pista]`).scrollTo({ left: 0, behavior: "instant" }), raiz(nombre));
  await p.focus(`${raiz(nombre)} [data-carrusel-diapositiva] a`);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(MOVIMIENTO);
  comprobar((await p.evaluate(() => document.activeElement?.dataset.categoriaTile)) === "herramientas", "categorías: → no lleva el foco a la segunda");
  await c.close();
}
{
  // Se llega a una categoría y se vuelve: los carruseles se miden al aparecer
  const { c, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true }, "/?categoria=unas");
  await p.click("[data-volver]");
  await p.waitForTimeout(1200);
  for (const nombre of ["muestra", "categorias"]) {
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
