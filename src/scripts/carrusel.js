/**
 * Carruseles de la portada («Favoritos de Coquetas» y «Categorías»).
 *
 * El deslizamiento es el scroll nativo del navegador con scroll-snap: la
 * inercia y el encaje los hace el navegador en su propio hilo, así que el dedo
 * va fluido incluso con la página ocupada o en un teléfono de gama baja. Este
 * script solo decide adónde ir; nunca mueve píxeles por su cuenta.
 *
 * Vuelta sin fin: detrás de las tarjetas reales va una copia de todas. Al
 * pasar de la última se entra en la copia, idéntica, y cuando el movimiento
 * termina se salta en silencio a la tarjeta real equivalente. Las copias no
 * existen para el lector de pantalla ni para el tabulador (aunque con el dedo
 * funcionan igual que las reales).
 *
 * Avance solo: de a una tarjeta, con el desplazamiento suave del navegador, y
 * PAUSA quieto entre un avance y el siguiente (contada desde que el
 * movimiento termina, no desde que empieza). Se detiene mientras se toca, se
 * arrastra, se pasa el ratón o hay foco de teclado dentro; mientras no se ve
 * (otra vista, otra pestaña, fuera de pantalla), y siempre que el sistema pida
 * movimiento reducido. El botón de pausa lo detiene hasta que se vuelva a
 * tocar.
 */

const PAUSA = 1300; // decisión de la dueña: 1,3 s quieto entre avance y avance
const ESPERA_TRAS_SOLTAR = 1500; // tiempo extra para mirar lo que se dejó a la vista
const GUARDIA_MOVIMIENTO = 1500; // si «scrollend» no llega, se sigue igual

const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)");
const conRaton = window.matchMedia("(hover: hover) and (pointer: fine)");

for (const raiz of document.querySelectorAll("[data-carrusel]")) iniciar(raiz);

function iniciar(raiz) {
  const pista = raiz.querySelector("[data-carrusel-pista]");
  const reales = pista ? [...pista.querySelectorAll("[data-carrusel-diapositiva]")] : [];
  const n = reales.length;
  if (n < 2) return;

  const botonPausa = raiz.querySelector("[data-carrusel-pausa]");
  const flechaAnterior = raiz.querySelector("[data-carrusel-anterior]");
  const flechaSiguiente = raiz.querySelector("[data-carrusel-siguiente]");
  const flechas = [flechaAnterior, flechaSiguiente].filter(Boolean);
  const puntosCaja = raiz.querySelector("[data-carrusel-puntos]");
  const desfase = Number(raiz.dataset.desfase) || 0;

  /* ── copias para la vuelta sin fin ───────────────────────────────────── */
  for (const d of reales) {
    const copia = d.cloneNode(true);
    copia.removeAttribute("role");
    copia.removeAttribute("aria-roledescription");
    copia.removeAttribute("aria-label");
    copia.setAttribute("aria-hidden", "true");
    copia.dataset.copia = "";
    for (const f of copia.querySelectorAll("a, button, input, [tabindex]")) f.tabIndex = -1;
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
    paso = reales[1].offsetLeft - reales[0].offsetLeft;
    vuelta = paso * n;
  }

  /** Si todas las tarjetas caben a la vez, no hay nada que deslizar. */
  const hayDesborde = () => paso > 0 && pista.scrollWidth / 2 > pista.clientWidth + 2;

  const indiceActual = () => {
    if (!paso) return 0;
    const i = Math.round(pista.scrollLeft / paso);
    return ((i % n) + n) % n;
  };

  /* Las flechas van a la altura del centro de las fotos, no del centro de la
     tarjeta entera (que incluye nombre, precio y botones). */
  function posicionarFlechas() {
    const foto = reales[0].querySelector(".aspect-square");
    const caja = flechas[0]?.parentElement;
    if (!foto || !caja) return;
    const r = foto.getBoundingClientRect();
    const centro = r.top - caja.getBoundingClientRect().top + r.height / 2;
    for (const f of flechas) f.style.top = `${Math.round(centro)}px`;
  }

  /* ── puntos ──────────────────────────────────────────────────────────── */
  const puntos = Array.from({ length: n }, () => {
    const p = document.createElement("span");
    p.className = "h-[6px] w-[6px] rounded-full bg-ciruela/25 transition-colors duration-[var(--paso)]";
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

  function siguiente() {
    if (!paso) return;
    pista.scrollTo({ left: (Math.round(pista.scrollLeft / paso) + 1) * paso, behavior: suave() });
  }

  function anterior() {
    if (!paso) return;
    let i = Math.round(pista.scrollLeft / paso);
    if (i <= 0) {
      // Desde la primera: salto invisible a su copia, y de ahí hacia atrás.
      pista.scrollTo({ left: vuelta, behavior: "instant" });
      i = n;
    }
    pista.scrollTo({ left: (i - 1) * paso, behavior: suave() });
  }

  /** Dentro de la copia → a la tarjeta real equivalente, sin que se note. */
  function alTerminarDesplazamiento() {
    if (tocando) return;
    if (paso && pista.scrollLeft >= vuelta - 1) {
      pista.scrollTo({ left: pista.scrollLeft - vuelta, behavior: "instant" });
    }
    pintarPuntos();
    terminarAvance();
  }

  /* «scrollend» donde existe; si no, el último «scroll» tras 150 ms de calma. */
  let calma = null;
  if ("onscrollend" in window) {
    pista.addEventListener("scrollend", alTerminarDesplazamiento);
    pista.addEventListener("scroll", pintarPuntos, { passive: true });
  } else {
    pista.addEventListener(
      "scroll",
      () => {
        pintarPuntos();
        clearTimeout(calma);
        calma = setTimeout(alTerminarDesplazamiento, 150);
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
  let guardia = null;
  let moviendo = false;
  let primeraVez = true;

  const puedeAvanzar = () =>
    !pausadoPorBoton &&
    !tocando &&
    !encima &&
    !conFoco &&
    visible &&
    !document.hidden &&
    !movimientoReducido.matches &&
    hayDesborde();

  function programar(espera = PAUSA) {
    clearTimeout(temporizador);
    temporizador = null;
    if (!puedeAvanzar()) return;
    if (primeraVez) {
      espera += desfase; // la segunda fila arranca un poco después que la primera
      primeraVez = false;
    }
    temporizador = setTimeout(avanzar, espera);
  }

  function avanzar() {
    if (!puedeAvanzar()) return;
    moviendo = true;
    siguiente();
    clearTimeout(guardia);
    guardia = setTimeout(terminarAvance, GUARDIA_MOVIMIENTO);
  }

  /* La pausa se cuenta desde que el movimiento termina. */
  function terminarAvance() {
    if (!moviendo) return;
    moviendo = false;
    clearTimeout(guardia);
    programar(PAUSA);
  }

  /* Mientras avanza solo, el lector de pantalla no anuncia cada cambio
     (sería ruido cada pocos segundos); detenido, sí anuncia lo que se mueve
     a mano. */
  function pintarEstado() {
    pista.setAttribute("aria-live", puedeAvanzar() ? "off" : "polite");
    if (botonPausa) {
      botonPausa.setAttribute("aria-label", pausadoPorBoton ? "Reanudar el carrusel" : "Pausar el carrusel");
      botonPausa.querySelector("[data-icono-pausa]")?.classList.toggle("hidden", pausadoPorBoton);
      botonPausa.querySelector("[data-icono-reanudar]")?.classList.toggle("hidden", !pausadoPorBoton);
      // Sin avance automático posible, el botón sobra.
      botonPausa.hidden = movimientoReducido.matches || !hayDesborde();
    }
  }

  /** Cualquier cambio de estado: se repinta y se vuelve a contar desde cero. */
  function actualizar(espera = PAUSA) {
    moviendo = false;
    clearTimeout(guardia);
    pintarEstado();
    programar(espera);
  }

  /* Tocar o arrastrar: se detiene mientras el dedo está; al soltar, espera un
     poco más antes de seguir para dar tiempo a mirar. */
  pista.addEventListener("pointerdown", () => {
    tocando = true;
    actualizar();
  });
  const soltar = () => {
    if (!tocando) return;
    tocando = false;
    actualizar(PAUSA + ESPERA_TRAS_SOLTAR);
  };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
  // En el teléfono, un deslizamiento lo toma el scroll y no siempre llega pointerup.
  pista.addEventListener("touchend", soltar, { passive: true });

  /* Ratón encima: solo con puntero fino; en pantallas táctiles el «hover» lo
     dispara el propio toque y quedaría pausado para siempre. */
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
  /* Una flecha reinicia la cuenta: que no avance solo justo después de
     haberlo movido a mano. */
  flechaAnterior?.addEventListener("click", () => {
    anterior();
    actualizar(PAUSA + ESPERA_TRAS_SOLTAR);
  });
  flechaSiguiente?.addEventListener("click", () => {
    siguiente();
    actualizar(PAUSA + ESPERA_TRAS_SOLTAR);
  });

  /* Teclado: con el foco en el enlace de una tarjeta, ← y → pasan a la vecina
     (y la enfocan). Solo en el enlace: dentro de la tarjeta de un producto
     las flechas ya sirven para elegir el tono o mover el cursor del número. */
  pista.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if (!(e.target instanceof HTMLAnchorElement)) return;
    const i = reales.indexOf(e.target.closest("[data-carrusel-diapositiva]"));
    if (i < 0) return;
    e.preventDefault();
    const destino = reales[(i + (e.key === "ArrowRight" ? 1 : -1) + n) % n];
    destino.querySelector("a")?.focus({ preventScroll: true });
    pista.scrollTo({ left: destino.offsetLeft - reales[0].offsetLeft, behavior: suave() });
  });

  /* ── cuándo se ve ────────────────────────────────────────────────────── */
  new IntersectionObserver(
    ([entrada]) => {
      if (entrada.isIntersecting && !paso) prepararMedidas();
      // Avanza solo si se ve al menos la mitad.
      visible = entrada.intersectionRatio >= 0.5;
      actualizar();
    },
    { threshold: [0, 0.5] }
  ).observe(pista);

  /* Al pasar de escondido (vista de grilla) a visible, o al cambiar de
     tamaño la pantalla, se vuelve a medir. */
  let esperaMedida = null;
  new ResizeObserver(() => {
    clearTimeout(esperaMedida);
    esperaMedida = setTimeout(() => {
      if (pista.clientWidth === 0) return;
      const i = indiceActual();
      prepararMedidas();
      if (paso) pista.scrollTo({ left: i * paso, behavior: "instant" });
      actualizar();
    }, 100);
  }).observe(pista);

  document.addEventListener("visibilitychange", () => actualizar());
  movimientoReducido.addEventListener?.("change", () => actualizar());

  function prepararMedidas() {
    medir();
    const desborda = hayDesborde();
    for (const f of flechas) f.hidden = !desborda;
    if (puntosCaja) puntosCaja.hidden = !desborda;
    posicionarFlechas();
    pintarPuntos();
  }

  /* ── arranque ────────────────────────────────────────────────────────── */
  prepararMedidas();
  pintarEstado();
}
