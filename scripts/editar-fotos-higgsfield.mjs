/**
 * Coquetas — de foto cruda (borrosa, con fondo) a foto de catálogo, con Higgsfield.
 *
 * Igual que `editar-fotos-ia.mjs`, pero con la API de Higgsfield (modelo de
 * edición Qwen Image 3). Deja el producto nítido, de frente y centrado sobre
 * blanco puro. El recorte, el encuadre y el fondo crema siguen siendo de
 * `procesar-fotos.mjs` (el crema lo pone la página), para que la foto nueva pase
 * por el mismo camino que las ya publicadas.
 *
 * EL RIESGO: el modelo vuelve a dibujar el producto. Puede desviar un tono o
 * inventar una letra de la etiqueta. Cada resultado se deja junto a su original
 * en `revision/` y hay que mirarlo antes de darlo por bueno.
 *
 *   node scripts/editar-fotos-higgsfield.mjs --archivo "C:/ruta/foto.jpg" --seco   # solo dice cuánto cuesta
 *   node scripts/editar-fotos-higgsfield.mjs --archivo "C:/ruta/foto.jpg" --nombre monomero-ema
 *   ... --nota "La etiqueta dice: ..."   (ayuda a que no invente letras)
 *   ... --prompt-archivo scripts/prompt-fotos-catalogo.txt   (prompt maestro de la dueña en vez del de abajo)
 *
 * La clave va en `.env` (HIGGSFIELD_API_KEY=id:secreto), que Git ignora.
 * Nunca se imprime ni se guarda en otro sitio.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API = "https://api.higgsfield.ai";
const MODELO = "alibaba/qwen-image-3/edit";
const SALIDA_POR_DEFECTO = "C:/Users/conch/Downloads/fotos editadas ia";
const REVISION = path.resolve("revision");

const PROMPT = [
  "Turn this blurry, low-resolution product photo into a sharp, high-resolution professional e-commerce catalog photo.",
  "Keep the exact same product: identical shape, proportions, cap, colors, materials, logo and label design.",
  "Make the bottle edges and the large label text crisp and clean, exactly as they appear in the original; do not translate, rename or add any text.",
  "If some very small label text is unreadable, keep it as soft small text instead of inventing words.",
  "Remove the background and the surface completely.",
  "Place the product centered, upright and straight-on, on a pure seamless white background (#FFFFFF), with soft even studio lighting, no shadow, no reflection.",
  "Keep the product's colors natural and accurate: do not saturate or shift them.",
  "The product fills about 80% of the frame height. Square composition. No watermark, border, props or extra objects.",
].join(" ");

function argumentos(lista) {
  const a = {};
  for (let i = 0; i < lista.length; i++) {
    const k = lista[i];
    if (!k.startsWith("--")) continue;
    const v = lista[i + 1] && !lista[i + 1].startsWith("--") ? lista[++i] : true;
    a[k.slice(2)] = v;
  }
  return a;
}

function clave() {
  const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  const m = env.match(/^HIGGSFIELD_API_KEY=(.+)$/m);
  if (!m || !m[1].trim()) throw new Error("Falta HIGGSFIELD_API_KEY en .env");
  return m[1].trim();
}

async function pedir(url, opciones, auth) {
  const r = await fetch(url, {
    ...opciones,
    headers: { "Content-Type": "application/json", Authorization: `Key ${auth}`, ...(opciones.headers || {}) },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} en ${url.replace(API, "")}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : {};
}

async function subir(archivo, auth) {
  // Se sube como PNG para no recomprimir la foto otra vez en JPEG.
  const png = await sharp(archivo).rotate().png().toBuffer();
  const u = await pedir(`${API}/files/generate-upload-url`, { method: "POST", body: JSON.stringify({ content_type: "image/png" }) }, auth);
  const put = await fetch(u.upload_url, { method: "PUT", headers: u.upload_headers, body: png });
  if (!put.ok) throw new Error(`No se pudo subir la foto (${put.status})`);
  return u.public_url;
}

const a = argumentos(process.argv.slice(2));
if (!a.archivo) {
  console.error('Uso: node scripts/editar-fotos-higgsfield.mjs --archivo "foto.jpg" [--nombre x] [--nota "..."] [--seco]');
  process.exit(1);
}
const auth = clave();
const nombre = typeof a.nombre === "string" ? a.nombre : path.parse(a.archivo).name;
const salida = typeof a.salida === "string" ? a.salida : SALIDA_POR_DEFECTO;

const cuerpo = (url) => ({
  prompt: (typeof a["prompt-archivo"] === "string" ? fs.readFileSync(a["prompt-archivo"], "utf8").trim() : PROMPT) + (typeof a.nota === "string" ? " " + a.nota : ""),
  image_urls: [url],
  resolution: "2k",
  aspect_ratio: "1:1",
  // Sin «mejorar el prompt»: queremos fidelidad al producto, no creatividad.
  prompt_extend: false,
  enable_thinking: false,
  negative_prompt: "blurry, low resolution, invented text, misspelled label, extra objects, shadow, reflection, hands, background clutter, color shift",
});

const url = await subir(a.archivo, auth);
const est = await pedir(`${API}/estimate/${MODELO}`, { method: "POST", body: JSON.stringify(cuerpo(url)) }, auth);
console.log(`Costo estimado: ${est.usd ?? "?"} USD`);
if (a.seco) process.exit(0);

const envio = await pedir(`${API}/${MODELO}`, { method: "POST", body: JSON.stringify(cuerpo(url)) }, auth);
console.log(`Pedido ${envio.request_id} enviado…`);
let estado;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  estado = await pedir(envio.status_url, { method: "GET" }, auth);
  if (["completed", "failed", "nsfw", "canceled"].includes(estado.status)) break;
}
if (estado?.status !== "completed") throw new Error(`Terminó como «${estado?.status}»: ${JSON.stringify(estado?.error ?? "")}`);

const img = Buffer.from(await (await fetch(estado.images[0].url)).arrayBuffer());
fs.mkdirSync(salida, { recursive: true });
const destino = path.join(salida, `${nombre}.png`);
await sharp(img).png().toFile(destino);

// Comparación lado a lado para revisar: original | resultado.
fs.mkdirSync(REVISION, { recursive: true });
const L = 900;
const izq = await sharp(a.archivo).rotate().resize(L, L, { fit: "contain", background: "#ffffff" }).png().toBuffer();
const der = await sharp(img).resize(L, L, { fit: "contain", background: "#ffffff" }).png().toBuffer();
const comp = path.join(REVISION, `${nombre}-antes-despues.jpg`);
await sharp({ create: { width: L * 2 + 20, height: L, channels: 3, background: "#cccccc" } })
  .composite([{ input: izq, left: 0, top: 0 }, { input: der, left: L + 20, top: 0 }])
  .jpeg({ quality: 88 })
  .toFile(comp);

const m = await sharp(destino).metadata();
console.log(`Listo: ${destino} (${m.width}×${m.height})`);
console.log(`Comparación: ${comp}`);
