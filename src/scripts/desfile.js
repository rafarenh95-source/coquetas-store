/**
 * Cinta de fotos de la tienda (BannerTienda.astro).
 *
 * El movimiento lo hace CSS; aquí solo:
 *   · la duración, para que vaya a VELOCIDAD px/s con cualquier ancho de
 *     pantalla (la cinta recorre media vuelta = el ancho de las 4 fotos);
 *   · las pausas que CSS no puede saber solo: dedo apoyado, fuera de
 *     pantalla, y el botón de pausa (que se mantiene hasta volver a tocarlo).
 */

const VELOCIDAD = 40; // px por segundo: la del diseño de la dueña

const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");

for (const raiz of document.querySelectorAll("[data-desfile]")) {
  const pista = raiz.querySelector("[data-desfile-pista]");
  const boton = raiz.querySelector("[data-desfile-pausa]");
  if (!pista) continue;

  let porBoton = false;
  let tocando = false;
  let fuera = false;

  function pintar() {
    const detenido = porBoton || tocando || fuera;
    raiz.toggleAttribute("data-detenido", detenido);
    if (boton) {
      boton.hidden = reducido.matches;
      boton.setAttribute("aria-label", porBoton ? "Reanudar las fotos" : "Pausar las fotos");
      boton.querySelector("[data-icono-pausa]")?.classList.toggle("hidden", porBoton);
      boton.querySelector("[data-icono-reanudar]")?.classList.toggle("hidden", !porBoton);
    }
  }

  /* Media vuelta = la mitad del ancho de la cinta (lleva las fotos dos veces). */
  function medir() {
    const mitad = pista.scrollWidth / 2;
    if (mitad > 0) pista.style.setProperty("--duracion", `${(mitad / VELOCIDAD).toFixed(2)}s`);
  }

  boton?.addEventListener("click", () => {
    porBoton = !porBoton;
    pintar();
  });

  raiz.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || e.target.closest?.("[data-desfile-pausa]")) return;
    tocando = true;
    pintar();
  });
  const soltar = () => {
    if (!tocando) return;
    tocando = false;
    pintar();
  };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
  raiz.addEventListener("touchend", soltar, { passive: true });

  /* Fuera de pantalla no se mueve: no gasta batería en algo que nadie ve. */
  new IntersectionObserver(([e]) => {
    fuera = !e.isIntersecting;
    pintar();
  }).observe(raiz);

  new ResizeObserver(medir).observe(pista);
  reducido.addEventListener?.("change", pintar);

  medir();
  pintar();
}
