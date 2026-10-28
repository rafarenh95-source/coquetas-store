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
import { fijar, TOPE_SIN_STOCK } from "./cantidad.js";
import { GRUPO, PASO, CAMPO, ICONO_MENOS, ICONO_MAS } from "./cantidad-estilos.js";

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
  avisarCambio();
}

/* Cualquier cambio de la bolsa (aquí, desde la lista o desde otra pestaña)
   se avisa con «bolsa:cambio», para que la ficha ponga al día su «− N +» y
   el total de la barra de abajo. */
function avisarCambio() {
  document.dispatchEvent(new CustomEvent("bolsa:cambio"));
}

/** Unidades de una pieza (con ese tono) que ya están en el pedido. */
export function unidadesDe(item) {
  return leer().find((i) => clave(i) === clave(item))?.cantidad ?? 0;
}

/** Cuántas unidades hay en total y cuánto suman, en dólares. */
export function resumenPedido() {
  const items = leer();
  return {
    unidades: items.reduce((s, i) => s + i.cantidad, 0),
    total: items.reduce((s, i) => s + i.precio * i.cantidad, 0),
  };
}

/**
 * Deja exactamente «n» unidades de la pieza en el pedido (el «− N +» de la
 * ficha). Con 0 o menos, la quita. Respeta el tope. Sin aviso flotante: el
 * número que cambia en el propio control ya lo confirma.
 */
export function fijarUnidades(item, n) {
  const items = leer();
  const k = clave(item);
  if (n <= 0) return escribir(items.filter((i) => clave(i) !== k));
  const cantidad = Math.min(Math.trunc(n), topeDe(item));
  const existente = items.find((i) => clave(i) === k);
  if (existente) existente.cantidad = cantidad;
  else items.push({ ...item, cantidad });
  escribir(items);
}

function clave(item) {
  return `${item.id}::${item.tono ?? ""}`;
}

const topeDe = (item) => (Number(item?.max) >= 1 ? Number(item.max) : TOPE_SIN_STOCK);

/**
 * Agrega «cantidad» unidades. Si la pieza (con ese tono) ya estaba, se suman.
 * Nunca pasa del tope (el stock, si se conoce). Devuelve cuántas entraron de
 * verdad, para que la confirmación no prometa unidades que no se agregaron.
 *
 * Ya no abre la bolsa: con el selector de cantidad, abrirla tapaba la
 * confirmación y obligaba a cerrarla para seguir eligiendo. En su lugar sale
 * un aviso breve con un botón «Ver bolsa».
 */
export function agregar(item, cantidad = 1) {
  const items = leer();
  const maximo = topeDe(item);
  const pedidas = Math.max(1, Math.trunc(Number(cantidad) || 1));
  const existente = items.find((i) => clave(i) === clave(item));
  const yaHabia = existente?.cantidad ?? 0;
  const enBolsa = Math.min(yaHabia + pedidas, maximo);
  const agregadas = enBolsa - yaHabia;

  if (existente) {
    Object.assign(existente, {
      cantidad: enBolsa,
      max: item.max ?? existente.max ?? null,
      imagen: item.imagen || existente.imagen || null,
    });
  }
  else items.push({ ...item, cantidad: enBolsa });
  escribir(items);

  avisarAgregado(item, agregadas, enBolsa, maximo);
  return { agregadas, enBolsa, tope: maximo };
}

function fijarCantidad(k, n) {
  const items = leer().map((i) =>
    clave(i) === k ? { ...i, cantidad: Math.min(Math.max(1, n), topeDe(i)) } : i
  );
  escribir(items);
}

function quitar(k) {
  escribir(leer().filter((i) => clave(i) !== k));
}

/* ── aviso ──────────────────────────────────────────────────────────────────
   Una línea que confirma qué entró, sin robar el foco (role="status" la lee
   el lector de pantalla por su cuenta). Se va sola a los 4 s, salvo mientras
   el dedo, el ratón o el foco están encima. */

let temporizadorAviso = null;
const unidades = (n) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

function avisarAgregado(item, agregadas, enBolsa, maximo) {
  const aviso = document.querySelector("[data-aviso]");
  if (!aviso) return;

  const titulo = aviso.querySelector("[data-aviso-titulo]");
  const detalle = aviso.querySelector("[data-aviso-detalle]");
  const nombre = [item.nombre, item.tono].filter(Boolean).join(" · ");

  if (agregadas > 0) {
    titulo.textContent = `${unidades(agregadas)} ${agregadas === 1 ? "agregada" : "agregadas"}`;
    detalle.textContent = enBolsa > agregadas ? `${nombre} · ${unidades(enBolsa)} en tu bolsa` : nombre;
  } else {
    titulo.textContent = "No se agregó nada";
    detalle.textContent = `Ya tienes el máximo disponible de ${nombre} (${maximo}).`;
  }

  aviso.dataset.visible = "true";
  programarCierreAviso();
}

function programarCierreAviso() {
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(cerrarAviso, 4000);
}

function cerrarAviso(forzar = false) {
  const aviso = document.querySelector("[data-aviso]");
  if (!aviso?.dataset.visible) return;
  if (!forzar && (aviso.matches(":hover") || aviso.contains(document.activeElement)))
    return programarCierreAviso();
  delete aviso.dataset.visible;
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
      unidades === 0
        ? "La bolsa está vacía"
        : `Ver la bolsa, ${unidades} ${unidades === 1 ? "pieza" : "piezas"}`
    );
  }

  const lista = document.querySelector("[data-bolsa-lista]");
  const vacia = document.querySelector("[data-bolsa-vacia]");
  const resumen = document.querySelector("[data-bolsa-resumen]");
  if (!lista) return;

  vacia?.classList.toggle("hidden", unidades > 0);
  resumen?.classList.toggle("hidden", unidades === 0);

  /* La lista se vuelve a dibujar entera en cada cambio. Para no tirar el foco
     de quien la maneja con teclado, se apunta qué control tenía el foco y en
     qué fila, y se le devuelve después. */
  const enfocado = document.activeElement;
  const filaEnfocada = enfocado instanceof Element ? enfocado.closest("[data-clave]") : null;
  const recuerdo = filaEnfocada && lista.contains(filaEnfocada)
    ? {
        clave: filaEnfocada.dataset.clave,
        indice: [...lista.children].indexOf(filaEnfocada),
        control: ["data-cantidad-menos", "data-cantidad-mas", "data-cantidad-valor", "data-quitar"].find((a) =>
          enfocado.hasAttribute(a)
        ),
      }
    : null;

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
    const quien = [i.nombre, i.tono].filter(Boolean).join(" ");

    /* Arriba: nombre y total de la línea. Abajo: cantidad y eliminar. En un
       teléfono de 320 px no caben los cuatro en un renglón sin apretar el
       nombre hasta dejarlo ilegible. */
    const datos = nodo("div", "min-w-0 flex-1");
    datos.append(
      nodo("p", "font-sans text-[15px] leading-tight font-semibold text-ciruela", i.nombre),
      nodo("p", "font-sans text-[13px] leading-snug text-ciruela/60", detalle)
    );
    datos.append(
      nodo(
        "p",
        "mt-1 font-sans text-[15px] leading-tight font-extrabold text-ciruela tabular-nums",
        "$" + dinero.format(i.precio * i.cantidad)
      )
    );
    const enBolivares = tasa
      ? `$${dinero.format(i.referencia * i.cantidad)} · Bs ${dinero.format(i.referencia * i.cantidad * tasa.valor)} en bolívares`
      : `$${dinero.format(i.referencia * i.cantidad)} en bolívares`;
    datos.append(nodo("p", "font-sans text-[12px] leading-snug text-ciruela/70 tabular-nums", enBolivares));
    if (i.cantidad > 1) {
      datos.append(nodo("p", "font-sans text-[12px] text-ciruela/60 tabular-nums", `$${dinero.format(i.precio)} c/u`));
    }

    /* El mismo selector de la tarjeta y la ficha. */
    const grupo = nodo("div", GRUPO);
    grupo.dataset.cantidad = "";
    grupo.dataset.max = String(topeDe(i));
    grupo.setAttribute("role", "group");
    grupo.setAttribute("aria-label", `Cantidad de ${quien}`);

    const paso = (atributo, icono, etiqueta) => {
      const b = nodo("button", PASO);
      b.type = "button";
      b.setAttribute(atributo, "");
      b.setAttribute("aria-label", `${etiqueta} ${quien}`);
      b.innerHTML = icono;
      return b;
    };

    const campo = nodo("input", CAMPO);
    Object.assign(campo, { type: "text", inputMode: "numeric", autocomplete: "off", value: String(i.cantidad) });
    campo.setAttribute("pattern", "[0-9]*");
    campo.setAttribute("enterkeyhint", "done");
    campo.setAttribute("data-cantidad-valor", "");
    campo.setAttribute("role", "spinbutton");
    campo.setAttribute("aria-valuemin", "1");
    campo.setAttribute("aria-label", `Unidades de ${quien}`);

    grupo.append(
      paso("data-cantidad-menos", ICONO_MENOS, "Una unidad menos de"),
      campo,
      paso("data-cantidad-mas", ICONO_MAS, "Una unidad más de")
    );
    fijar(grupo, i.cantidad, { avisar: false });

    const eliminar = nodo(
      "button",
      "presionable inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl text-ciruela/70 hover:text-ciruela"
    );
    eliminar.type = "button";
    eliminar.setAttribute("data-quitar", "");
    eliminar.setAttribute("aria-label", `Eliminar ${quien} del pedido`);
    eliminar.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5h6.6l.7-8.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

    const abajo = nodo("div", "mt-1 flex items-center justify-between gap-2");
    abajo.append(grupo, eliminar);
    datos.append(abajo);

    const fila = nodo("li", "flex items-center gap-3 border-b border-ciruela/10 py-3");
    fila.dataset.clave = k;
    if (i.imagen) {
      const foto = nodo("img", "h-16 w-16 shrink-0 rounded-xl bg-[#fdf1ec] object-contain p-1");
      foto.src = i.imagen;
      foto.alt = "";
      foto.width = 64;
      foto.height = 64;
      foto.loading = "lazy";
      foto.decoding = "async";
      fila.append(foto);
    }
    fila.append(datos);
    lista.appendChild(fila);
  }

  if (recuerdo) {
    const filas = [...lista.children];
    const misma = filas.find((f) => f.dataset.clave === recuerdo.clave);
    let destino = null;
    if (misma) {
      destino = misma.querySelector(`[${recuerdo.control}]`);
      // El «−» se apaga al llegar a 1: el foco pasa al número, no se pierde.
      if (!destino || destino.disabled) destino = misma.querySelector("[data-cantidad-valor]");
    } else {
      // Se eliminó la fila: el foco va a la siguiente, o a cerrar si era la última.
      const vecina = filas[Math.min(recuerdo.indice, filas.length - 1)];
      destino = vecina?.querySelector("[data-quitar]") ?? document.querySelector("[data-bolsa-cerrar]");
    }
    destino?.focus();
  }

  const enDivisa = document.querySelector("[data-bolsa-divisa]");
  if (enDivisa) enDivisa.textContent = `$${dinero.format(subtotal)}`;

  const enBs = document.querySelector("[data-bolsa-bolivares]");
  if (enBs) {
    enBs.textContent = tasa
      ? `$${dinero.format(referencia)} · Bs ${dinero.format(referencia * tasa.valor)} pagando en bolívares`
      : `$${dinero.format(referencia)} pagando en bolívares`;
  }

  const piezasTxt = `${unidades} ${unidades === 1 ? "producto" : "productos"}`;
  for (const n of document.querySelectorAll("[data-bolsa-piezas], [data-barra-piezas]")) {
    n.textContent = piezasTxt;
  }
  const barra = document.querySelector("[data-barra-pedido]");
  if (barra) barra.hidden = unidades === 0;
  const barraDivisa = document.querySelector("[data-barra-divisa]");
  if (barraDivisa) barraDivisa.textContent = `$${dinero.format(subtotal)}`;
  const preview = document.querySelector("[data-bolsa-preview]");
  if (preview) preview.textContent = unidades > 0 ? construirMensaje(items) : "";

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
    /* El pedido vive dentro de .app-shell, al lado del catálogo. Si se
       marcara el shell entero, el panel también quedaría inerte. */
    if (hijo.classList?.contains("app-shell")) {
      const principal = hijo.querySelector(".app-main");
      if (principal) principal.inert = activo;
      continue;
    }
    hijo.inert = activo;
  }
}

/** Un solo sitio donde se pinta la hoja: posición y opacidad del velo van juntas. */
const ESCRITORIO = "(min-width: 1100px)";
const esEscritorio = () => window.matchMedia(ESCRITORIO).matches;

function aplicarModo() {
  const panel = panelEl();
  if (!panel) return;
  if (esEscritorio()) {
    panel.inert = false;
    panel.dataset.abierta = "true";
    panel.dataset.escritorio = "true";
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-modal", "false");
    fondoInerte(false);
    document.body.style.overflow = "";
    posicion = 0;
    const hoja = hojaEl();
    if (hoja) hoja.style.transform = "none";
  } else if (panel.dataset.escritorio) {
    delete panel.dataset.escritorio;
    delete panel.dataset.abierta;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.inert = true;
    pintarHoja(anchoHoja());
  }
}

function pintarHoja(x) {
  if (esEscritorio()) return;
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
  if (esEscritorio()) return;
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
  if (esEscritorio()) return;
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
    if (esEscritorio()) return;
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
  aplicarModo();
  if (!esEscritorio() && !panelEl()?.dataset.abierta && posicion !== null) pintarHoja(anchoHoja());
});

aplicarModo();

/* ── enganches ──────────────────────────────────────────────────────────── */

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;

  const abrirBtn = t.closest("[data-bolsa-abrir], [data-ver-pedido]");
  if (abrirBtn) return abrir();

  if (t.closest("[data-bolsa-cerrar]") || t.closest("[data-bolsa-fondo]")) return cerrar();

  const quitarBtn = t.closest("[data-quitar]");
  const filaQuitar = quitarBtn?.closest("[data-clave]");
  if (filaQuitar) return quitar(filaQuitar.dataset.clave);

  if (t.closest("[data-aviso-ver]")) {
    cerrarAviso(true);
    return abrir();
  }

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

/* El selector de cada fila avisa con «cantidad»; aquí se guarda. */
document.addEventListener("cantidad", (e) => {
  const fila = e.target instanceof Element ? e.target.closest("[data-bolsa-lista] [data-clave]") : null;
  if (fila) fijarCantidad(fila.dataset.clave, e.detail.valor);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrar();
});

pintar();
window.addEventListener("storage", () => {
  pintar();
  avisarCambio();
});
