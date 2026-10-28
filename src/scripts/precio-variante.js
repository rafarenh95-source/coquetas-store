/**
 * Precio por variante.
 *
 * Algunos productos cambian de precio según la opción (la keratina de 300 ml no
 * cuesta lo mismo que la de 120 ml). El botón de cada opción trae su precio en
 * data-precio / data-referencia; si no lo trae, el producto tiene un solo precio
 * y aquí no se toca nada.
 *
 * Se actualiza el dataset del contenedor (la tarjeta o la ficha), que es de
 * donde lee quien agrega a la bolsa, y lo que se ve: el monto en dólares y el
 * monto en bolívares. El de bolívares se recalcula con la tasa que dejó
 * tasa-bcv.js; si la tasa todavía no llegó, se pinta sola al llegar, porque
 * tasa-bcv.js lee la referencia del propio nodo.
 */

const monto = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function aplicarPrecio(raiz, boton, zonas = [raiz]) {
  const precio = Number(boton?.dataset.precio);
  const referencia = Number(boton?.dataset.referencia);
  if (!(precio > 0) || !(referencia > 0)) return false;

  raiz.dataset.precio = String(precio);
  raiz.dataset.referencia = String(referencia);

  const tasa = Number(document.documentElement.dataset.tasaBcv);
  for (const zona of zonas) {
    for (const n of zona.querySelectorAll("[data-precio-divisa]")) n.textContent = `$${monto.format(precio)}`;
    for (const n of zona.querySelectorAll("[data-precio-referencia]")) n.textContent = `$${monto.format(referencia)}`;
    for (const n of zona.querySelectorAll("[data-bs]")) {
      n.dataset.referencia = String(referencia);
      const m = n.querySelector("[data-bs-monto]");
      if (m && tasa > 0) m.textContent = `Bs ${monto.format(referencia * tasa)}`;
    }
  }
  return true;
}
