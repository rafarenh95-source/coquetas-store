/**
 * QA del encabezado, el menú y la fila de favoritos:
 *   · encabezado: WhatsApp (desde 360 px), bolsa y menú; sin desbordes
 *   · menú: abre, Escape y tocar fuera lo cierran, el foco vuelve al botón;
 *     categorías y «Ver catálogo» funcionan en la portada y desde una ficha
 *   · favoritos: solo la foto, con texto alternativo, y llevan a la ficha
 *
 *   npx astro preview --port 4322 &
 *   node scripts/qa-menu.mjs [--capturas=carpeta]
 */
import { chromium } from "playwright-core";
const arg = process.argv.find((a) => a.startsWith("--capturas="));
const S = arg ? arg.split("=")[1] : null;
if (S) (await import("node:fs")).mkdirSync(S, { recursive: true });
const B = process.env.QA_BASE ?? "http://localhost:4322";
const b = await chromium.launch({ channel: "msedge" });
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); };
const errores = [];

// Encabezado en cada ancho
for (const [w, botones] of [[320, ["bolsa", "menu"]], [360, ["wa", "bolsa", "menu"]], [390, ["wa", "bolsa", "menu"]], [1280, ["wa", "bolsa", "menu"]]]) {
  const c = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: w < 768, hasTouch: w < 768 });
  const p = await c.newPage();
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(B + "/", { waitUntil: "networkidle" });
  const vis = await p.evaluate(() => {
    const v = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
    return { wa: v("header [data-wa-referencia]"), bolsa: v("header [data-bolsa-abrir]"), menu: v("header [data-menu-abrir]"),
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mapa: !!document.querySelector("header [data-accion-mapa]"), comoComprar: !!document.querySelector('#catalogo a[href="#como-comprar"]') };
  });
  const vistos = ["wa", "bolsa", "menu"].filter((k) => vis[k]);
  ok(JSON.stringify(vistos) === JSON.stringify(botones), `${w}: encabezado muestra ${vistos}, esperaba ${botones}`);
  ok(vis.desborde === 0, `${w}: desborde ${vis.desborde}`);
  ok(!vis.mapa, `${w}: el mapa sigue en el encabezado`);
  ok(!vis.comoComprar, `${w}: sigue «Cómo comprar» bajo el título`);
  if (w === 390 || w === 1280) {
    if (S) await p.screenshot({ path: `${S}/encabezado-${w}.png`, clip: { x: 0, y: 0, width: w, height: 700 } });
    await p.click("[data-menu-abrir]");
    await p.waitForTimeout(450);
    if (S) await p.screenshot({ path: `${S}/menu-${w}.png` });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }
  await c.close();
}

// Comportamiento del menú (teléfono)
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
p.on("pageerror", (e) => errores.push(e.message));
await p.goto(B + "/", { waitUntil: "networkidle" });
const abierto = () => p.$eval("dialog[data-menu]", (d) => d.open);

await p.click("[data-menu-abrir]");
await p.waitForTimeout(400);
ok(await abierto(), "el menú no se abre");
ok(await p.evaluate(() => document.querySelector("dialog[data-menu]").contains(document.activeElement)), "el foco no entra al menú");
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
ok(!(await abierto()), "Escape no cierra el menú");
ok(await p.evaluate(() => document.activeElement?.hasAttribute("data-menu-abrir")), "al cerrar, el foco no vuelve al botón del menú");

await p.click("[data-menu-abrir]");
await p.waitForTimeout(400);
await p.mouse.click(15, 400); // velo de fuera (el panel ocupa el 88 %)
await p.waitForTimeout(300);
ok(!(await abierto()), "tocar fuera no cierra el menú");

await p.click("[data-menu-abrir]");
await p.waitForTimeout(400);
await p.click('dialog[data-menu] [data-ir-categoria="unas"]');
await p.waitForTimeout(700);
ok(!(await abierto()), "elegir una categoría no cierra el menú");
ok(await p.$eval("#vista-portada", (x) => x.hidden), "la categoría del menú no abre la grilla");
ok(new URL(p.url()).searchParams.get("categoria") === "unas", "la dirección no queda en ?categoria=unas");

await p.click("[data-menu-abrir]");
await p.waitForTimeout(400);
await p.click("dialog[data-menu] [data-ver-portada]");
await p.waitForTimeout(700);
ok(!(await p.$eval("#vista-portada", (x) => x.hidden)), "«Ver catálogo» no vuelve a la portada");

/* «Cómo comprar» no va suelto en el menú: es una de las preguntas
   frecuentes, y todas llegan cerradas (decisión de la dueña). */
ok(!(await p.$('dialog[data-menu] a[href*="como-comprar"]')), "el menú tiene «Cómo comprar» suelto");
await p.click("[data-menu-abrir]");
await p.waitForTimeout(400);
await p.click('dialog[data-menu] a[href="/#preguntas"]');
await p.waitForTimeout(800);
ok(await p.$eval("#preguntas", (s) => { const r = s.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), "«Preguntas frecuentes» del menú no lleva a las preguntas");
ok((await p.$$eval("#preguntas details", (ds) => ds.filter((d) => d.open).length)) === 0, "hay preguntas abiertas sin que nadie las abriera");

// Favoritos: solo fotos, que llevan a la ficha
const fav = await p.evaluate(() => {
  const r = document.querySelector('[data-carrusel="muestra"]');
  const reales = [...r.querySelectorAll("[data-carrusel-diapositiva]:not([data-copia])")];
  return {
    n: reales.length,
    soloFoto: reales.every((d) => d.querySelectorAll("img").length === 1 && !d.querySelector("button, input, [data-precio]")),
    alts: reales.map((d) => d.querySelector("img").alt),
    hrefs: reales.map((d) => d.querySelector("a").getAttribute("href")),
  };
});
ok(fav.n === 4, `favoritos: ${fav.n}`);
ok(fav.soloFoto, "favoritos: hay algo más que la foto");
ok(fav.alts.every(Boolean), "favoritos: foto sin texto alternativo");
ok(fav.hrefs.every((h) => h.startsWith("/producto/")), "favoritos: no llevan a la ficha");
await p.evaluate(() => scrollTo(0, document.querySelector('[data-carrusel="muestra"]').getBoundingClientRect().top + scrollY - 90));
await p.waitForTimeout(600);
if (S) await p.screenshot({ path: `${S}/favoritos-390.png` });

// Desde una ficha, la categoría del menú navega a la portada filtrada
await p.goto(B + "/producto/mg-polygel", { waitUntil: "networkidle" });
await p.click("[data-menu-abrir]");
await p.waitForTimeout(400);
await Promise.all([p.waitForNavigation(), p.click('dialog[data-menu] [data-ir-categoria="facial"]')]);
await p.waitForTimeout(800);
ok(p.url().includes("categoria=facial"), "desde la ficha, la categoría del menú no navega");
ok(await p.$eval("#vista-portada", (x) => x.hidden), "desde la ficha, no llega a la grilla filtrada");
await c.close();

ok(errores.length === 0, "errores: " + errores.join(" | "));
await b.close();
if (fallos.length) {
  console.log(fallos.map((f) => "✗ " + f).join("\n"));
  console.log(`\nMenú: ${fallos.length} fallos.`);
  process.exitCode = 1;
} else console.log("\nMenú: sin fallos.");
