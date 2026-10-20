/**
 * Cinta de fotos de la tienda (BannerTienda.astro).
 *
 * El movimiento lo hace CSS; aquí solo:
 *   · la duración, para que vaya a VELOCIDAD px/s con cualquier ancho de
 *     pantalla (la cinta recorre media vuelta = el ancho de las 4 fotos);
 *   · las pausas que CSS no puede saber solo: dedo apoyado y fuera de
 *     pantalla (sin botón de pausa: la dueña lo quitó).
 */

const VELOCIDAD = 40; // px por segundo: la del diseño de la dueña

const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");

for (const raiz of document.querySelectorAll("[data-desfile]")) {
  const pista = raiz.querySelector("[data-desfile-pista]");
  if (!pista) continue;

  let tocando = false;
  let fuera = false;

  function pintar() {
    raiz.toggleAttribute("data-detenido", tocando || fuera);
  }

  /* Media vuelta = la mitad del ancho de la cinta (lleva las fotos dos veces). */
  function medir() {
    const mitad = pista.scrollWidth / 2;
    if (mitad > 0) pista.style.setProperty("--duracion", `${(mitad / VELOCIDAD).toFixed(2)}s`);
  }

  raiz.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
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
