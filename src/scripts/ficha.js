/**
 * Ficha de producto: selector de tono, lupa y alta en la bolsa.
 *
 * Los datos del producto vienen del propio HTML (data-*), no de un JSON aparte:
 * la página ya está construida con ellos y duplicarlos sería una forma barata de
 * que se desincronicen.
 */

import { unidadesDe, fijarUnidades, resumenPedido } from "./bolsa.js";
import { TOPE_SIN_STOCK } from "./cantidad.js";
import { aplicarPrecio } from "./precio-variante.js";

const monto = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const raiz = document.querySelector("[data-producto]");
if (raiz) {
  const foto = document.querySelector("[data-foto]");
  const botones = [...raiz.querySelectorAll('[data-selector-variante] [role="radio"]')];
  const nombreTono = raiz.querySelector("[data-tono-elegido]");
  const avisoAgotado = raiz.querySelector("[data-tono-agotado]");
  const agregarBtn = raiz.querySelector("[data-agregar]");
  const lupa = document.querySelector("[data-lupa]");
  const lupaFoto = document.querySelector("[data-lupa-foto]");
  const enPedido = raiz.querySelector("[data-en-pedido]");
  const menos = raiz.querySelector("[data-pedido-menos]");
  const mas = raiz.querySelector("[data-pedido-mas]");
  const numero = raiz.querySelector("[data-pedido-n]");
  const subtotal = raiz.querySelector("[data-pedido-subtotal]");
  // se lee al momento: con precio por opción cambia al elegir otra
  const precioActual = () => Number(raiz.dataset.precio);
  const stockDe = (boton) => Number(boton?.dataset.stock) || Number(raiz.dataset.stock) || null;

  /* El botón «Agregar al pedido» dice el precio de una unidad. */
  function pintarTotal() {
    const texto = `$${monto.format(precioActual())}`;
    for (const t of document.querySelectorAll("[data-precio-total]")) {
      t.textContent = `\u00a0· ${texto}`;
    }
  }
  pintarTotal();

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

    if (aplicarPrecio(raiz, boton, [raiz])) pintarTotal();
    pintarPedido();
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
  document.querySelector("[data-ampliar]")?.addEventListener("click", () => lupa?.showModal());
  document.querySelector("[data-lupa-cerrar]")?.addEventListener("click", () => lupa?.close());
  lupa?.addEventListener("click", (e) => {
    if (e.target === lupa) lupa.close();
  });

  /* ── al pedido ───────────────────────────────────────────────────── */
  const pieza = () => ({
    id: raiz.dataset.id,
    nombre: raiz.dataset.nombre,
    presentacion: raiz.dataset.presentacion || null,
    precio: precioActual(),
    referencia: Number(raiz.dataset.referencia),
    tono: botones[elegida]?.dataset.tono ?? null,
    imagen: botones[elegida]?.dataset.imagen || foto?.getAttribute("src") || null,
    max: stockDe(botones[elegida]),
  });

  /* Si la pieza (con este tono) ya está en el pedido, en lugar del botón va
     «− N +»; si no, el botón. También pone al día la barra de abajo. */
  function pintarPedido() {
    const n = unidadesDe(pieza());
    const agotado = botones[elegida]?.disabled ?? false;
    const focoDentro = enPedido?.contains(document.activeElement);
    if (enPedido && agregarBtn) {
      enPedido.hidden = n === 0;
      agregarBtn.hidden = n > 0;
      if (n === 0 && focoDentro) agregarBtn.focus();
    }
    if (numero) numero.textContent = String(n);
    if (subtotal) {
      subtotal.textContent = n > 1 ? `${n} × $${monto.format(precioActual())} = $${monto.format(n * precioActual())}` : "";
    }
    if (mas) mas.disabled = agotado || n >= (stockDe(botones[elegida]) ?? TOPE_SIN_STOCK);
    if (menos) menos.setAttribute("aria-label", n === 1 ? "Quitar del pedido" : "Quitar una unidad");

    const { unidades, total } = resumenPedido();
    for (const t of document.querySelectorAll("[data-pedido-total]")) t.textContent = `$${monto.format(total)}`;
    for (const t of document.querySelectorAll("[data-pedido-unidades]")) {
      t.textContent = unidades === 0 ? "Tu pedido" : `Tu pedido · ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`;
    }
  }

  agregarBtn?.addEventListener("click", () => {
    // sin aviso flotante: el «− 1 +» que aparece y la barra ya lo confirman
    fijarUnidades(pieza(), unidadesDe(pieza()) + 1);
    if (enPedido && !enPedido.hidden) mas?.focus();
  });
  mas?.addEventListener("click", () => fijarUnidades(pieza(), unidadesDe(pieza()) + 1));
  menos?.addEventListener("click", () => fijarUnidades(pieza(), unidadesDe(pieza()) - 1));
  document.addEventListener("bolsa:cambio", pintarPedido);
  pintarPedido();

  /* ── barra persistente ──────────────────────────────────────────────
     Entra justo cuando el botón principal deja de verse. Un observador, no
     un listener de scroll: no se ejecuta en cada pixel. */
  const barras = document.querySelectorAll("[data-barra-producto]:not([data-siempre])");
  const ctaPrincipal = document.querySelector("[data-cta-principal]");

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
