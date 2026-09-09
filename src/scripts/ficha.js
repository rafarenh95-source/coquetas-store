/**
 * Ficha de producto: selector de tono, lupa y alta en la bolsa.
 *
 * Los datos del producto vienen del propio HTML (data-*), no de un JSON aparte:
 * la página ya está construida con ellos y duplicarlos sería una forma barata de
 * que se desincronicen.
 */

import { agregar } from "./bolsa.js";

const raiz = document.querySelector("[data-producto]");
if (raiz) {
  const foto = raiz.querySelector("[data-foto]");
  const botones = [...raiz.querySelectorAll('[data-selector-variante] [role="radio"]')];
  const nombreTono = raiz.querySelector("[data-tono-elegido]");
  const avisoAgotado = raiz.querySelector("[data-tono-agotado]");
  const agregarBtn = raiz.querySelector("[data-agregar]");
  const lupa = document.querySelector("[data-lupa]");
  const lupaFoto = document.querySelector("[data-lupa-foto]");

  let elegida = 0;

  const srcset = (src) =>
    [400, 550, 700]
      .map((w) => `${src.replace(".webp", `-${w}.webp`)} ${w}w`)
      .concat(`${src} 1000w`)
      .join(", ");

  function seleccionar(i) {
    elegida = i;
    const boton = botones[i];

    for (const [j, b] of botones.entries()) {
      b.setAttribute("aria-checked", String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    }

    const src = boton?.dataset.imagen;
    if (src && foto) {
      foto.src = src;
      foto.srcset = srcset(src);
      if (lupaFoto) lupaFoto.src = src;
    }

    if (nombreTono) nombreTono.textContent = boton?.dataset.tono ?? "";
    for (const eco of document.querySelectorAll("[data-barra-tono]")) {
      eco.textContent = boton?.dataset.tono ?? "";
    }

    const agotado = boton?.disabled ?? false;
    avisoAgotado?.classList.toggle("hidden", !agotado);
    if (agregarBtn) agregarBtn.disabled = agotado;
    for (const b of document.querySelectorAll("[data-agregar-barra]")) b.disabled = agotado;
  }

  /* Las fotos de los demás tonos se traen de fondo para que el primer cambio
     de tono sea instantáneo. Se precarga la versión de 400 px, no el original
     de 1000: un producto con 14 tonos llegó a bajar 2,6 MB en silencio antes de
     que la clienta tocara nada, en un mercado donde el dato móvil cuesta. La
     versión pequeña basta para el cambio inmediato; si la pantalla es grande,
     el <img> con srcset pide la de mayor tamaño cuando toca de verdad. */
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      for (const b of botones) {
        const src = b.dataset.imagen;
        if (src) new Image().src = src.replace(".webp", "-400.webp");
      }
    });
  }

  for (const [i, b] of botones.entries()) {
    b.addEventListener("click", () => seleccionar(i));
    b.addEventListener("keydown", (e) => {
      let destino = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") destino = (i + 1) % botones.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        destino = (i - 1 + botones.length) % botones.length;
      else if (e.key === "Home") destino = 0;
      else if (e.key === "End") destino = botones.length - 1;
      if (destino === null) return;
      e.preventDefault();
      botones[destino].focus();
      seleccionar(destino);
    });
  }

  /* ── lupa ─────────────────────────────────────────────────────────── */
  raiz.querySelector("[data-ampliar]")?.addEventListener("click", () => lupa?.showModal());
  document.querySelector("[data-lupa-cerrar]")?.addEventListener("click", () => lupa?.close());
  lupa?.addEventListener("click", (e) => {
    if (e.target === lupa) lupa.close();
  });

  /* ── a la bolsa ───────────────────────────────────────────────────── */
  function alaBolsa() {
    agregar({
      id: raiz.dataset.id,
      nombre: raiz.dataset.nombre,
      presentacion: raiz.dataset.presentacion || null,
      precio: Number(raiz.dataset.precio),
      referencia: Number(raiz.dataset.referencia),
      tono: botones[elegida]?.dataset.tono ?? null,
    });
  }

  agregarBtn?.addEventListener("click", alaBolsa);

  /* ── barra persistente ──────────────────────────────────────────────
     Entra justo cuando el botón principal deja de verse. Un observador, no
     un listener de scroll: no se ejecuta en cada pixel. */
  const barras = document.querySelectorAll("[data-barra-producto]");
  const ctaPrincipal = document.querySelector("[data-cta-principal]");

  for (const b of document.querySelectorAll("[data-agregar-barra]")) {
    b.addEventListener("click", alaBolsa);
  }

  if (barras.length && ctaPrincipal) {
    new IntersectionObserver(
      ([entrada]) => {
        for (const b of barras) {
          if (entrada.isIntersecting) delete b.dataset.visible;
          else b.dataset.visible = "true";
        }
      },
      { threshold: 0 }
    ).observe(ctaPrincipal);
  }
}
