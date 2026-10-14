/**
 * Carrusel de categorías.
 *
 * El deslizamiento es el scroll nativo del navegador con scroll-snap: la
 * inercia y el encaje los hace el navegador en su propio hilo, así que el dedo
 * va fluido incluso con la página ocupada o en un teléfono de gama baja. Este
 * script solo decide adónde ir; nunca mueve píxeles por su cuenta.
 *
 * Vuelta sin fin: detrás de las tarjetas reales va una copia de todas. Al
 * pasar de la última se entra en la copia, idéntica, y cuando el movimiento
 * termina se salta en silencio a la tarjeta real equivalente. Las copias no
 * existen para el lector de pantalla ni para el tabulador.
 *
 * Avance solo: cada 3,5 s, con el desplazamiento suave del navegador. Se
 * detiene mientras se toca, se arrastra, se pasa el ratón o hay foco dentro;
 * mientras no se ve (otra vista, otra pestaña, fuera de pantalla), y siempre
 * que el sistema pida movimiento reducido. El botón de pausa lo detiene hasta
 * que se vuelva a tocar.
 */

const INTERVALO = 3500;
const ESPERA_TRAS_SOLTAR = 1500; // tiempo para mirar lo que se dejó a la vista

const raiz = document.querySelector("[data-carrusel]");
const pista = raiz?.querySelector("[data-carrusel-pista]");

if (raiz && pista) {
  const reales = [...pista.querySelectorAll("[data-carrusel-diapositiva]")];
  const n = reales.length;
  const controles = raiz.querySelector("[data-carrusel-controles]");
  const botonPausa = raiz.querySelector("[data-carrusel-pausa]");
  const puntosCaja = raiz.querySelector("[data-carrusel-puntos]");
  const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ── copias para la vuelta sin fin ───────────────────────────────────── */
  for (const d of reales) {
    const copia = d.cloneNode(true);
    copia.removeAttribute("role");
    copia.removeAttribute("aria-roledescription");
    copia.removeAttribute("aria-label");
    copia.setAttribute("aria-hidden", "true");
    copia.dataset.copia = "";
    for (const f of copia.querySelectorAll("a, button, input")) f.tabIndex = -1;
    // Las fotos de las copias ya están en caché; que no compitan al cargar.
    for (const img of copia.querySelectorAll("img")) {
      img.loading = "lazy";
      img.removeAttribute("fetchpriority");
    }
    pista.appendChild(copia);
  }

  /* ── medidas ─────────────────────────────────────────────────────────── */
  let paso = 0; // ancho de una tarjeta + hueco
  let vuelta = 0; // ancho de todas las tarjetas reales

  function medir() {
    paso = reales[1] ? reales[1].offsetLeft - reales[0].offsetLeft : reales[0].offsetWidth;
    vuelta = paso * n;
  }

  /** Si todas las tarjetas caben a la vez, no hay nada que deslizar. */
  const hayDesborde = () => pista.scrollWidth / 2 > pista.clientWidth + 2;

  const indiceActual = () => {
    if (!paso) return 0;
    const i = Math.round(pista.scrollLeft / paso);
    return ((i % n) + n) % n;
  };

  /* ── puntos ──────────────────────────────────────────────────────────── */
  const puntos = Array.from({ length: n }, () => {
    const p = document.createElement("span");
    p.className =
      "h-[6px] w-[6px] rounded-full bg-ciruela/25 transition-colors duration-[var(--paso)]";
    puntosCaja?.appendChild(p);
    return p;
  });

  function pintarPuntos() {
    const actual = indiceActual();
    puntos.forEach((p, i) => {
      p.classList.toggle("bg-ciruela", i === actual);
      p.classList.toggle("bg-ciruela/25", i !== actual);
    });
  }

  /* ── movimiento ──────────────────────────────────────────────────────── */
  const suave = () => (movimientoReducido.matches ? "instant" : "smooth");

  function irA(posicion) {
    pista.scrollTo({ left: posicion, behavior: suave() });
  }

  function siguiente() {
    if (!paso) return;
    irA((Math.round(pista.scrollLeft / paso) + 1) * paso);
  }

  function anterior() {
    if (!paso) return;
    let i = Math.round(pista.scrollLeft / paso);
    if (i <= 0) {
      // Desde la primera: salto invisible a su copia, y de ahí hacia atrás.
      pista.scrollTo({ left: vuelta, behavior: "instant" });
      i = n;
    }
    irA((i - 1) * paso);
  }

  /** Dentro de la copia → a la tarjeta real equivalente, sin que se note. */
  function normalizar() {
    if (tocando) return;
    if (pista.scrollLeft >= vuelta - 1) {
      pista.scrollTo({ left: pista.scrollLeft - vuelta, behavior: "instant" });
    }
    pintarPuntos();
  }

  /* «scrollend» donde existe; si no, el último «scroll» tras 150 ms de calma. */
  let calma = null;
  if ("onscrollend" in window) {
    pista.addEventListener("scrollend", normalizar);
    pista.addEventListener("scroll", pintarPuntos, { passive: true });
  } else {
    pista.addEventListener(
      "scroll",
      () => {
        pintarPuntos();
        clearTimeout(calma);
        calma = setTimeout(normalizar, 150);
      },
      { passive: true }
    );
  }

  /* ── avance solo ─────────────────────────────────────────────────────── */
  let pausadoPorBoton = false;
  let tocando = false;
  let encima = false;
  let conFoco = false;
  let visible = false;
  let temporizador = null;

  const puedeAvanzar = () =>
    !pausadoPorBoton &&
    !tocando &&
    !encima &&
    !conFoco &&
    visible &&
    !document.hidden &&
    !movimientoReducido.matches &&
    hayDesborde();

  function programar(espera = INTERVALO) {
    clearTimeout(temporizador);
    temporizador = null;
    if (!puedeAvanzar()) return;
    temporizador = setTimeout(() => {
      if (puedeAvanzar()) siguiente();
      programar();
    }, espera);
  }

  /* Mientras avanza solo, el lector de pantalla no anuncia cada cambio
     (sería ruido cada 3,5 s); detenido, sí anuncia lo que se mueve a mano. */
  function pintarEstado() {
    const andando = puedeAvanzar();
    pista.setAttribute("aria-live", andando ? "off" : "polite");
    if (botonPausa) {
      botonPausa.setAttribute("aria-label", pausadoPorBoton ? "Reanudar el carrusel" : "Pausar el carrusel");
      botonPausa.querySelector("[data-icono-pausa]")?.classList.toggle("hidden", pausadoPorBoton);
      botonPausa.querySelector("[data-icono-reanudar]")?.classList.toggle("hidden", !pausadoPorBoton);
      // Sin avance automático posible (movimiento reducido), el botón sobra.
      botonPausa.hidden = movimientoReducido.matches;
    }
  }

  function actualizar(espera) {
    pintarEstado();
    programar(espera);
  }

  /* Tocar o arrastrar: se detiene mientras el dedo está; al soltar, espera un
     poco antes de seguir para dar tiempo a mirar. */
  pista.addEventListener("pointerdown", () => {
    tocando = true;
    actualizar();
  });
  const soltar = () => {
    if (!tocando) return;
    tocando = false;
    actualizar(INTERVALO + ESPERA_TRAS_SOLTAR);
  };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
  // En el teléfono, un deslizamiento lo toma el scroll y no siempre llega pointerup.
  pista.addEventListener("touchend", soltar, { passive: true });

  /* Ratón encima: solo con puntero fino; en pantallas táctiles el «hover» lo
     dispara el propio toque y quedaría pausado para siempre. */
  const conRaton = window.matchMedia("(hover: hover) and (pointer: fine)");
  raiz.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse" && conRaton.matches) {
      encima = true;
      actualizar();
    }
  });
  raiz.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") {
      encima = false;
      actualizar();
    }
  });

  /* Solo el foco de teclado detiene: en Android, tocar una flecha la deja
     enfocada y el carrusel quedaría quieto hasta tocar otra cosa. */
  raiz.addEventListener("focusin", (e) => {
    conFoco = e.target instanceof Element && e.target.matches(":focus-visible");
    actualizar();
  });
  raiz.addEventListener("focusout", (e) => {
    if (raiz.contains(e.relatedTarget)) return;
    conFoco = false;
    actualizar();
  });

  /* ── controles ───────────────────────────────────────────────────────── */
  botonPausa?.addEventListener("click", () => {
    pausadoPorBoton = !pausadoPorBoton;
    actualizar();
  });
  /* Una flecha reinicia la cuenta: que no avance solo un instante después
     de haberlo movido a mano. */
  raiz.querySelector("[data-carrusel-anterior]")?.addEventListener("click", () => {
    anterior();
    actualizar();
  });
  raiz.querySelector("[data-carrusel-siguiente]")?.addEventListener("click", () => {
    siguiente();
    actualizar();
  });

  /* Teclado: con el foco en una tarjeta, ← y → pasan a la vecina (y la
     enfocan, así el navegador la trae a la vista). Tab sigue funcionando. */
  pista.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const actual = e.target instanceof Element ? e.target.closest("[data-carrusel-diapositiva]") : null;
    const i = reales.indexOf(actual);
    if (i < 0) return;
    e.preventDefault();
    const destino = reales[(i + (e.key === "ArrowRight" ? 1 : -1) + n) % n];
    destino.querySelector("a")?.focus({ preventScroll: true });
    irA(destino.offsetLeft - reales[0].offsetLeft);
  });

  /* ── cuándo se ve ────────────────────────────────────────────────────── */
  new IntersectionObserver(
    ([entrada]) => {
      visible = entrada.isIntersecting;
      // Si la página abrió en la grilla, el carrusel estaba escondido y no se
      // pudo medir: se mide al aparecer.
      if (visible && !paso) prepararMedidas();
      actualizar();
    },
    { threshold: 0.5 }
  ).observe(pista);

  document.addEventListener("visibilitychange", () => actualizar());
  movimientoReducido.addEventListener?.("change", () => actualizar());

  let esperaMedida = null;
  window.addEventListener("resize", () => {
    clearTimeout(esperaMedida);
    esperaMedida = setTimeout(() => {
      const i = indiceActual();
      prepararMedidas();
      if (paso) pista.scrollTo({ left: i * paso, behavior: "instant" });
      actualizar();
    }, 150);
  });

  function prepararMedidas() {
    medir();
    const desborda = paso > 0 && hayDesborde();
    if (controles) controles.hidden = !desborda;
    if (puntosCaja) puntosCaja.hidden = !desborda;
    pintarPuntos();
  }

  /* ── arranque ────────────────────────────────────────────────────────── */
  prepararMedidas();
  pintarEstado();
}
