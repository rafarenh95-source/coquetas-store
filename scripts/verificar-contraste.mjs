/**
 * Coquetas — verificación de contraste.
 *
 * El objetivo del proyecto es Accessibility = 100, y el punto donde eso se rompe
 * casi siempre no es la paleta del manual sino los niveles de opacidad que uno
 * inventa sobre la marcha para el texto secundario.
 *
 * Este script mide, no estima. Falla con código 1 si alguna pareja usada en el
 * código no llega a 4.5:1.
 *
 *   node scripts/verificar-contraste.mjs
 */

import fs from "node:fs";
import path from "node:path";

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lineal = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminancia = ([r, g, b]) => 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const mezclar = (fg, bg, alfa) => fg.map((c, i) => Math.round(c * alfa + bg[i] * (1 - alfa)));

const COLOR = {
  crema: hex("#FEEBE2"),
  papel: hex("#FFF8F4"),
  ciruela: hex("#2B0A26"),
  purpura: hex("#7A0177"),
  magenta: hex("#C5188A"),
};

const MINIMO = 4.5; // AA para texto normal; todo el cuerpo del sitio va a 12–20 px

/* Superficies sobre las que puede caer texto */
const FONDOS = { crema: COLOR.crema, papel: COLOR.papel };

/* Se recolectan del código las clases text-<color>/<opacidad> realmente usadas */
function usadas(dir, encontradas = new Map()) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      usadas(ruta, encontradas);
      continue;
    }
    if (!/\.(astro|css|js|ts)$/.test(entrada.name)) continue;
    const texto = fs.readFileSync(ruta, "utf8");
    for (const m of texto.matchAll(/text-(ciruela|purpura|magenta|crema)(?:\/(\d{1,3}))?\b/g)) {
      const clave = `${m[1]}/${m[2] ?? "100"}`;
      if (!encontradas.has(clave)) encontradas.set(clave, new Set());
      encontradas.get(clave).add(path.relative(process.cwd(), ruta));
    }
  }
  return encontradas;
}

let fallos = 0;
const encontradas = usadas(path.resolve("src"));

console.log("Pareja                  crema     papel");
console.log("─".repeat(52));

for (const [clave, archivos] of [...encontradas].sort()) {
  const [nombre, op] = clave.split("/");
  const alfa = Number(op) / 100;

  // crema como color de texto solo tiene sentido sobre ciruela
  if (nombre === "crema") {
    const r = contraste(mezclar(COLOR.crema, COLOR.ciruela, alfa), COLOR.ciruela);
    const ok = r >= MINIMO;
    if (!ok) fallos++;
    console.log(
      `text-${clave.padEnd(16)} sobre ciruela ${r.toFixed(2)}:1  ${ok ? "ok" : "FALLA"}`
    );
    continue;
  }

  const medidas = Object.entries(FONDOS).map(([, fondo]) =>
    contraste(mezclar(COLOR[nombre], fondo, alfa), fondo)
  );
  const peor = Math.min(...medidas);
  const ok = peor >= MINIMO;
  if (!ok) fallos++;

  console.log(
    `text-${clave.padEnd(16)} ${medidas.map((r) => r.toFixed(2).padStart(5) + ":1").join("  ")}  ${ok ? "ok" : "FALLA  → " + [...archivos].join(", ")}`
  );
}

console.log("─".repeat(52));
if (fallos) {
  console.log(`${fallos} pareja(s) por debajo de ${MINIMO}:1`);
  process.exit(1);
}
console.log(`Todas las parejas usadas pasan AA (${MINIMO}:1).`);
