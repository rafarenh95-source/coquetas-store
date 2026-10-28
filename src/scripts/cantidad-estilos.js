/**
 * Clases del selector de cantidad, en un solo sitio. Las usan el componente
 * Cantidad.astro (tarjeta y ficha) y la bolsa, que dibuja sus filas desde
 * JavaScript. Sin esto, los dos dibujos se separan con el primer retoque.
 *
 * Cada pieza mide 44 × 44: el mínimo para el dedo. El borde es el mismo
 * ciruela/25 de los demás controles de contorno; deshabilitado baja al 30 %
 * de opacidad (se ve, pero se nota que no responde) y cambia el cursor.
 */

export const GRUPO =
  "inline-flex shrink-0 items-stretch rounded-2xl bg-[#fdeef3]";

export const PASO =
  "presionable flex h-[44px] w-[44px] shrink-0 items-center justify-center text-magenta " +
  "disabled:cursor-not-allowed disabled:text-magenta/30";

export const CAMPO =
  "h-[44px] w-[44px] shrink-0 border-0 bg-transparent p-0 text-center " +
  "font-sans text-[16px] font-extrabold text-ciruela tabular-nums " +
  "focus-visible:outline-offset-[-2px]";

/* Trazos de 1,5 px, como el resto de los iconos de la tienda. */
export const ICONO_MENOS =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none"><path d="M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

export const ICONO_MAS =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none"><path d="M3 8h10M8 3v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
