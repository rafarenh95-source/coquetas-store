/**
 * Resortes y proyección de impulso.
 *
 * Una transición CSS no se puede agarrar a mitad de camino: tiene una duración
 * fija y un destino fijo. Un resorte no tiene duración —el tiempo de reposo
 * sale de sus parámetros— y arranca siempre del valor que hay en pantalla, que
 * es justo lo que hace falta para poder interrumpirlo y darle la vuelta.
 *
 * Se implementa aquí en treinta líneas en vez de traer una librería, porque el
 * sitio entero pesa 427 kB y esta es la única superficie que lo necesita.
 *
 * Los dos parámetros son los de Apple, no los de la física:
 *   amortiguacion  1.0 = llega y se queda quieto · <1 = rebota
 *   respuesta      segundos hasta alcanzar el destino. No es duración.
 */

/**
 * Dónde acabaría el dedo si lo soltamos aquí a esta velocidad.
 * Es la misma curva de desaceleración del scroll, no la fórmula de libro
 * v²/(2a): se proyecta para elegir destino, no para frenar.
 */
export function proyectar(velocidad, deceleracion = 0.998) {
  return ((velocidad / 1000) * deceleracion) / (1 - deceleracion);
}

/**
 * Resistencia progresiva al pasarse de un borde. Un tope duro se lee como
 * «se trabó»; la resistencia creciente se lee como «responde, pero aquí se
 * acaba».
 */
export function elastico(exceso, dimension, constante = 0.55) {
  return (exceso * dimension * constante) / (dimension + constante * Math.abs(exceso));
}

/**
 * Devuelve un mando con el que parar el resorte y leer su valor y velocidad
 * en vivo — eso último es lo que permite encadenar una animación nueva sin
 * salto ni frenazo.
 */
export function resorte({
  desde,
  hasta,
  velocidad = 0,
  amortiguacion = 1,
  respuesta = 0.35,
  alPaso,
  alTerminar,
}) {
  const omega = (2 * Math.PI) / respuesta;
  let x = desde;
  let v = velocidad;
  let anterior = performance.now();
  let id = 0;
  let vivo = true;

  function paso(ahora) {
    // Se acota el delta para que una pestaña en segundo plano no dispare el
    // integrador al volver.
    const dt = Math.min((ahora - anterior) / 1000, 1 / 30);
    anterior = ahora;

    const aceleracion = -omega * omega * (x - hasta) - 2 * amortiguacion * omega * v;
    v += aceleracion * dt;
    x += v * dt;

    if (Math.abs(x - hasta) < 0.3 && Math.abs(v) < 8) {
      x = hasta;
      v = 0;
      vivo = false;
      alPaso(x);
      alTerminar?.();
      return;
    }

    alPaso(x);
    id = requestAnimationFrame(paso);
  }

  id = requestAnimationFrame(paso);

  return {
    cancelar() {
      vivo = false;
      cancelAnimationFrame(id);
    },
    get vivo() {
      return vivo;
    },
    get valor() {
      return x;
    },
    get velocidad() {
      return v;
    },
  };
}

/** Historial corto de posiciones para calcular la velocidad al soltar. */
export function rastreador() {
  const muestras = [];
  return {
    anotar(valor) {
      muestras.push({ valor, t: performance.now() });
      if (muestras.length > 6) muestras.shift();
    },
    /**
     * px por segundo, medidos sobre los últimos ~100 ms.
     *
     * Dos cautelas que no son teóricas: si dos muestras llegan con muy poco
     * tiempo entre ellas, dividir por ese delta da una velocidad disparatada y
     * la proyección manda la hoja al otro extremo. Por eso se exige una
     * separación mínima de un frame, y se acota el resultado a algo que una
     * mano pueda producir de verdad.
     */
    velocidad() {
      if (muestras.length < 2) return 0;

      const ultima = muestras.at(-1);

      // La muestra más antigua dentro de la ventana que esté al menos a un
      // frame de distancia; si ninguna lo está, no hay medida fiable.
      const previa = muestras.find(
        (m) => ultima.t - m.t <= 100 && ultima.t - m.t >= 8
      );
      if (!previa) return 0;

      const dt = (ultima.t - previa.t) / 1000;
      const v = (ultima.valor - previa.valor) / dt;

      const TOPE = 4000; // px/s: por encima de esto no hay gesto humano
      return Math.max(-TOPE, Math.min(TOPE, v));
    },
    limpiar() {
      muestras.length = 0;
    },
  };
}
