/**
 * Tarjetas del catálogo: elegir tono y agregar sin abrir la ficha.
 *
 * La mayoría de las compras son de piezas que la clienta ya conoce. Obligarla a
 * entrar en la ficha y volver por cada una es cobrarle dos navegaciones por algo
 * que ya tenía decidido. La ficha sigue ahí para quien quiera leer el modo de
 * uso o el rendimiento.
 *
 * Un solo escuchador por delegación para las treinta y cinco tarjetas. Uno por
 * tarjeta y otro por swatch serían cientos de escuchadores para un catálogo que
 * cabe en pantalla y media.
 */

import { agregar } from "./bolsa.js";

const srcset = (src) =>
  [400, 550, 700]
    .map((w) => `${src.replace(".webp", `-${w}.webp`)} ${w}w`)
    .concat(`${src} 1000w`)
    .join(", ");

function seleccionar(tarjeta, boton) {
  const radios = [...tarjeta.querySelectorAll('[role="radio"]')];

  for (const r of radios) {
    const activo = r === boton;
    r.setAttribute("aria-checked", String(activo));
    r.tabIndex = activo ? 0 : -1;
  }

  /* La foto cambia al tono elegido. Es lo único que responde de verdad a la
     duda de «¿llegará igual que en la foto?», que es la frenada número uno. */
  const foto = tarjeta.querySelector("[data-foto-tarjeta]");
  const src = boton.dataset.imagen;
  if (foto && src) {
    foto.src = src;
    foto.srcset = srcset(src);
  }

  const nombre = tarjeta.querySelector("[data-tono-elegido]");
  if (nombre) nombre.textContent = boton.dataset.tono ?? "";

  const agotado = Boolean(boton.disabled);
  tarjeta.querySelector("[data-tono-agotado]")?.classList.toggle("hidden", !agotado);

  const btn = tarjeta.querySelector("[data-agregar-tarjeta]");
  if (btn) btn.disabled = agotado;
}

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;

  const tarjeta = t.closest("[data-tarjeta]");
  if (!tarjeta) return;

  const radio = t.closest('[role="radio"]');
  if (radio) {
    seleccionar(tarjeta, radio);
    return;
  }

  const boton = t.closest("[data-agregar-tarjeta]");
  if (!boton) return;

  const variante = tarjeta.querySelector('[role="radio"][aria-checked="true"]');

  agregar({
    id: tarjeta.dataset.id,
    nombre: tarjeta.dataset.nombre,
    presentacion: tarjeta.dataset.presentacion || null,
    precio: Number(tarjeta.dataset.precio),
    referencia: Number(tarjeta.dataset.referencia),
    tono: variante?.dataset.tono ?? null,
  });
});

/* Flechas dentro del grupo de tonos, igual que en la ficha. */
document.addEventListener("keydown", (e) => {
  const radio = e.target instanceof Element ? e.target.closest('[role="radio"]') : null;
  const tarjeta = radio?.closest("[data-tarjeta]");
  if (!tarjeta) return;

  const radios = [...tarjeta.querySelectorAll('[role="radio"]')];
  const i = radios.indexOf(radio);

  let destino = null;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") destino = (i + 1) % radios.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    destino = (i - 1 + radios.length) % radios.length;
  else if (e.key === "Home") destino = 0;
  else if (e.key === "End") destino = radios.length - 1;
  if (destino === null) return;

  e.preventDefault();
  radios[destino].focus();
  seleccionar(tarjeta, radios[destino]);
});
