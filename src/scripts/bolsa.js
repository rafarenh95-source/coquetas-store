/**
 * La bolsa.
 *
 * Sin backend y sin pasarela: la bolsa vive en el navegador y termina en un solo
 * mensaje de WhatsApp con el detalle, el subtotal en divisa y el equivalente en
 * bolívares con la tasa del día.
 *
 * El mensaje incluye el tono elegido, no solo el nombre del producto. Si no, la
 * tienda recibe pedidos ambiguos y hay que volver a preguntar — justo el trámite
 * que el manual dice que hace desistir a la clienta.
 */

import { proyectar, elastico, resorte, rastreador } from "./resorte.js";

const CLAVE = "coquetas:bolsa";

const dinero = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/* ── estado ─────────────────────────────────────────────────────────────── */

function leer() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function escribir(items) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(items));
  } catch {
    /* modo privado: la bolsa funciona igual durante la visita */
  }
  pintar();
}

function clave(item) {
  return `${item.id}::${item.tono ?? ""}`;
}

export function agregar(item) {
  const items = leer();
  const existente = items.find((i) => clave(i) === clave(item));
  if (existente) existente.cantidad += 1;
  else items.push({ ...item, cantidad: 1 });
  escribir(items);
  abrir();
}

function cambiarCantidad(k, delta) {
  const items = leer()
    .map((i) => (clave(i) === k ? { ...i, cantidad: i.cantidad + delta } : i))
    .filter((i) => i.cantidad > 0);
  escribir(items);
}

/* ── tasa ───────────────────────────────────────────────────────────────── */

function tasaActual() {
  try {
    const g = JSON.parse(localStorage.getItem("coquetas:tasa-bcv") ?? "null");
    if (g?.valor) return g;
  } catch {
    /* sigue al respaldo */
  }
  const respaldo = Number(document.body.dataset.tasaRespaldo);
  return Number.isFinite(respaldo)
    ? { valor: respaldo, fecha: document.body.dataset.tasaFecha }
    : null;
}

/* ── mensaje ────────────────────────────────────────────────────────────── */

function construirMensaje(items) {
  const lineas = items.map((i) => {
    const nombre = [i.nombre, i.presentacion].filter(Boolean).join(" ");
    const tono = i.tono ? ` — ${i.tono}` : "";
    const cantidad = i.cantidad > 1 ? ` × ${i.cantidad}` : "";
    return `• ${nombre}${tono}${cantidad} — $${dinero.format(i.precio * i.cantidad)}`;
  });

  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const enBolivares = items.reduce((s, i) => s + i.referencia * i.cantidad, 0);
  const tasa = tasaActual();

  const partes = [
    "Hola Coquetas Store, quiero pedir:",
    "",
    ...lineas,
    "",
    `Subtotal en divisa: $${dinero.format(subtotal)}`,
  ];

  if (tasa) {
    const fecha = new Date(tasa.fecha);
    const dia = Number.isNaN(fecha.getTime())
      ? ""
      : ` del ${new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long" }).format(fecha)}`;
    partes.push(
      `Pagando en bolívares: $${dinero.format(enBolivares)} · Bs ${dinero.format(enBolivares * tasa.valor)} a la tasa BCV de Bs ${dinero.format(tasa.valor)}${dia}.`
    );
  } else {
    partes.push(`Pagando en bolívares: $${dinero.format(enBolivares)}`);
  }

  return partes.join("\n");
}

/* ── pintado ────────────────────────────────────────────────────────────── */

function pintar() {
  const items = leer();
  const unidades = items.reduce((s, i) => s + i.cantidad, 0);
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const referencia = items.reduce((s, i) => s + i.referencia * i.cantidad, 0);
  const tasa = tasaActual();

  for (const n of document.querySelectorAll("[data-bolsa-cuenta]")) {
    n.textContent = String(unidades);
    n.classList.toggle("hidden", unidades === 0);
  }
  for (const n of document.querySelectorAll("[data-bolsa-abrir]")) {
    n.setAttribute(
      "aria-label",
      unidades === 0 ? "La bolsa está vacía" : `Ver la bolsa, ${unidades} piezas`
    );
  }

  const lista = document.querySelector("[data-bolsa-lista]");
  const vacia = document.querySelector("[data-bolsa-vacia]");
  const resumen = document.querySelector("[data-bolsa-resumen]");
  if (!lista) return;

  vacia?.classList.toggle("hidden", unidades > 0);
  resumen?.classList.toggle("hidden", unidades === 0);
  lista.innerHTML = "";

  const nodo = (etiqueta, clases, texto) => {
    const e = document.createElement(etiqueta);
    e.className = clases;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };

  for (const i of items) {
    const k = clave(i);
    const detalle = [i.presentacion, i.tono].filter(Boolean).join(" · ");

    const datos = nodo("div", "min-w-0");
    datos.append(
      nodo("p", "font-sans text-[15px] leading-tight font-semibold text-ciruela", i.nombre),
      nodo("p", "t-caption text-ciruela/70", detalle),
      nodo("p", "t-caption text-ciruela tabular-nums", "$" + dinero.format(i.precio * i.cantidad))
    );

    const paso = (signo, atributo, etiqueta) => {
      const b = nodo(
        "button",
        "t-etiqueta h-[36px] w-[36px] border border-ciruela/25 text-ciruela hover:border-ciruela",
        signo
      );
      b.type = "button";
      b.setAttribute(atributo, k);
      b.setAttribute("aria-label", `${etiqueta} ${i.nombre}${i.tono ? ` ${i.tono}` : ""}`);
      return b;
    };

    const controles = nodo("div", "flex shrink-0 items-center gap-1");
    controles.append(
      paso("–", "data-menos", "Quitar una unidad de"),
      nodo("span", "t-caption w-[24px] text-center tabular-nums text-ciruela", String(i.cantidad)),
      paso("+", "data-mas", "Agregar una unidad de")
    );

    const fila = nodo(
      "li",
      "flex items-start justify-between gap-2 border-b border-ciruela/10 py-2"
    );
    fila.append(datos, controles);
    lista.appendChild(fila);
  }

  const enDivisa = document.querySelector("[data-bolsa-divisa]");
  if (enDivisa) enDivisa.textContent = `$${dinero.format(subtotal)}`;

  const enBs = document.querySelector("[data-bolsa-bolivares]");
  if (enBs) {
    enBs.textContent = tasa
      ? `Bs ${dinero.format(referencia * tasa.valor)} pagando en bolívares`
      : `$${dinero.format(referencia)} pagando en bolívares`;
  }

  const pedir = document.querySelector("[data-bolsa-pedir]");
  if (pedir instanceof HTMLAnchorElement) {
    const numero = pedir.dataset.whatsapp;
    if (numero) {
      pedir.href = `https://wa.me/${numero}?text=${encodeURIComponent(construirMensaje(items))}`;
    }
  }

  const copiar = document.querySelector("[data-bolsa-copiar]");
  if (copiar) copiar.dataset.mensaje = construirMensaje(items);
}

/* ── panel ──────────────────────────────────────────────────────────────── */

let ultimoFoco = null;
let animacion = null;
let posicion = null; // px desplazados a la derecha; 0 = abierta del todo

const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const panelEl = () => document.querySelector("[data-bolsa-panel]");
const hojaEl = () => document.querySelector("[data-hoja]");
const fondoEl = () => document.querySelector("[data-bolsa-fondo]");

function anchoHoja() {
  return hojaEl()?.getBoundingClientRect().width || 420;
}

/** Deja inerte todo lo que no sea el panel, para que el tabulador no se escape. */
function fondoInerte(activo) {
  for (const hijo of document.body.children) {
    if (hijo.hasAttribute?.("data-bolsa-panel")) continue;
    if (hijo.tagName === "SCRIPT") continue;
    hijo.inert = activo;
  }
}

/** Un solo sitio donde se pinta la hoja: posición y opacidad del velo van juntas. */
function pintarHoja(x) {
  posicion = x;
  const hoja = hojaEl();
  const fondo = fondoEl();
  if (!hoja) return;
  hoja.style.transform = `translateX(${x}px)`;
  if (fondo) fondo.style.opacity = String(Math.max(0, 1 - x / anchoHoja()));
}

/**
 * Arranca siempre del valor que hay en pantalla y hereda la velocidad que
 * traía el gesto. Así no hay costura entre arrastrar y animar, ni salto al
 * interrumpir.
 */
function animarA(destino, velocidad = 0, alTerminar) {
  animacion?.cancelar();

  if (sinMovimiento()) {
    pintarHoja(destino);
    alTerminar?.();
    return;
  }

  animacion = resorte({
    desde: posicion ?? destino,
    hasta: destino,
    velocidad,
    // Sin rebote salvo que el gesto traiga impulso: el rebote en algo que
    // solo se abrió con un clic se siente decorativo.
    amortiguacion: Math.abs(velocidad) > 200 ? 0.8 : 1,
    respuesta: 0.32,
    alPaso: pintarHoja,
    alTerminar,
  });
}

function abrir() {
  const panel = panelEl();
  if (!panel || panel.dataset.abierta) return;

  ultimoFoco = document.activeElement;
  panel.inert = false;
  panel.dataset.abierta = "true";
  document.body.style.overflow = "hidden";
  fondoInerte(true);

  if (posicion === null) posicion = anchoHoja();
  animarA(0);
  panel.querySelector("[data-bolsa-cerrar]")?.focus();
}

function cerrar(velocidad = 0) {
  const panel = panelEl();
  if (!panel || !panel.dataset.abierta) return;

  // El estado se cambia ya; la hoja sigue viva mientras sale para poder
  // agarrarla otra vez a mitad de camino.
  delete panel.dataset.abierta;
  fondoInerte(false);
  document.body.style.overflow = "";

  animarA(anchoHoja(), velocidad, () => {
    if (!panelEl()?.dataset.abierta) panelEl().inert = true;
  });

  if (ultimoFoco instanceof HTMLElement) ultimoFoco.focus();
}

/* ── arrastrar para cerrar ──────────────────────────────────────────────────
   Seguimiento 1:1 con el dedo, resistencia creciente al tirar hacia el otro
   lado, y al soltar se decide por dónde iba el gesto —no por dónde quedó—
   proyectando el impulso como hace la inercia del scroll. */

function conectarArrastre() {
  const hoja = hojaEl();
  if (!hoja) return;

  const pista = rastreador();
  let idPuntero = null;
  let inicioX = 0;
  let inicioY = 0;
  let inicioPos = 0;
  let arrastrando = false;
  let descartado = false;

  const UMBRAL = 10; // px antes de comprometerse con una dirección

  hoja.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!panelEl()?.dataset.abierta) return;

    // Interrumpir: se toma el valor vivo, no el destino lógico.
    animacion?.cancelar();
    animacion = null;

    idPuntero = e.pointerId;
    inicioX = e.clientX;
    inicioY = e.clientY;
    inicioPos = posicion ?? 0;
    arrastrando = false;
    descartado = false;
    pista.limpiar();
    pista.anotar(inicioPos);
  });

  hoja.addEventListener("pointermove", (e) => {
    if (e.pointerId !== idPuntero || descartado) return;

    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;

    if (!arrastrando) {
      if (Math.abs(dx) < UMBRAL && Math.abs(dy) < UMBRAL) return;
      // Si el gesto es sobre todo vertical, es un desplazamiento de la lista:
      // se cede al navegador y no se vuelve a mirar hasta el siguiente toque.
      if (Math.abs(dy) > Math.abs(dx)) {
        descartado = true;
        return;
      }
      arrastrando = true;
      hoja.setPointerCapture(idPuntero);
    }

    let x = inicioPos + dx;
    // Hacia la izquierda no hay nada más: resistencia en vez de tope duro.
    if (x < 0) x = -elastico(-x, anchoHoja());

    pista.anotar(x);
    pintarHoja(x);
  });

  function soltar(e) {
    if (e.pointerId !== idPuntero) return;
    idPuntero = null;
    if (!arrastrando) return;
    arrastrando = false;

    const velocidad = pista.velocidad();
    const proyectado = (posicion ?? 0) + proyectar(velocidad);

    if (proyectado > anchoHoja() * 0.4) cerrar(velocidad);
    else animarA(0, velocidad);
  }

  hoja.addEventListener("pointerup", soltar);
  hoja.addEventListener("pointercancel", soltar);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", conectarArrastre);
} else {
  conectarArrastre();
}

window.addEventListener("resize", () => {
  if (!panelEl()?.dataset.abierta && posicion !== null) pintarHoja(anchoHoja());
});

/* ── enganches ──────────────────────────────────────────────────────────── */

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;

  const abrirBtn = t.closest("[data-bolsa-abrir]");
  if (abrirBtn) return abrir();

  if (t.closest("[data-bolsa-cerrar]") || t.closest("[data-bolsa-fondo]")) return cerrar();

  const menos = t.closest("[data-menos]");
  if (menos) return cambiarCantidad(menos.getAttribute("data-menos"), -1);

  const mas = t.closest("[data-mas]");
  if (mas) return cambiarCantidad(mas.getAttribute("data-mas"), 1);

  const copiar = t.closest("[data-bolsa-copiar]");
  if (copiar) {
    navigator.clipboard?.writeText(copiar.dataset.mensaje ?? "").then(() => {
      const aviso = copiar.querySelector("[data-bolsa-copiado]");
      if (!aviso) return;
      aviso.classList.remove("hidden");
      setTimeout(() => aviso.classList.add("hidden"), 2500);
    });
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrar();
});

pintar();
window.addEventListener("storage", pintar);
