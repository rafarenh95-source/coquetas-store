/**
 * Auditor de marca — solo corre en desarrollo.
 *
 * Convierte la lista de prohibiciones del manual en comprobaciones automáticas
 * sobre el DOM ya pintado. No maquilla nada: grita en consola y marca el
 * elemento culpable con un contorno para que se vea en pantalla.
 *
 * Cubre los puntos de la checklist de aceptación que se pueden verificar sin
 * ojo humano. Los que no (proporción de color, "¿se coló estética de rebaja?")
 * quedan para la revisión visual.
 */

const ROSAS = ["rgb(247, 104, 161)", "rgb(250, 159, 181)", "rgb(252, 197, 192)"];
const ORO = "rgb(214, 192, 154)";
const BLANCO = "rgb(255, 255, 255)";
const FONDOS_LOGO = ["rgb(254, 235, 226)", "rgb(255, 248, 244)"]; // crema · papel

const fallos = [];

function marcar(el, mensaje) {
  fallos.push({ el, mensaje });
  el.style.outline = "2px dashed #C5188A";
  el.style.outlineOffset = "2px";
}

function tieneTexto(el) {
  return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
}

function auditar() {
  fallos.length = 0;

  /* ── recursos que solo pueden aparecer una vez por vista ──────────────── */
  for (const [sel, nombre, max] of [
    ["[data-filete]", "filete de oro", 1],
    ["[data-franja]", "franja de marca", 1],
    ["[data-trama]", "trama de fondo", 1],
  ]) {
    const n = document.querySelectorAll(sel).length;
    if (n > max) {
      document.querySelectorAll(sel).forEach((el) => marcar(el, `${n} ${nombre} en la vista, el máximo es ${max}`));
    }
  }

  /* ── recorrido por todo el DOM visible ────────────────────────────────── */
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);

    // Rosa y oro no son colores de texto: contraste 2.44:1 y 1.53:1 (manual §9)
    if (tieneTexto(el)) {
      if (ROSAS.includes(s.color)) marcar(el, `texto en rosa (${s.color}) — solo ornamental`);
      if (s.color === ORO) marcar(el, "texto en oro — el oro es filete, nunca tipografía");
    }

    // No existe el blanco puro como superficie
    if (s.backgroundColor === BLANCO) {
      marcar(el, "fondo blanco puro — usar papel #FFF8F4");
    }

    // Didot nunca bajo 24 px, nunca en minúsculas, nunca bold ni itálica
    if (s.fontFamily.includes("GFS Didot")) {
      const px = parseFloat(s.fontSize);
      if (px < 24) marcar(el, `Didot a ${px}px — el mínimo del manual es 24px`);
      if (s.textTransform !== "uppercase") marcar(el, "Didot fuera de mayúsculas");
      if (parseInt(s.fontWeight, 10) > 400) marcar(el, "Didot en bold — solo existe Regular");
      if (s.fontStyle !== "normal") marcar(el, "Didot en itálica — no existe");
    }

    // Solo dos familias
    const fam = s.fontFamily;
    if (!fam.includes("GFS Didot") && !fam.includes("Montserrat") && tieneTexto(el)) {
      marcar(el, `tercera tipografía: ${fam}`);
    }

    // Degradados entre colores de marca
    if (s.backgroundImage.includes("gradient")) {
      marcar(el, "degradado — prohibido entre colores de marca");
    }
  }

  /* ── el logo solo sobre crema o papel (manual §5 y §6) ────────────────── */
  for (const logo of document.querySelectorAll("[data-logo]")) {
    let padre = logo.parentElement;
    let fondo = "rgba(0, 0, 0, 0)";
    while (padre && fondo === "rgba(0, 0, 0, 0)") {
      fondo = getComputedStyle(padre).backgroundColor;
      padre = padre.parentElement;
    }
    if (!FONDOS_LOGO.includes(fondo)) {
      marcar(logo, `logo sobre ${fondo} — solo va sobre crema o papel`);
    }
  }

  /* ── informe ──────────────────────────────────────────────────────────── */
  if (fallos.length === 0) {
    console.log("%c✓ auditor de marca — sin fallos", "color:#7A0177;font-weight:600");
  } else {
    console.groupCollapsed(
      `%c✗ auditor de marca — ${fallos.length} fallo${fallos.length > 1 ? "s" : ""}`,
      "color:#C5188A;font-weight:600"
    );
    for (const f of fallos) console.warn(f.mensaje, f.el);
    console.groupEnd();
  }
}

if (document.readyState === "complete") {
  requestAnimationFrame(auditar);
} else {
  window.addEventListener("load", () => requestAnimationFrame(auditar));
}

document.addEventListener("astro:page-load", () => requestAnimationFrame(auditar));
