/**
 * Coquetas — foto de catálogo a partir de una imagen sobre fondo CREMA.
 *
 * Por qué existe: `procesar-fotos.mjs` recorta el fondo BLANCO a transparencia.
 * Con envases blancos (tapas, potes, frascos claros) no puede distinguir el
 * envase del fondo: se come el borde o la tapa entera, y sobre el crema de la
 * tarjeta el producto se ve «mimetizado», sin contorno.
 *
 * Aquí la foto llega ya sobre crema (Higgsfield con `prompt-fondo-crema.txt`):
 * el blanco del envase y el crema del fondo son colores distintos, así que el
 * fondo se separa por relleno desde los bordes sin tocar ni un píxel blanco del
 * producto. Después se encaja igual que las demás fotos (78 % del alto, 80 % del
 * ancho, base al 90 %), sin sombra, y se generan los mismos tamaños.
 *
 *   node scripts/procesar-fotos-crema.mjs "C:/carpeta/con/ID-NN.png" ...
 *
 * Cada archivo se llama como la foto que reemplaza (p. ej. PR-LISITA-110-01.png).
 * Luego: node scripts/tamano-intermedio.mjs --solo=ID1,ID2
 */
import path from "node:path";
import sharp from "sharp";

const DESTINO = path.resolve("public/img/productos");
const LIENZO = 1000;
const ALTO_MAXIMO = 0.78;
const ANCHO_MAXIMO = 0.8;
const LINEA_BASE = 0.9;
const CERCA = 4; // por debajo de esta distancia al crema es fondo pleno (el fondo de la IA varía ±2)
const LEJOS = 10; // por encima es producto; entre ambos, el suavizado del borde

async function procesar(ruta) {
  const nombre = path.parse(ruta).name;
  const { data, info } = await sharp(ruta).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  // Color del fondo: mediana de un marco de 4 px.
  const muestras = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x > 3 && y > 3 && x < w - 4 && y < h - 4) continue;
    const i = (y * w + x) * 3;
    for (let c = 0; c < 3; c++) muestras[c].push(data[i + c]);
  }
  const fondo = muestras.map((m) => m.sort((a, b) => a - b)[m.length >> 1]);
  const dist = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 3;
    // Además del color, el tono: el crema es cálido (rojo > azul) y un envase blanco es neutro.
    // Así un blanco no se confunde con un crema muy claro.
    const tibio = Math.abs((data[i] - data[i + 2]) - (fondo[0] - fondo[2]));
    dist[p] = Math.max(Math.abs(data[i] - fondo[0]), Math.abs(data[i + 1] - fondo[1]), Math.abs(data[i + 2] - fondo[2]), tibio);
  }

  // Relleno desde los bordes: solo es fondo lo conectado con el marco.
  const esFondo = new Uint8Array(w * h);
  const pila = [];
  for (let x = 0; x < w; x++) pila.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) pila.push(y * w, y * w + w - 1);
  while (pila.length) {
    const p = pila.pop();
    if (esFondo[p] || dist[p] >= LEJOS) continue;
    esFondo[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) pila.push(p - 1);
    if (x < w - 1) pila.push(p + 1);
    if (y > 0) pila.push(p - w);
    if (y < h - 1) pila.push(p + w);
  }

  // Alfa: lo que no es fondo, sólido; el borde, suavizado; y las motas semitransparentes
  // sueltas (lejos de lo sólido) se descartan, para que no quede ningún velo.
  const alfa = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) alfa[p] = esFondo[p] ? Math.min(1, Math.max(0, (dist[p] - CERCA) / (LEJOS - CERCA))) : 1;
  const R = 3, solido = new Uint8Array(w * h), tmp = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (alfa[p] >= 0.98) solido[p] = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solido[y * w + x]) for (let k = Math.max(0, x - R); k <= Math.min(w - 1, x + R); k++) tmp[y * w + k] = 1;
  const cerca = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (tmp[y * w + x]) for (let k = Math.max(0, y - R); k <= Math.min(h - 1, y + R); k++) cerca[k * w + x] = 1;
  for (let p = 0; p < w * h; p++) if (!cerca[p]) alfa[p] = 0;

  // Piezas: se conservan las grandes (el producto, aunque venga en dos partes) y se
  // descartan las rayas y motas que la IA deja sueltas en el fondo.
  const pieza = new Int32Array(w * h).fill(-1), areas = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (alfa[p0] <= 0 || pieza[p0] >= 0) continue;
    const id = areas.length; let area = 0; const cola = [p0]; pieza[p0] = id;
    while (cola.length) {
      const p = cola.pop(); area++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && alfa[q] > 0 && pieza[q] < 0) { pieza[q] = id; cola.push(q); }
      }
    }
    areas.push(area);
  }
  const mayor = Math.max(...areas);
  for (let p = 0; p < w * h; p++) if (pieza[p] >= 0 && areas[pieza[p]] < mayor * 0.02) alfa[p] = 0;

  // Color sin el crema mezclado en el borde.
  const rgba = Buffer.alloc(w * h * 4);
  const cols = new Int32Array(w), filas = new Int32Array(h);
  for (let p = 0; p < w * h; p++) {
    const a = alfa[p];
    const i = p * 3, o = p * 4;
    for (let c = 0; c < 3; c++) {
      const v = a > 0 ? (data[i + c] - (1 - a) * fondo[c]) / a : 0;
      rgba[o + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
    rgba[o + 3] = Math.round(a * 255);
    if (a > 0.5) { cols[p % w]++; filas[(p / w) | 0]++; }
  }

  // Caja del producto: filas y columnas con más de 5 píxeles sólidos (ignora motas sueltas).
  const rango = (v) => { let a = -1, b = -1; v.forEach((n, i) => { if (n > 5) { if (a < 0) a = i; b = i; } }); return [a, b]; };
  const [x0, x1] = rango(cols), [y0, y1] = rango(filas);
  const ancho = x1 - x0 + 1, alto = y1 - y0 + 1;
  const escala = Math.min((LIENZO * ALTO_MAXIMO) / alto, (LIENZO * ANCHO_MAXIMO) / ancho);
  const anchoFinal = Math.round(ancho * escala), altoFinal = Math.round(alto * escala);
  const producto = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: ancho, height: alto })
    .resize(anchoFinal, altoFinal, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const izquierda = Math.round((LIENZO - anchoFinal) / 2);
  const arriba = Math.max(0, Math.round(LIENZO * LINEA_BASE - altoFinal));
  const lienzo = await sharp({ create: { width: LIENZO, height: LIENZO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: producto, left: izquierda, top: arriba }])
    .png()
    .toBuffer();

  await sharp(lienzo).webp({ quality: 82, effort: 4 }).toFile(path.join(DESTINO, `${nombre}.webp`));
  for (const lado of [700, 400]) {
    await sharp(lienzo).resize(lado, lado).webp({ quality: 80, effort: 4 }).toFile(path.join(DESTINO, `${nombre}-${lado}.webp`));
  }
  console.log(`${nombre.padEnd(30)} fondo ${fondo.join(",")} · ${anchoFinal}×${altoFinal}`);
}

for (const ruta of process.argv.slice(2)) await procesar(ruta);
