/**
 * Tasa BCV del día.
 *
 * El catálogo cambia cada varios meses pero la tasa cambia a diario. Los dos
 * ritmos se resuelven por separado: el sitio se reconstruye cuando hay
 * productos nuevos, y la tasa se busca en el cliente al cargar la página. Así
 * no hace falta reconstruir el sitio entero todos los días por el tipo de
 * cambio.
 *
 * La Ley Orgánica de Precios Justos obliga a expresar el precio según la tasa
 * oficial vigente, así que el monto en bolívares nunca puede ser un número fijo
 * y siempre se muestra junto a la tasa y la fecha con la que se calculó.
 *
 * Cascada, de mejor a peor, para que nunca falte un precio en bolívares:
 *   1. La API pública (tiene CORS abierto).
 *   2. La última tasa buena guardada en el navegador, avisando si está vieja.
 *   3. La tasa de respaldo horneada en el build, avisando siempre.
 */

const FUENTE = "https://ve.dolarapi.com/v1/dolares/oficial";
const CLAVE = "coquetas:tasa-bcv";
const VIGENCIA = 6 * 60 * 60 * 1000; // 6 h

const bolivares = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fechaLarga = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long" });

function leerCache() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo);
    if (!guardado?.valor) return null;
    return guardado;
  } catch {
    return null;
  }
}

function guardarCache(valor, fecha) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ valor, fecha, guardado: Date.now() }));
  } catch {
    /* modo privado o almacenamiento lleno: no es motivo para romper la página */
  }
}

async function obtenerTasa(respaldo) {
  const cache = leerCache();
  const fresca = cache && Date.now() - cache.guardado < VIGENCIA;

  if (fresca) return { ...cache, confiable: true };

  try {
    const r = await fetch(FUENTE, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const valor = Number(d.promedio ?? d.venta ?? d.compra);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error("tasa inválida");

    const fecha = d.fechaActualizacion ?? new Date().toISOString();
    guardarCache(valor, fecha);
    return { valor, fecha, confiable: true };
  } catch {
    if (cache) return { ...cache, confiable: false };
    return respaldo ? { ...respaldo, confiable: false } : null;
  }
}

function pintar(tasa) {
  const fecha = new Date(tasa.fecha);
  const etiquetaFecha = Number.isNaN(fecha.getTime()) ? "" : fechaLarga.format(fecha);

  for (const nodo of document.querySelectorAll("[data-bs]")) {
    const referencia = Number(nodo.dataset.referencia);
    if (!Number.isFinite(referencia)) continue;

    const monto = nodo.querySelector("[data-bs-monto]");
    if (monto) monto.textContent = `Bs ${bolivares.format(referencia * tasa.valor)}`;
    nodo.classList.remove("hidden");
  }

  for (const linea of document.querySelectorAll("[data-bs-tasa-linea]")) {
    const texto = linea.querySelector("[data-bs-tasa]");
    if (texto) {
      texto.textContent = tasa.confiable
        ? `Tasa BCV Bs ${bolivares.format(tasa.valor)} del ${etiquetaFecha}.`
        : `Tasa BCV Bs ${bolivares.format(tasa.valor)} del ${etiquetaFecha}. Puede no ser la de hoy; se confirma al hacer el pedido.`;
    }
    linea.classList.remove("hidden");
  }
}

async function iniciar() {
  const nodo = document.querySelector("[data-tasa-respaldo]");
  const respaldo = nodo?.dataset.tasaRespaldo
    ? {
        valor: Number(nodo.dataset.tasaRespaldo),
        fecha: nodo.dataset.tasaFecha ?? new Date().toISOString(),
      }
    : null;

  const tasa = await obtenerTasa(respaldo);
  if (tasa) pintar(tasa);
}

iniciar();
