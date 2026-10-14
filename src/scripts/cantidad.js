/**
 * Selector de cantidad: «−», número, «+».
 *
 * El mismo control en la tarjeta, en la ficha y en cada fila de la bolsa. Un
 * solo escuchador por delegación para todos, como en las tarjetas.
 *
 * El número se puede escribir a mano. Mientras se escribe no se toca (corregir
 * a cada tecla hace saltar el cursor); se valida al salir del campo o con Enter:
 * vacío, cero o negativo → 1; decimal → la parte entera; más que el tope → el
 * tope. Las flechas ↑ y ↓ suben y bajan, como en cualquier campo numérico.
 *
 * El tope es el stock si el producto lo trae (data-max). Hoy los datos no
 * tienen stock, así que vale TOPE_SIN_STOCK: sin límite, un dedo que se queda
 * apoyado en «+» o un «1000» escrito por error llegan intactos al WhatsApp.
 *
 * Cada cambio dispara el evento «cantidad» en el grupo, con { valor }. Quien
 * necesite reaccionar (la bolsa, el precio del botón en la ficha) lo escucha.
 */

export const TOPE_SIN_STOCK = 99;

export function tope(grupo) {
  const m = Number.parseInt(grupo?.dataset.max ?? "", 10);
  return Number.isFinite(m) && m >= 1 ? m : TOPE_SIN_STOCK;
}

/** Convierte lo que haya escrito en un entero válido entre 1 y el tope. */
export function sanear(texto, maximo = TOPE_SIN_STOCK) {
  const n = Number.parseFloat(String(texto ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.trunc(n), maximo);
}

const campo = (grupo) => grupo.querySelector("[data-cantidad-valor]");

export function valor(grupo) {
  const c = campo(grupo);
  return c ? sanear(c.value, tope(grupo)) : 1;
}

/** Pone el número, ajusta los botones y avisa del cambio. */
export function fijar(grupo, n, { avisar = true } = {}) {
  const c = campo(grupo);
  if (!c) return;
  const maximo = tope(grupo);
  const v = sanear(n, maximo);
  const anterior = c.dataset.anterior;

  c.value = String(v);
  c.dataset.anterior = String(v);
  c.setAttribute("aria-valuenow", String(v));
  c.setAttribute("aria-valuemax", String(maximo));

  const menos = grupo.querySelector("[data-cantidad-menos]");
  const mas = grupo.querySelector("[data-cantidad-mas]");
  if (menos) menos.disabled = v <= 1;
  if (mas) mas.disabled = v >= maximo;

  if (avisar && anterior !== String(v)) {
    grupo.dispatchEvent(new CustomEvent("cantidad", { bubbles: true, detail: { valor: v } }));
  }
}

/** Cambia el tope (otro tono con otro stock) y recorta el número si hace falta. */
export function fijarTope(grupo, maximo) {
  if (!grupo) return;
  if (maximo) grupo.dataset.max = String(maximo);
  else delete grupo.dataset.max;
  fijar(grupo, valor(grupo));
}

/* ── enganches ──────────────────────────────────────────────────────────── */

document.addEventListener("click", (e) => {
  const t = e.target instanceof Element ? e.target : null;
  const boton = t?.closest("[data-cantidad-menos], [data-cantidad-mas]");
  if (!boton || boton.disabled) return;
  const grupo = boton.closest("[data-cantidad]");
  if (!grupo) return;
  const paso = boton.hasAttribute("data-cantidad-mas") ? 1 : -1;
  fijar(grupo, valor(grupo) + paso);
});

/* «change» llega al salir del campo o con Enter; nunca a mitad de escribir. */
document.addEventListener("change", (e) => {
  const c = e.target instanceof Element ? e.target.closest("[data-cantidad-valor]") : null;
  const grupo = c?.closest("[data-cantidad]");
  if (grupo) fijar(grupo, c.value);
});

document.addEventListener("keydown", (e) => {
  const c = e.target instanceof Element ? e.target.closest("[data-cantidad-valor]") : null;
  const grupo = c?.closest("[data-cantidad]");
  if (!grupo) return;

  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    fijar(grupo, valor(grupo) + (e.key === "ArrowUp" ? 1 : -1));
  } else if (e.key === "Home") {
    e.preventDefault();
    fijar(grupo, 1);
  } else if (e.key === "End") {
    e.preventDefault();
    fijar(grupo, tope(grupo));
  } else if (e.key === "Enter") {
    e.preventDefault();
    fijar(grupo, c.value);
  }
});

/* Al entrar al campo se selecciona el número: escribir lo reemplaza, que es
   lo que se quiere el 99 % de las veces. */
document.addEventListener("focusin", (e) => {
  const c = e.target instanceof HTMLInputElement && e.target.matches("[data-cantidad-valor]") ? e.target : null;
  if (c) requestAnimationFrame(() => c.select());
});

/* Estado inicial de los que vienen en el HTML (− deshabilitado en 1). */
for (const grupo of document.querySelectorAll("[data-cantidad]")) fijar(grupo, valor(grupo), { avisar: false });
