/**
 * QA del pedido: la bolsa ya no muestra el mensaje; «Confirmar pedido» abre la ventana
 * «Confirma tu pedido» y de ahí se envía por WhatsApp o se vuelve a editar.
 * Con el preview en :4322 → node scripts/qa-pedido.mjs [carpeta-capturas]
 * Debe terminar en «Pedido: sin fallos».
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const S = process.argv[2];
const BASE = "http://localhost:4322";
const FICHA = `${BASE}/producto/mg-esm-semi-10`;
const axe = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const b = await chromium.launch({ channel: "msedge" });

let fallos = 0;
const ok = (c, m) => {
  if (!c) fallos++;
  console.log(c ? "  ok " : "  FALLA ", m);
};

for (let k = 0; k < 30; k++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}

const estado = (p) =>
  p.evaluate(() => {
    const d = document.querySelector("dialog[data-confirmar]");
    const a = document.activeElement;
    return {
      abierta: Boolean(d?.open),
      mensaje: d?.querySelector("[data-confirmar-mensaje]")?.textContent ?? "",
      href: d?.querySelector("[data-confirmar-enviar]")?.href ?? "",
      foco: a?.hasAttribute("data-confirmar-enviar")
        ? "enviar"
        : a?.hasAttribute("data-bolsa-confirmar")
          ? "confirmar"
          : a?.hasAttribute("data-confirmar-volver")
            ? "volver"
            : a?.tagName,
      bolsaAbierta: Boolean(document.querySelector("[data-bolsa-panel]")?.dataset.abierta),
    };
  });

/* ── con el dedo, teléfono de 390 px ─────────────────────────────────────── */
console.log("Teléfono 390 px, con toque");
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(e.message));
await p.goto(FICHA, { waitUntil: "networkidle" });

// producto con tono: se elige el segundo
const tonos = await p.$$('[data-selector-variante] [role="radio"]');
await tonos[1].tap();
await p.waitForTimeout(200);
const tono = (await p.textContent("[data-tono-elegido]"))?.trim() ?? "";
await p.tap("[data-agregar]");
await p.waitForTimeout(200);
await p.tap("[data-ver-pedido]");
await p.waitForTimeout(900);

ok((await p.$("[data-bolsa-preview]")) === null, "la bolsa ya no trae la vista previa del mensaje");
ok(!(await p.evaluate(() => document.querySelector("[data-bolsa-resumen]").innerText.includes("Hola Coquetas"))), "no se ve ningún mensaje en el pie de la bolsa");
const boton = await p.$eval("[data-bolsa-confirmar]", (e) => ({
  etiqueta: e.tagName,
  texto: e.textContent.trim(),
  alto: Math.round(e.getBoundingClientRect().height),
  icono: Boolean(e.querySelector("svg")),
}));
ok(boton.etiqueta === "BUTTON" && boton.texto === "Confirmar pedido" && boton.icono, `botón «${boton.texto}» (${boton.etiqueta}, con ícono)`);
ok(boton.alto >= 44, `botón de ${boton.alto} px de alto`);
ok(!(await estado(p)).abierta, "la ventana empieza cerrada");
S && (await p.screenshot({ path: `${S}/bolsa-390.png` }));

await p.tap("[data-bolsa-confirmar]");
await p.waitForTimeout(400);
let e1 = await estado(p);
ok(e1.abierta, "«Confirmar pedido» abre la ventana");
ok((await p.textContent("#confirmar-titulo")).trim() === "Confirma tu pedido", "título «Confirma tu pedido»");
ok((await p.textContent("#confirmar-intro")).trim() === "Este es el mensaje que llegará por WhatsApp:", "texto de introducción");
ok(tono.length > 0 && e1.mensaje.includes(tono), `el mensaje trae el tono elegido («${tono}»)`);
ok(e1.foco === "enviar", "el foco queda en «Enviar por WhatsApp»");
ok(e1.href.startsWith("https://wa.me/584246767738?text=") && decodeURIComponent(e1.href.split("?text=")[1]) === e1.mensaje, "el enlace lleva a wa.me con el mismo mensaje");
const medidas = await p.evaluate(() => {
  const d = document.querySelector("dialog[data-confirmar]");
  const r = (s) => d.querySelector(s).getBoundingClientRect();
  return {
    enviar: Math.round(r("[data-confirmar-enviar]").height),
    volver: Math.round(r("[data-confirmar-volver]").height),
    fondo: getComputedStyle(d).backgroundColor,
    dentro: d.getBoundingClientRect().left >= 0 && d.getBoundingClientRect().right <= innerWidth,
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    fondoInerte: document.querySelector("[data-bolsa-confirmar]").matches(":focus") === false,
  };
});
ok(medidas.enviar >= 44 && medidas.volver >= 44, `botones de ${medidas.enviar} y ${medidas.volver} px`);
ok(medidas.fondo === "rgb(255, 248, 244)", `ventana sobre papel (${medidas.fondo})`);
ok(medidas.dentro && medidas.desborde === 0, "la ventana cabe, sin scroll horizontal");
S && (await p.screenshot({ path: `${S}/confirmar-390.png` }));

await p.addScriptTag({ content: axe });
const v = await p.evaluate(async () =>
  (await axe.run("dialog[data-confirmar]")).violations.map((x) => x.id + " x" + x.nodes.length)
);
ok(v.length === 0, "axe en la ventana: " + (v.join(", ") || "0 violaciones"));

await p.tap("[data-confirmar-volver]");
await p.waitForTimeout(300);
let e2 = await estado(p);
ok(!e2.abierta && e2.bolsaAbierta, "«Volver y editar» cierra la ventana y la bolsa sigue abierta");
ok(e2.foco === "confirmar", "el foco vuelve a «Confirmar pedido»");

await p.tap("[data-bolsa-lista] [data-cantidad-mas]");
await p.waitForTimeout(200);
await p.tap("[data-bolsa-confirmar]");
await p.waitForTimeout(400);
let e3 = await estado(p);
ok(e3.abierta && e3.mensaje !== e1.mensaje && e3.mensaje.includes("× 2"), "tras cambiar la cantidad, el mensaje cambió (× 2)");
ok(e3.mensaje.includes(tono), "y sigue trayendo el tono");

const [pestana] = await Promise.all([ctx.waitForEvent("page"), p.tap("[data-confirmar-enviar]")]);
const destino = pestana.url();
await pestana.close();
await p.waitForTimeout(300);
ok(/wa\.me|whatsapp\.com/.test(destino), `«Enviar» abre WhatsApp en una pestaña nueva (${destino.slice(0, 48)}…)`);
ok(decodeURIComponent(destino).replace(/\+/g, " ").includes(tono), "la pestaña lleva el texto con el tono");
ok(!(await estado(p)).abierta, "al enviar, la ventana se cierra");
ok(errores.length === 0, "errores de JS: " + (errores.join(" | ") || "ninguno"));
await ctx.close();

/* ── solo con el teclado, computadora ────────────────────────────────────── */
console.log("Computadora 1280 px, solo teclado");
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
const q = await ctx2.newPage();
const errores2 = [];
q.on("pageerror", (e) => errores2.push(e.message));
await q.goto(FICHA, { waitUntil: "networkidle" });
const tonos2 = await q.$$('[data-selector-variante] [role="radio"]');
await tonos2[0].focus();
await q.keyboard.press("ArrowRight");
await q.waitForTimeout(200);
const tono2 = (await q.textContent("[data-tono-elegido]"))?.trim() ?? "";
await q.focus("[data-agregar]");
await q.keyboard.press("Enter");
await q.waitForTimeout(300);
await q.focus("[data-bolsa-confirmar]");
await q.keyboard.press("Enter");
await q.waitForTimeout(400);
let k1 = await estado(q);
ok(k1.abierta && k1.foco === "enviar", "Enter en «Confirmar pedido» abre la ventana con el foco en «Enviar»");
ok(tono2.length > 0 && k1.mensaje.includes(tono2), `el mensaje trae el tono («${tono2}»)`);
S && (await q.screenshot({ path: `${S}/confirmar-1280.png` }));

// el tabulador no cae nunca en la página de atrás (un <dialog> nativo pasa
// por la barra del navegador entre vuelta y vuelta: ahí el foco es <body>)
const paradas = [];
for (let i = 0; i < 8; i++) {
  await q.keyboard.press("Tab");
  paradas.push(
    await q.evaluate(() => {
      const a = document.activeElement;
      return !a || a === document.body || Boolean(a.closest("dialog[data-confirmar]"));
    })
  );
}
ok(paradas.every(Boolean), "el tabulador se queda dentro de la ventana (fondo inerte)");

await q.keyboard.press("Escape");
await q.waitForTimeout(300);
let k2 = await estado(q);
ok(!k2.abierta && k2.foco === "confirmar", "Escape cierra y devuelve el foco a «Confirmar pedido»");

// cambiar la cantidad con el teclado y confirmar otra vez
await q.focus("[data-bolsa-lista] [data-cantidad-mas]");
await q.keyboard.press("Enter");
await q.waitForTimeout(200);
await q.focus("[data-bolsa-confirmar]");
await q.keyboard.press("Enter");
await q.waitForTimeout(400);
let k3 = await estado(q);
ok(k3.abierta && k3.mensaje.includes("× 2") && k3.mensaje !== k1.mensaje, "confirma otra vez: el mensaje cambió (× 2)");

// «Volver y editar» con el teclado
await q.keyboard.press("Tab");
ok((await estado(q)).foco === "volver", "Tab pasa de «Enviar» a «Volver y editar»");
await q.keyboard.press("Enter");
await q.waitForTimeout(300);
ok(!(await estado(q)).abierta, "Enter en «Volver y editar» cierra la ventana");

await q.keyboard.press("Enter"); // el foco volvió a «Confirmar pedido»
await q.waitForTimeout(400);
ok((await estado(q)).foco === "enviar", "se abre de nuevo con el foco en «Enviar»");
const [pestana2] = await Promise.all([ctx2.waitForEvent("page"), q.keyboard.press("Enter")]);
const destino2 = pestana2.url();
await pestana2.close();
await q.waitForTimeout(300);
ok(/wa\.me|whatsapp\.com/.test(destino2) && decodeURIComponent(destino2).replace(/\+/g, " ").includes(tono2), "Enter en «Enviar» abre WhatsApp con el tono");
ok(!(await estado(q)).abierta, "y la ventana se cierra");
ok(errores2.length === 0, "errores de JS: " + (errores2.join(" | ") || "ninguno"));
await ctx2.close();

/* ── pedido largo en teléfono chico, y movimiento reducido ───────────────── */
console.log("Teléfono 320 px, pedido largo y movimiento reducido");
const ctx3 = await b.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const r = await ctx3.newPage();
await r.goto(FICHA, { waitUntil: "networkidle" });
const tonos3 = await r.$$('[data-selector-variante] [role="radio"]');
for (const t of tonos3.slice(0, 12)) {
  await t.tap();
  await r.waitForTimeout(80);
  await r.tap("[data-agregar]");
  await r.waitForTimeout(80);
}
await r.tap("[data-ver-pedido]");
await r.waitForTimeout(500);
await r.tap("[data-bolsa-confirmar]");
await r.waitForTimeout(300);
const largo = await r.evaluate(() => {
  const d = document.querySelector("dialog[data-confirmar]");
  const c = d.querySelector("[data-confirmar-caja]");
  const caja = d.getBoundingClientRect();
  const en = d.querySelector("[data-confirmar-enviar]").getBoundingClientRect();
  const vo = d.querySelector("[data-confirmar-volver]").getBoundingClientRect();
  return {
    desliza: c.scrollHeight > c.clientHeight + 2,
    cabe: caja.top >= 0 && caja.bottom <= innerHeight && caja.left >= 0 && caja.right <= innerWidth,
    botonesVisibles: en.top >= 0 && vo.bottom <= innerHeight,
    transicion: getComputedStyle(d).scale,
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok(largo.desliza, "con 12 tonos, el mensaje se desliza por dentro");
ok(largo.cabe && largo.botonesVisibles, "la ventana cabe en 320 × 568 y los dos botones se ven");
ok(largo.desborde === 0, "sin scroll horizontal");
ok(largo.transicion === "none", "con movimiento reducido no hay animación de entrada");
S && (await r.screenshot({ path: `${S}/confirmar-320-largo.png` }));
await ctx3.close();

await b.close();
console.log(fallos ? `Pedido: ${fallos} fallo(s)` : "Pedido: sin fallos");
process.exit(fallos ? 1 : 0);
