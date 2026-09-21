/**
 * Coquetas — de foto cruda a foto de catálogo, con la API de imágenes de OpenAI.
 *
 * Las fotos del catálogo son de estudio: el producto de frente y centrado, sobre
 * blanco puro, luz suave y pareja, la etiqueta nítida y los colores fieles. Las
 * fotos que se toman en la tienda no son así (fondo desordenado, manos, poca
 * luz), y para pasar de unas a otras hace falta redibujar la escena. Eso lo hace
 * el modelo de imágenes; este script solo lo prepara, lo pide y lo revisa.
 *
 * Esto NO reemplaza a `procesar-fotos.mjs`. Este script deja la foto sobre
 * blanco; el recorte a transparencia y el encuadre común siguen siendo de
 * `procesar-fotos.mjs`, para que las fotos nuevas pasen por exactamente el mismo
 * camino que las que ya están en la página.
 *
 * EL RIESGO, dicho claro: un modelo generativo no «limpia» la foto, la vuelve a
 * dibujar. Puede desviar un poco el tono de un esmalte o inventar una letra de
 * la etiqueta cuando la foto original no se lee. En este catálogo el tono es lo
 * que la clienta compra, así que cada resultado se deja junto a su original en
 * `revision/` y hay que mirarlo antes de darlo por bueno.
 *
 *   node scripts/editar-fotos-ia.mjs --seco          # solo lista, no gasta nada
 *   node scripts/editar-fotos-ia.mjs --max 2         # procesa como mucho 2
 *   node scripts/editar-fotos-ia.mjs --archivo "esmalte 3.jpg"
 *
 * La clave va en el archivo `.env` (OPENAI_API_KEY=...), que Git ignora. Nunca
 * se imprime ni se guarda en otro sitio.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/* ── Configuración ──────────────────────────────────────────────────────── */

const ENTRADA_POR_DEFECTO = "C:/Users/conch/Downloads/fotos crudas";
const SALIDA_POR_DEFECTO = "C:/Users/conch/Downloads/fotos editadas ia";
const REVISION = path.resolve("revision");
const LADO_MAXIMO_ENVIO = 2048; // más grande no mejora el resultado y sube el peso

const PROMPT = [
  "Edit this product photo into a professional e-commerce catalog photo.",
  "Keep the exact same product: identical shape, proportions, colors, materials, logo and every piece of text on the label.",
  "Do not redraw, rename, translate or invent any text. If some label text is too blurry to read, leave it soft and blurry as it is instead of making up words.",
  "Remove everything that is not the product: the background and any signs, letters or logos in it (they are not part of the product), the surface it sits on, hands and fingers, props, room reflections, dust and clutter.",
  "If part of the product is hidden by a hand or cut off by the edge of the photo, complete it faithfully following the visible design, and never add details that the visible parts do not imply.",
  "If the photo shows a set or several units together, keep the whole set together, with the same number of items as in the photo.",
  "Place the product centered, upright and straight-on, on a pure seamless white background (#FFFFFF), with soft even studio lighting,",
  "a very subtle soft contact shadow directly under it, sharp focus and clean edges.",
  "Keep the product's colors natural and accurate: do not enhance, saturate or shift them.",
  "The product fills about 80% of the frame height. Square composition. Do not add any text, watermark, border or extra objects.",
].join(" ");

const PROMPT_REFERENCIA =
  " The second image is only a style reference for the lighting, framing and clean white background. Do not copy its product; edit the product from the first image.";

/* ── Argumentos y .env ──────────────────────────────────────────────────── */

function leerArgumentos(lista) {
  const a = { _: [] };
  for (let i = 0; i < lista.length; i++) {
    const t = lista[i];
    if (!t.startsWith("--")) {
      a._.push(t);
      continue;
    }
    const clave = t.slice(2);
    const siguiente = lista[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) a[clave] = true;
    else {
      a[clave] = siguiente;
      i++;
    }
  }
  return a;
}

function cargarEnv(ruta) {
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    const valor = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (valor && process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

const args = leerArgumentos(process.argv.slice(2));
cargarEnv(path.resolve(".env"));

const ENTRADA = String(args.entrada ?? ENTRADA_POR_DEFECTO);
const SALIDA = String(args.salida ?? SALIDA_POR_DEFECTO);
/* gpt-image-2 fue el único de los tres probados (gpt-image-1, 1.5 y 2) que copió
   la etiqueta sin errores: 1.5 cambió «UV&LED» por «UV/LED» y 1 escribió «UVILED». */
const MODELO = String(args.modelo ?? "gpt-image-2");
const CALIDAD = String(args.calidad ?? "high");
const MAXIMO = Number(args.max ?? 3); // tope de seguridad: cada imagen cuesta dinero
const BASE_API = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

/* ── Llamada a la API ───────────────────────────────────────────────────── */

class ErrorApi extends Error {
  constructor(mensaje, { fatal = false } = {}) {
    super(mensaje);
    this.fatal = fatal; // si es fatal no tiene sentido seguir con las demás fotos
  }
}

function explicar(status, cuerpo) {
  const detalle = cuerpo?.error?.message ?? "sin detalle";
  if (status === 401)
    return new ErrorApi("OpenAI no reconoce la clave (401). Revisa que esté completa en el archivo .env.", { fatal: true });
  if (status === 403)
    return new ErrorApi(
      `OpenAI negó el acceso (403). Suele pasar cuando el modelo de imágenes pide verificar la organización en su panel. Detalle: ${detalle}`,
      { fatal: true }
    );
  if (status === 429)
    return new ErrorApi(
      `OpenAI dice que no hay cupo o saldo (429). Revisa el saldo y los límites de la cuenta. Detalle: ${detalle}`,
      { fatal: true }
    );
  return new ErrorApi(`OpenAI respondió ${status}: ${detalle}`);
}

async function pedirEdicion(imagenes, { conFidelidad = !/^gpt-image-2/.test(MODELO) } = {}) {
  const form = new FormData();
  form.append("model", MODELO);
  form.append("prompt", PROMPT + (imagenes.length > 1 ? PROMPT_REFERENCIA : ""));
  form.append("size", "1024x1024");
  form.append("quality", CALIDAD);
  form.append("n", "1");
  form.append("output_format", "png");
  if (conFidelidad) form.append("input_fidelity", "high"); // conserva logo y texto de la etiqueta
  imagenes.forEach((buf, i) =>
    form.append("image[]", new Blob([buf], { type: "image/png" }), `imagen-${i + 1}.png`)
  );

  const res = await fetch(`${BASE_API}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const cuerpo = await res.json().catch(() => null);

  /* Si el modelo elegido no acepta input_fidelity, se reintenta sin él en vez de
     abortar; se avisa para que se sepa que esa foto salió con menos fidelidad. */
  if (!res.ok && conFidelidad && /input_fidelity/i.test(cuerpo?.error?.message ?? "")) {
    console.log("    (este modelo no acepta input_fidelity; se reintenta sin él)");
    return pedirEdicion(imagenes, { conFidelidad: false });
  }
  if (!res.ok) throw explicar(res.status, cuerpo);

  const b64 = cuerpo?.data?.[0]?.b64_json;
  if (!b64) throw new ErrorApi("La respuesta de OpenAI no trajo ninguna imagen.");
  return { png: Buffer.from(b64, "base64"), uso: cuerpo.usage ?? null };
}

/* ── Preparación y revisión ─────────────────────────────────────────────── */

async function prepararEnvio(ruta) {
  return sharp(ruta)
    .rotate() // respeta la orientación que guardó el teléfono
    .resize({ width: LADO_MAXIMO_ENVIO, height: LADO_MAXIMO_ENVIO, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

/* Antes a la izquierda, después a la derecha: es lo que hay que mirar. */
async function hojaDeRevision(original, editada, destino) {
  const LADO = 700;
  const [a, b] = await Promise.all(
    [original, editada].map((buf) =>
      sharp(buf)
        .resize(LADO, LADO, { fit: "contain", background: "#ffffff" })
        .flatten({ background: "#ffffff" })
        .png()
        .toBuffer()
    )
  );
  await sharp({
    create: { width: LADO * 2 + 30, height: LADO, channels: 3, background: "#d9d9d9" },
  })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: LADO + 30, top: 0 },
    ])
    .jpeg({ quality: 88 })
    .toFile(destino);
}

/* ── Programa ───────────────────────────────────────────────────────────── */

if (!fs.existsSync(ENTRADA)) {
  console.error(`No existe la carpeta de fotos crudas: ${ENTRADA}`);
  process.exit(1);
}
fs.mkdirSync(SALIDA, { recursive: true });
fs.mkdirSync(REVISION, { recursive: true });

let candidatas = fs
  .readdirSync(ENTRADA)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .sort();
if (args.archivo) candidatas = candidatas.filter((f) => f === args.archivo);

const salidaDe = (f) => path.join(SALIDA, `${path.parse(f).name}.png`);
const pendientes = candidatas.filter((f) => args.rehacer || !fs.existsSync(salidaDe(f)));
const aProcesar = pendientes.slice(0, MAXIMO);

console.log(`Fotos crudas en la carpeta   ${candidatas.length}`);
console.log(`Ya editadas (se saltan)      ${candidatas.length - pendientes.length}`);
console.log(`Por editar                   ${pendientes.length}`);
console.log(`En esta corrida (tope ${MAXIMO})   ${aProcesar.length}`);
for (const f of aProcesar) console.log(`  · ${f}`);

if (args.seco) {
  console.log("\nModo --seco: no se llamó a OpenAI, no se gastó nada.");
  process.exit(0);
}
if (!aProcesar.length) process.exit(0);

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "\nFalta la clave. Abre el archivo .env (en la carpeta del proyecto) y pega la clave\n" +
      "justo después de OPENAI_API_KEY=  sin espacios ni comillas."
  );
  process.exit(1);
}

const referencia = args.referencia ? await prepararEnvio(String(args.referencia)) : null;

let hechas = 0;
let fallidas = 0;
let tokens = 0;

for (const f of aProcesar) {
  process.stdout.write(`\nEditando ${f} ...\n`);
  try {
    const original = await prepararEnvio(path.join(ENTRADA, f));
    const { png, uso } = await pedirEdicion(referencia ? [original, referencia] : [original]);

    fs.writeFileSync(salidaDe(f), png);
    await hojaDeRevision(original, png, path.join(REVISION, `antes-despues-${path.parse(f).name}-${MODELO}.jpg`));

    tokens += uso?.total_tokens ?? 0;
    hechas++;
    console.log(`    listo → ${salidaDe(f)}`);
    console.log(`    para revisar → revision/antes-despues-${path.parse(f).name}-${MODELO}.jpg`);
  } catch (e) {
    fallidas++;
    console.log(`    FALLÓ: ${e.message}`);
    if (e.fatal) {
      console.log("    Se detiene la corrida: seguir solo repetiría el mismo error.");
      break;
    }
  }
}

console.log(`\nEditadas ${hechas} · fallidas ${fallidas}` + (tokens ? ` · tokens usados ${tokens}` : ""));
process.exit(fallidas ? 1 : 0);
