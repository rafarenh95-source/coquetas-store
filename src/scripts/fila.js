/**
 * SIN USO desde que «Favoritos de Coquetas» pasó a avanzar sola con
 * scripts/carrusel.js (decisión de la dueña). Se conserva por si vuelve a
 * hacer falta una fila deslizable que NO avance sola: basta importarlo y
 * marcar la fila con data-fila / data-fila-pista / data-fila-item.
 *
 * Filas deslizables sin avance automático.
 *
 * El deslizamiento es el scroll nativo con scroll-snap; aquí solo están las
 * flechas para quien usa ratón: avanzan de a una tarjeta y se apagan en los
 * extremos (esta fila no da la vuelta; tiene principio y fin). Con el teclado
 * no hace falta nada: el tabulador recorre las tarjetas y el navegador trae a
 * la vista la que recibe el foco.
 */

const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");

for (const fila of document.querySelectorAll("[data-fila]")) {
  const pista = fila.querySelector("[data-fila-pista]");
  const controles = fila.querySelector("[data-fila-controles]");
  const anterior = fila.querySelector("[data-fila-anterior]");
  const siguiente = fila.querySelector("[data-fila-siguiente]");
  if (!pista) continue;

  const paso = () => {
    const items = pista.querySelectorAll("[data-fila-item]");
    return items[1] ? items[1].offsetLeft - items[0].offsetLeft : pista.clientWidth;
  };

  function pintar() {
    const max = pista.scrollWidth - pista.clientWidth;
    if (controles) controles.hidden = max <= 2;
    if (anterior) anterior.disabled = pista.scrollLeft <= 2;
    if (siguiente) siguiente.disabled = pista.scrollLeft >= max - 2;
  }

  const mover = (sentido) =>
    pista.scrollBy({ left: sentido * paso(), behavior: reducido.matches ? "instant" : "smooth" });

  anterior?.addEventListener("click", () => mover(-1));
  siguiente?.addEventListener("click", () => mover(1));

  /* Un repintado por cuadro como mucho, por rápido que se deslice. */
  let pendiente = false;
  pista.addEventListener(
    "scroll",
    () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        pintar();
      });
    },
    { passive: true }
  );

  window.addEventListener("resize", pintar);
  // Si la página abrió en la grilla, la fila estaba escondida: se mide al verse.
  new IntersectionObserver(([e]) => e.isIntersecting && pintar()).observe(pista);
  pintar();
}
