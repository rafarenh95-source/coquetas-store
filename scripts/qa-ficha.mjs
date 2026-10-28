/**
 * QA de la ficha (rediseño v2): foto grande, «Agregar al pedido» que se vuelve «− N +»,
 * barra «Ver mi pedido». Con el preview en :4322 → node scripts/qa-ficha.mjs [carpeta-capturas]
 * (el aviso axe «region» de la barra de la bolsa viene del rediseño).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
const S = process.argv[2];
const axe = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const b = await chromium.launch({ channel: "msedge" });
const ok = (c, m) => console.log(c ? "  ok " : "  FALLA ", m);

for (let k = 0; k < 20; k++) {
  try { await fetch("http://localhost:4322/"); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}

const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
await p.goto("http://localhost:4322/producto/mg-esm-semi-10", { waitUntil: "networkidle" });
const alto = await p.$eval("[data-foto]", (i) => Math.round(i.getBoundingClientRect().height));
console.log("alto de la foto:", alto, "px");
S && await p.screenshot({ path: `${S}/ficha-arriba-390.png` });

const vis = (sel) => p.$eval(sel, (e) => !e.hidden && e.offsetParent !== null);
ok(await vis("[data-agregar]"), "al entrar se ve «Agregar al pedido»");
ok(!(await vis("[data-en-pedido]")), "al entrar no se ve «− N +»");
ok((await p.textContent("[data-ver-pedido]")).trim() === "Ver mi pedido", "barra dice «Ver mi pedido»");

await p.click("[data-agregar]");
await p.waitForTimeout(200);
ok(await vis("[data-en-pedido]"), "tras agregar aparece «− N +»");
ok(!(await vis("[data-agregar]")), "tras agregar se esconde el botón");
ok((await p.textContent("[data-pedido-n]")) === "1", "dice 1");
await p.click("[data-pedido-mas]");
await p.click("[data-pedido-mas]");
await p.waitForTimeout(200);
ok((await p.textContent("[data-pedido-n]")) === "3", "con + + dice 3");
console.log("  subtotal:", await p.textContent("[data-pedido-subtotal]"));
console.log("  barra:", (await p.textContent("[data-pedido-unidades]")).trim(), "|", (await p.textContent("[data-pedido-total]")).trim());
await p.$eval("[data-cta-principal]", (e) => e.scrollIntoView({ block: "center" }));
await p.waitForTimeout(300);
S && await p.screenshot({ path: `${S}/ficha-paso-390.png` });

// otro tono: debe volver el botón
const tonos = await p.$$('[data-selector-variante] [role="radio"]');
await tonos[1].click();
await p.waitForTimeout(200);
ok(await vis("[data-agregar]"), "otro tono sin agregar: vuelve el botón");
await tonos[0].click();
await p.waitForTimeout(200);
ok((await p.textContent("[data-pedido-n]")) === "3", "volver al primer tono: sigue en 3");

await p.click("[data-pedido-menos]");
await p.click("[data-pedido-menos]");
await p.click("[data-pedido-menos]");
await p.waitForTimeout(200);
ok(await vis("[data-agregar]"), "bajar a 0: vuelve «Agregar al pedido»");
ok((await p.textContent("[data-pedido-total]")).trim() === "$0,00", "bajar a 0: total $0,00");

await p.click("[data-agregar]");
await p.click("[data-ver-pedido]");
await p.waitForTimeout(800);
const abierta = await p.evaluate(() => document.querySelector("[data-bolsa-lista]")?.children.length);
ok(abierta === 1, "«Ver mi pedido» abre la bolsa con 1 producto");
S && await p.screenshot({ path: `${S}/ficha-bolsa-390.png` });
await p.keyboard.press("Escape");
await p.waitForTimeout(500);

await p.addScriptTag({ content: axe });
const v = await p.evaluate(async () => (await axe.run()).violations.map((x) => x.id + " x" + x.nodes.length));
ok(v.length === 0, "axe: " + (v.join(", ") || "0 violaciones"));
ok(errores.length === 0, "errores de JS: " + (errores.join(" | ") || "ninguno"));

for (const w of [320, 360, 430, 1280]) {
  const q = await b.newPage({ viewport: { width: w, height: w > 800 ? 900 : 700 } });
  await q.goto("http://localhost:4322/producto/mg-esm-semi-10", { waitUntil: "networkidle" });
  await q.click("[data-agregar]");
  await q.waitForTimeout(200);
  const r = await q.evaluate(() => ({
    desborde: document.documentElement.scrollWidth > innerWidth,
    chicos: [...document.querySelectorAll("[data-en-pedido] button, [data-ver-pedido]")]
      .filter((e) => e.offsetParent && (e.getBoundingClientRect().width < 44 || e.getBoundingClientRect().height < 44)).length,
    foto: Math.round(document.querySelector("[data-foto]").getBoundingClientRect().height),
  }));
  ok(!r.desborde && r.chicos === 0, `${w}px: desborde ${r.desborde}, botones chicos ${r.chicos}, foto ${r.foto}px`);
  await q.goto("http://localhost:4322/producto/mg-esm-semi-10", { waitUntil: "networkidle" });
  S && await q.screenshot({ path: `${S}/ficha-${w}.png` });
}
await b.close();
