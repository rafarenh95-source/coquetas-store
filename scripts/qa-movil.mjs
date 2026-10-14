/**
 * QA de la vista móvil. Recorre las pantallas principales en los anchos de
 * teléfono más comunes (de gama baja a alta) y en tablet, y avisa de:
 *
 *   · desbordes (la página se puede arrastrar de lado)
 *   · elementos que se salen de la pantalla
 *   · botones o enlaces con zona táctil menor de 44 × 44 px
 *   · textos cortados (con «…» o recortados por su caja)
 *   · campos de texto de menos de 16 px (el iPhone hace zoom al tocarlos)
 *
 * Con --capturas=<carpeta> guarda una captura de cada pantalla en cada ancho.
 *
 *   npx astro preview --port 4322 &
 *   node scripts/qa-movil.mjs [--capturas=ruta]
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE ?? "http://localhost:4322";
const ANCHOS = [320, 360, 375, 390, 412, 430, 768];
const ALTO = { 320: 568, 360: 740, 375: 667, 390: 844, 412: 915, 430: 932, 768: 1024 };

const argCapturas = process.argv.find((a) => a.startsWith("--capturas="));
const carpeta = argCapturas ? argCapturas.split("=")[1] : null;
if (carpeta) fs.mkdirSync(carpeta, { recursive: true });

/* Mínimo táctil: 44 px (Apple). Los círculos de tono miden menos a propósito
   pero amplían su área con .objetivo-amplio; eso se cuenta. */
const MIN_TACTIL = 44;

const PANTALLAS = [
  { id: "portada", ruta: "/", completa: true },
  { id: "grilla", ruta: "/?categoria=unas", completa: true },
  { id: "ficha-tonos", ruta: "/producto/mg-esm-semi-10", completa: true },
  { id: "ficha-chips", ruta: "/producto/mg-polygel", completa: false },
  {
    id: "ficha-barra",
    ruta: "/producto/mg-esm-semi-10",
    completa: false,
    accion: async (p) => {
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await p.waitForTimeout(500);
    },
  },
  {
    id: "bolsa",
    ruta: "/producto/mg-polygel",
    completa: false,
    accion: async (p) => {
      await p.click("[data-agregar]");
      await p.waitForTimeout(300);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.click("[data-bolsa-abrir]");
      await p.waitForTimeout(1000);
    },
  },
];

const navegador = await chromium.launch({ channel: "msedge" });
const hallazgos = [];

/* Una visita de calentamiento: la primera petición a un servidor recién
   levantado puede llegar sin la hoja de estilos y falsear la primera captura. */
{
  const p = await navegador.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.close();
}

for (const ancho of ANCHOS) {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: ALTO[ancho] },
    deviceScaleFactor: 2,
    isMobile: ancho < 768,
    hasTouch: true,
  });

  for (const pantalla of PANTALLAS) {
    const p = await contexto.newPage();
    await p.goto(BASE + pantalla.ruta, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    if (pantalla.accion) await pantalla.accion(p);

    const r = await p.evaluate((MIN) => {
      const vw = document.documentElement.clientWidth;
      const salida = { desborde: 0, fuera: [], pequenos: [], cortados: [], campos: [], fuentes: {} };

      salida.desborde = document.documentElement.scrollWidth - vw;

      const visible = (el) => {
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      };
      const dentroDeRiel = (el) => {
        for (let e = el.parentElement; e; e = e.parentElement) {
          const ox = getComputedStyle(e).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
        }
        return false;
      };
      const nombre = (el) =>
        (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName)
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 40);

      const panelCerrado = (el) => el.closest("[inert]");

      for (const el of document.body.querySelectorAll("*")) {
        if (panelCerrado(el) || !visible(el)) continue;
        const b = el.getBoundingClientRect();
        if ((b.right > vw + 1 || b.left < -1) && !dentroDeRiel(el) && el.closest("[data-hoja]") === null)
          salida.fuera.push(`${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")} (${Math.round(b.left)}→${Math.round(b.right)})`);
      }

      const interactivos = document.querySelectorAll("a[href], button, input, select, textarea, [role=radio]");
      for (const el of interactivos) {
        if (panelCerrado(el) || !visible(el)) continue;
        if (el.classList.contains("sr-only")) continue;
        const b = el.getBoundingClientRect();
        const extra = el.classList.contains("objetivo-amplio") && getComputedStyle(el, "::after").content !== "none" ? 8 : 0;
        const w = b.width + extra;
        const h = b.height + extra;
        if (w < MIN - 0.5 || h < MIN - 0.5)
          salida.pequenos.push(`${nombre(el)} ${Math.round(w)}×${Math.round(h)}`);
      }

      for (const el of document.body.querySelectorAll("*")) {
        if (panelCerrado(el) || !visible(el)) continue;
        if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        /* Lo que solo oye el lector de pantalla (.sr-only) mide 1 px a propósito. */
        const soloLector = el.closest(".sr-only") && !el.matches(":focus");
        const corta = s.overflow === "hidden" || s.overflowX === "hidden" || s.textOverflow === "ellipsis";
        if (!soloLector && corta && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
          salida.cortados.push(nombre(el));
        const fs = Math.round(parseFloat(s.fontSize));
        salida.fuentes[fs] = (salida.fuentes[fs] ?? 0) + 1;
      }

      for (const el of document.querySelectorAll("input, select, textarea")) {
        if (!visible(el)) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) salida.campos.push(`${nombre(el)} ${fs}px`);
      }

      return salida;
    }, MIN_TACTIL);

    const unicos = (l) => [...new Set(l)];
    hallazgos.push({ ancho, pantalla: pantalla.id, ...r, fuera: unicos(r.fuera), pequenos: unicos(r.pequenos), cortados: unicos(r.cortados) });

    if (carpeta)
      await p.screenshot({ path: path.join(carpeta, `${pantalla.id}-${ancho}.png`), fullPage: pantalla.completa });
    await p.close();
  }
  await contexto.close();
}

await navegador.close();

let total = 0;
for (const h of hallazgos) {
  const lineas = [];
  if (h.desborde > 0) lineas.push(`desborde horizontal de ${h.desborde}px`);
  if (h.fuera.length) lineas.push(`fuera de pantalla: ${h.fuera.slice(0, 5).join(" · ")}`);
  if (h.pequenos.length) lineas.push(`zona táctil < 44px: ${h.pequenos.join(" · ")}`);
  if (h.cortados.length) lineas.push(`texto cortado: ${h.cortados.join(" · ")}`);
  if (h.campos.length) lineas.push(`campo < 16px (zoom en iPhone): ${h.campos.join(" · ")}`);
  const chicas = Object.entries(h.fuentes).filter(([f]) => Number(f) < 12).map(([f, n]) => `${f}px×${n}`);
  if (chicas.length) lineas.push(`letra < 12px: ${chicas.join(" ")}`);
  if (lineas.length) {
    total += lineas.length;
    console.log(`\n▸ ${h.pantalla} @ ${h.ancho}px`);
    for (const l of lineas) console.log(`   ${l}`);
  }
}
console.log(total ? `\nMóvil: ${total} avisos.` : "\nMóvil: sin avisos.");
process.exitCode = 0;
