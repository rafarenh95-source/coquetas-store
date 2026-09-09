/**
 * QA del sitio construido. Levanta el build de producción y lo recorre entero.
 *
 *   npx astro build && npx astro preview --port 4322 &
 *   node scripts/qa-sitio.mjs
 */

import fs from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:4322";
const productos = JSON.parse(fs.readFileSync("src/data/productos.json", "utf8"));
const tienda = JSON.parse(fs.readFileSync("src/data/tienda.json", "utf8"));

const rutas = ["/", ...productos.map((p) => `/producto/${p.producto_id.toLowerCase()}`)];

const fallos = [];
const fallo = (ruta, m) => fallos.push(`${ruta} — ${m}`);

const axe = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const navegador = await chromium.launch({ channel: "msedge" });

/* ── 1 · recorrido de todas las páginas ───────────────────────────────── */

let revisadas = 0;
let problemasAxe = 0;

for (const ruta of rutas) {
  const p = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  const ausentes = [];

  p.on("pageerror", (e) => errores.push(e.message.slice(0, 120)));
  p.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text().slice(0, 120));
  });
  p.on("response", (r) => {
    if (r.status() >= 400) ausentes.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });

  const res = await p.goto(BASE + ruta, { waitUntil: "networkidle" });
  if (res?.status() !== 200) fallo(ruta, `HTTP ${res?.status()}`);
  await p.waitForTimeout(1200);

  for (const e of errores) fallo(ruta, `consola: ${e}`);
  for (const a of ausentes) fallo(ruta, `recurso: ${a}`);

  const estructura = await p.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: document.querySelectorAll("h1").length,
    titulo: document.title,
    sinAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
    botonesSinNombre: [...document.querySelectorAll("button")].filter(
      (b) => !b.textContent.trim() && !b.getAttribute("aria-label")
    ).length,
    enlaces: [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h.startsWith("/")),
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => s.textContent
    ),
  }));

  if (estructura.lang !== "es") fallo(ruta, `lang="${estructura.lang}"`);
  if (estructura.h1 !== 1) fallo(ruta, `${estructura.h1} elementos h1`);
  if (!estructura.titulo) fallo(ruta, "sin title");
  if (estructura.sinAlt) fallo(ruta, `${estructura.sinAlt} imágenes sin alt`);
  if (estructura.botonesSinNombre) fallo(ruta, `${estructura.botonesSinNombre} botones sin nombre accesible`);

  for (const bruto of estructura.jsonld) {
    try {
      JSON.parse(bruto);
    } catch {
      fallo(ruta, "JSON-LD inválido");
    }
  }

  /* Desbordes en móvil, medidos contra el ancho real del aparato.
     Comparar scrollWidth con innerWidth no sirve: cuando el contenido desborda,
     el navegador ensancha innerWidth para que quepa y encoge la página entera,
     así que los dos crecen juntos y la comprobación siempre pasa. */
  for (const ancho of [320, 360, 390]) {
    await p.setViewportSize({ width: ancho, height: 780 });
    await p.waitForTimeout(400);
    const real = await p.evaluate(() => window.innerWidth);
    if (real !== ancho) {
      fallo(ruta, `a ${ancho} px el navegador ensancha el viewport a ${real}: la página se ve encogida`);
    }
  }
  await p.setViewportSize({ width: 1280, height: 900 });

  /* accesibilidad automatizada */
  await p.addScriptTag({ content: axe });
  const resultado = await p.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    });
    return r.violations.map((v) => ({ id: v.id, impacto: v.impact, n: v.nodes.length }));
  });
  for (const v of resultado) {
    problemasAxe++;
    fallo(ruta, `axe ${v.id} (${v.impacto}, ${v.n} nodos)`);
  }

  revisadas++;
  await p.close();
}

/* ── 2 · enlaces internos ─────────────────────────────────────────────── */

const p = await navegador.newPage();
await p.goto(BASE + "/", { waitUntil: "networkidle" });
const enlaces = await p.evaluate(() =>
  [...new Set([...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")))]
);
for (const href of enlaces) {
  const limpio = href.split("#")[0].split("?")[0];
  if (!limpio || limpio === "/") continue;
  const r = await p.request.get(BASE + limpio);
  if (r.status() >= 400) fallo("/", `enlace roto ${href} (${r.status()})`);
}

/* ── 3 · filtros de categoría ─────────────────────────────────────────── */

const esperado = {
  todo: productos.length,
  unas: productos.filter((x) => x.categoria === "unas").length,
  facial: productos.filter((x) => x.categoria === "facial").length,
  cuerpo: productos.filter((x) => x.categoria === "cuerpo").length,
};

for (const [cat, n] of Object.entries(esperado)) {
  await p.click(`#pestana-${cat}`);
  await p.waitForTimeout(400);
  const visibles = await p.$$eval("#grilla > div:not(.hidden)", (ns) => ns.length);
  if (visibles !== n) fallo("/", `pestaña ${cat}: ${visibles} tarjetas, esperaba ${n}`);
  const seleccion = await p.getAttribute(`#pestana-${cat}`, "aria-selected");
  if (seleccion !== "true") fallo("/", `pestaña ${cat} no queda marcada como seleccionada`);
}

/* enlace profundo */
await p.goto(BASE + "/?categoria=cuerpo", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
if ((await p.$$eval("#grilla > div:not(.hidden)", (ns) => ns.length)) !== esperado.cuerpo) {
  fallo("/?categoria=cuerpo", "el enlace profundo no filtra");
}

/* ── 4 · la bolsa ─────────────────────────────────────────────────────── */

const conVariantes = productos.find((x) => x.variantes.length > 3);
const sinVariantes = productos.find((x) => x.variantes.length === 1);

await p.goto(`${BASE}/producto/${conVariantes.producto_id.toLowerCase()}`, {
  waitUntil: "networkidle",
});
await p.waitForTimeout(1500);
await p.click("[data-selector-variante] [role=radio]:nth-child(3)");
await p.waitForTimeout(300);
const tonoElegido = (await p.textContent("[data-tono-elegido]")).trim();
if (tonoElegido !== conVariantes.variantes[2].tono) {
  fallo("bolsa", `el tono mostrado es "${tonoElegido}", esperaba "${conVariantes.variantes[2].tono}"`);
}
await p.click("[data-agregar]");
await p.waitForTimeout(500);

if (!(await p.isVisible("[data-bolsa-panel][data-abierta]"))) fallo("bolsa", "no se abre al agregar");

/* persiste al navegar */
await p.goto(`${BASE}/producto/${sinVariantes.producto_id.toLowerCase()}`, {
  waitUntil: "networkidle",
});
await p.waitForTimeout(1500);
if ((await p.textContent("[data-bolsa-cuenta]")) !== "1") {
  fallo("bolsa", "no persiste al cambiar de página");
}
await p.click("[data-agregar]");
await p.waitForTimeout(500);

const esperadoDivisa = conVariantes.precio_divisa + sinVariantes.precio_divisa;
const divisaMostrada = await p.textContent("[data-bolsa-divisa]");
const numero = Number(divisaMostrada.replace(/[^\d,]/g, "").replace(",", "."));
if (Math.abs(numero - esperadoDivisa) > 0.005) {
  fallo("bolsa", `subtotal ${divisaMostrada}, esperaba $${esperadoDivisa.toFixed(2)}`);
}

/* todos los importes visibles llevan su símbolo de moneda: se ha caído dos veces
   al editar el archivo, así que se comprueba en el navegador y no leyendo el código */
const importes = await p.$$eval("[data-bolsa-lista] li, [data-bolsa-divisa]", (ns) =>
  ns.map((n) => n.textContent.trim())
);
for (const t of importes) {
  if (/\d,\d\d/.test(t) && !t.includes("$") && !t.includes("Bs")) {
    fallo("bolsa", `importe sin símbolo de moneda: "${t.replace(/\s+/g, " ")}"`);
  }
}

/* el enlace de WhatsApp lleva el pedido completo */
const href = await p.getAttribute("[data-bolsa-pedir]", "href");
if (!href?.startsWith(`https://wa.me/${tienda.whatsapp}`)) {
  fallo("bolsa", `el enlace de WhatsApp apunta a ${href}`);
}
const texto = decodeURIComponent(new URL(href).searchParams.get("text") ?? "");
if (!texto.includes(conVariantes.variantes[2].tono)) {
  fallo("bolsa", "el mensaje no incluye el tono elegido");
}
if (!texto.includes(sinVariantes.nombre)) fallo("bolsa", "el mensaje no incluye el segundo producto");

/* vaciar deja el estado vacío, no una lista rota */
for (let i = 0; i < 4; i++) {
  const menos = await p.$("[data-menos]");
  if (!menos) break;
  await menos.click();
  await p.waitForTimeout(250);
}
if (await p.isVisible("[data-bolsa-resumen]")) fallo("bolsa", "el resumen sigue visible con la bolsa vacía");
if (!(await p.isVisible("[data-bolsa-vacia]"))) fallo("bolsa", "no aparece el estado vacío");

/* Escape cierra y devuelve el foco */
await p.click("[data-bolsa-cerrar]");
await p.waitForTimeout(400);
await p.click("[data-bolsa-abrir]");
await p.waitForTimeout(400);
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
if (await p.isVisible("[data-bolsa-panel][data-abierta]")) fallo("bolsa", "Escape no cierra el panel");

/* con el panel abierto, el resto de la página queda fuera del tabulador */
await p.click("[data-bolsa-abrir]");
await p.waitForTimeout(400);
const fueraDelFoco = await p.evaluate(() =>
  [...document.body.children]
    .filter((h) => !h.hasAttribute("data-bolsa-panel") && h.tagName !== "SCRIPT")
    .every((h) => h.inert)
);
if (!fueraDelFoco) fallo("bolsa", "el fondo no queda inerte: el tabulador se escapa del modal");
await p.keyboard.press("Escape");
await p.waitForTimeout(300);

/* ── 5 · la lupa ──────────────────────────────────────────────────────── */

await p.click("[data-ampliar]");
await p.waitForTimeout(400);
if (!(await p.evaluate(() => document.querySelector("[data-lupa]")?.open))) {
  fallo("ficha", "la lupa no abre");
}
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
if (await p.evaluate(() => document.querySelector("[data-lupa]")?.open)) {
  fallo("ficha", "la lupa no cierra con Escape");
}

/* ── 6 · la tasa cuando la API falla ──────────────────────────────────── */

const ctx = await navegador.newContext();
await ctx.route("**ve.dolarapi.com**", (r) => r.abort());
const pOffline = await ctx.newPage();
await pOffline.goto(BASE + "/", { waitUntil: "networkidle" });
await pOffline.waitForTimeout(3000);
const bs = await pOffline.textContent("[data-bs]").catch(() => "");
if (!bs?.includes("Bs")) fallo("tasa", "sin API y sin caché no se muestra ningún precio en bolívares");
await ctx.close();

/* ── 7 · navegación con teclado ───────────────────────────────────────────
   Nada de esto lo detecta axe: son problemas de orden de foco, no de marcado.
   Se comprueban porque ya se rompieron una vez. */

async function recorrerConTab(pagina, pasos) {
  const paradas = [];
  for (let i = 0; i < pasos; i++) {
    await pagina.keyboard.press("Tab");
    paradas.push(
      await pagina.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        return {
          rol: e.getAttribute("role") ?? e.tagName.toLowerCase(),
          texto: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40),
          enBolsaCerrada: !!e.closest("[data-bolsa-panel]:not([data-abierta])"),
        };
      })
    );
  }
  return paradas.filter(Boolean);
}

const pTeclado = await navegador.newPage({ viewport: { width: 1280, height: 900 } });

/* ficha con muchos tonos */
const muyVariado = productos.reduce((a, b) => (b.variantes.length > a.variantes.length ? b : a));
await pTeclado.goto(`${BASE}/producto/${muyVariado.producto_id.toLowerCase()}`, {
  waitUntil: "networkidle",
});
await pTeclado.waitForTimeout(1500);

const enFicha = await recorrerConTab(pTeclado, 14);

if (!enFicha[0]?.texto.toLowerCase().includes("saltar")) {
  fallo("teclado", "el enlace para saltar al contenido no es la primera parada");
}

const enBolsa = enFicha.filter((d) => d.enBolsaCerrada).length;
if (enBolsa > 0) fallo("teclado", `${enBolsa} paradas dentro de la bolsa cerrada`);

const enRadios = enFicha.filter((d) => d.rol === "radio").length;
if (enRadios !== 1) {
  fallo(
    "teclado",
    `el selector de ${muyVariado.variantes.length} tonos expone ${enRadios} paradas de tabulador; un radiogroup expone 1`
  );
}

/* las flechas recorren el grupo y dan la vuelta */
await pTeclado.evaluate(() =>
  document.querySelector("[data-selector-variante] [role=radio]").focus()
);
await pTeclado.keyboard.press("End");
await pTeclado.waitForTimeout(250);
const ultimo = (await pTeclado.textContent("[data-tono-elegido]")).trim();
if (ultimo !== muyVariado.variantes.at(-1).tono) {
  fallo("teclado", `Fin lleva a "${ultimo}", esperaba "${muyVariado.variantes.at(-1).tono}"`);
}

/* portada: pestañas y anuncio del filtro */
await pTeclado.goto(BASE + "/", { waitUntil: "networkidle" });
await pTeclado.waitForTimeout(1500);

const enPortada = await recorrerConTab(pTeclado, 12);
const enPestanas = enPortada.filter((d) => d.rol === "tab").length;
if (enPestanas !== 1) {
  fallo("teclado", `las 4 pestañas exponen ${enPestanas} paradas de tabulador; un tablist expone 1`);
}

await pTeclado.evaluate(() => document.getElementById("pestana-todo").focus());
await pTeclado.keyboard.press("ArrowRight");
await pTeclado.waitForTimeout(500);
const anuncio = (await pTeclado.textContent("[data-recuento]")).trim();
if (!anuncio.includes("Uñas")) fallo("teclado", `el filtro no se anuncia (dice "${anuncio}")`);
const etiquetadoPor = await pTeclado.getAttribute("#grilla", "aria-labelledby");
if (etiquetadoPor !== "pestana-unas") {
  fallo("teclado", `el panel sigue etiquetado por "${etiquetadoPor}" tras cambiar de pestaña`);
}

await pTeclado.close();

/* ── informe ──────────────────────────────────────────────────────────── */

await navegador.close();

console.log(`páginas revisadas   ${revisadas}`);
console.log(`enlaces internos    ${enlaces.length}`);
console.log(`violaciones axe     ${problemasAxe}`);
console.log();

if (fallos.length) {
  console.log(`FALLOS (${fallos.length})`);
  for (const f of fallos) console.log(`  ✗ ${f}`);
  process.exit(1);
}

console.log("Sitio: sin fallos.");
