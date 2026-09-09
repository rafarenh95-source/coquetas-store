/**
 * Coquetas — generador de productos.json
 *
 * Lee las fotos editadas, agrupa por producto, asigna categoria / uso profesional /
 * precio / presentacion, y muestrea el color dominante de cada variante para el
 * selector de tonos.
 *
 * Fuente de verdad temporal: los nombres de archivo + las etiquetas de los envases.
 * Cuando exista el Google Sheet, este script se reemplaza por sync-productos.js.
 *
 *   node scripts/build-productos.mjs
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ORIGEN = "C:/Users/conch/Downloads/imagenes editadas";
const TEXTOS = path.resolve("src/data/textos.json");
const SALIDA = path.resolve("src/data/productos.json");

/* ── resolución de archivos tolerante a acentos y mayúsculas ─────────────── */

const archivos = fs.readdirSync(ORIGEN).filter((f) => f.toLowerCase().endsWith(".png"));
const indice = new Map(archivos.map((f) => [f.normalize("NFC").toLowerCase(), f]));

function resolver(nombre) {
  const clave = nombre.normalize("NFC").toLowerCase();
  const hit = indice.get(clave);
  if (!hit) throw new Error(`No existe la foto: ${nombre}`);
  return hit;
}

/* ── muestreo de color para los swatches ─────────────────────────────────── */

function saturacion(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Toma la franja central-baja de la foto (el cuerpo del frasco o el contenido del
 * pote), descarta el fondo blanco y el texto de la etiqueta, y devuelve el color
 * cromatico mas frecuente.
 */
async function muestrearColor(archivo) {
  const { data, info } = await sharp(path.join(ORIGEN, archivo))
    .removeAlpha()
    .resize(200, 200, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const y0 = Math.floor(height * 0.5);
  const y1 = Math.floor(height * 0.88);
  const x0 = Math.floor(width * 0.35);
  const x1 = Math.floor(width * 0.65);

  const cubos = new Map();

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const max = Math.max(r, g, b);
      const sat = saturacion(r, g, b);

      if (max > 245 && sat < 0.06) continue; // fondo blanco
      if (max < 28) continue; // texto negro
      if (sat < 0.07) continue; // grises y blancos de etiqueta

      const clave = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const acc = cubos.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
      acc.n++;
      acc.r += r;
      acc.g += g;
      acc.b += b;
      cubos.set(clave, acc);
    }
  }

  if (cubos.size === 0) return { hex: null, revisar: true };

  const top = [...cubos.values()].sort((a, b) => b.n - a.n)[0];
  const r = Math.round(top.r / top.n);
  const g = Math.round(top.g / top.n);
  const b = Math.round(top.b / top.n);
  const hex = (v) => v.toString(16).padStart(2, "0");

  // luminancia en los extremos = probablemente muestreamos la etiqueta o la tapa,
  // no el producto. Se marca para revision humana en vez de darlo por bueno.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return {
    hex: `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase(),
    revisar: lum < 0.12 || lum > 0.92,
  };
}

function familiaDeColor(hex) {
  if (!hex) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (sat < 0.12) {
    if (l > 0.85) return "Blanco";
    if (l < 0.18) return "Negro";
    return "Gris";
  }

  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  // Los cálidos poco saturados son nudes, y este catálogo está lleno de ellos
  if (h >= 8 && h <= 45) {
    if (sat < 0.5 && l > 0.55) return "Nude";
    if (l < 0.45) return "Marrón";
  }

  if (h < 12 || h >= 345) return "Rojo";
  if (h < 25) return "Coral";
  if (h < 45) return "Naranja";
  if (h < 68) return "Amarillo";
  if (h < 160) return "Verde";
  if (h < 195) return "Turquesa";
  if (h < 250) return "Azul";
  if (h < 288) return "Morado";
  if (h < 320) return "Magenta";
  return "Rosa";
}

/* ── catálogo ─────────────────────────────────────────────────────────────
 *
 * categoria       unas · facial · cuerpo
 * tipo_variante   color (swatch circular) · aroma (chip de texto) · null
 * uso_profesional true cuando el envase lo declara o el producto solo tiene
 *                 sentido dentro de un servicio de manicura
 */

const numeradas = (base, desde, hasta, ext = ".png") =>
  Array.from({ length: hasta - desde + 1 }, (_, k) => ({
    tono: null,
    archivo: `${base}${desde + k}${ext}`,
  }));

const CATALOGO = [
  /* ── UÑAS · consumidora ───────────────────────────────────────────────── */
  {
    id: "MG-ESM-SEMI-10",
    nombre: "Esmalte semipermanente",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 1.7,
    presentacion: "10 ml",
    destacado: true,
    tipo_variante: "color",
    variantes: numeradas("Esmaltes semipermanentes 10 ml 1.7$ ", 1, 14),
  },
  {
    id: "MG-GEL-COLOR-15",
    nombre: "Gel polish color",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 1.9,
    presentacion: "15 ml",
    destacado: true,
    tipo_variante: "color",
    variantes: numeradas("Brillo color 1.9$ ", 1, 7),
  },
  {
    id: "EG-ESM-TRAD",
    nombre: "Esmalte tradicional",
    marca: "EMERGIRL",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 1.4,
    nota_precio: "La docena en $15,00",
    presentacion: null,
    destacado: false,
    tipo_variante: "color",
    variantes: numeradas("Esmaltes emergirl 1.4$ ", 1, 4),
  },
  {
    id: "MG-ACE-CUT-FLOR",
    nombre: "Aceite para cutícula con flor",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 1.5,
    presentacion: "15 ml",
    destacado: false,
    tipo_variante: "aroma",
    variantes: [
      { tono: "Lavanda", archivo: "aceite de cuticula flor 1.5$ LAVANDA.png" },
      { tono: "Peach", archivo: "aceite de cuticula flor 1.5$ PEACH.png" },
      { tono: "Rosas", archivo: "aceite de cuticula flor 1.5$ ROSAS.png" },
    ],
  },
  {
    id: "MG-ACE-CUT-35",
    nombre: "Aceite para cutícula",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 3.0,
    presentacion: "35 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Aceite de cutícula de 35ml 3$.png" }],
  },
  {
    id: "TF-LIMA-100-180",
    nombre: "Lima Tiffany 100/180",
    marca: "TIFFANY",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 1.0,
    nota_precio: "El par en $1,00",
    presentacion: "Par",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "lima tiffany 2x1$.png" }],
    fotos_extra: ["2 limas tifany.png"],
  },
  {
    id: "MG-TIPS-JELLY",
    nombre: "Soft jelly tips coffin",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: false,
    precio_divisa: 2.0,
    presentacion: "120 piezas",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Uñas jelly tips tecnología avanzada 2$.png" }],
  },

  /* ── UÑAS · uso profesional ───────────────────────────────────────────── */
  {
    id: "MG-POLYGEL",
    nombre: "Polygel Premium",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    presentacion: null,
    destacado: false,
    tipo_variante: "codigo",
    variantes: [
      { tono: "04", archivo: "polygel premiun 04 3$.png" },
      { tono: "17", archivo: "polygel premiun 17 3$.png" },
      { tono: "19", archivo: "polygel premiun 19 3$.png" },
      { tono: "20", archivo: "polygel premiun 20 3$.png" },
      { tono: "25", archivo: "polygel premiun 25 3$.png" },
      { tono: "39", archivo: "polygel premiun 39 3$.png" },
      { tono: "Clear", archivo: "polygel premiun clear 3$.png" },
    ],
  },
  {
    id: "MG-JELLY-BUILDER",
    nombre: "Jelly builder gel",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    presentacion: null,
    destacado: false,
    tipo_variante: "codigo",
    variantes: [
      { tono: "#2", archivo: "jelly builder gel #2 3$.png" },
      { tono: "#4", archivo: "jelly builder gel #4 3$.png" },
      { tono: "#7", archivo: "jelly builder gel #7 3$.png" },
    ],
  },
  {
    id: "MG-BUILDER-GEL",
    nombre: "Builder gel",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    nota_precio: "Dos por $5,00",
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Builder gel 3$ y dos por 5$.png" }],
  },
  {
    id: "TF-BUILDER-10",
    nombre: "Builder gel Tiffany",
    marca: "TIFFANY",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 2.0,
    presentacion: "10 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "builder gel tifany 2$ 10ml.png" }],
  },
  {
    id: "TF-BUILDER-15",
    nombre: "Builder gel Tiffany",
    marca: "TIFFANY",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    presentacion: "15 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "builder gel tifany 3$ 15ml.png" }],
  },
  {
    id: "MG-BASE-GEL-10",
    nombre: "Base gel",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 1.5,
    presentacion: "10 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Base gel 10 ml 1.5$.png" }],
  },
  {
    id: "MG-BASE-GEL-15",
    nombre: "Base gel",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    presentacion: "15 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Base gel 15 ml 3$.png" }],
  },
  {
    id: "MG-TOP-COAT-15",
    nombre: "Top coat",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.7,
    presentacion: "15 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Top coat 15 ml 3.7$.png" }],
  },
  {
    id: "MG-TOP-COAT-REC",
    nombre: "Recarga de top coat",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 15.0,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Recarga de top coat 15$.png" }],
  },
  {
    id: "MG-FINISH-15",
    nombre: "Finish",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.4,
    presentacion: "15 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Finish 15 ml 3.4$.png" }],
  },
  {
    id: "MG-BRUSH-ON-GEL",
    nombre: "Brush on gel",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.5,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Brush on gel 3.5$.png" }],
  },
  {
    id: "MG-PRIMER",
    nombre: "Primer",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 2.0,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "primer 2$.png" }],
  },
  {
    id: "MG-PROTEIN-BOND",
    nombre: "Protein bond ultra",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Protein bond ultra 3$.png" }],
  },
  {
    id: "MG-ACE-CUT-PRO",
    nombre: "Aceite para cutícula profesional",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 1.0,
    presentacion: "15 ml",
    destacado: false,
    tipo_variante: "color",
    variantes: numeradas("aceite de cuticula maxglow 1$ ", 1, 3),
  },
  {
    id: "MG-CORTACUTICULA",
    nombre: "Cortacutícula de resorte",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 7.0,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Cortacuticula Maxglow resorte 7$.png" }],
  },
  {
    id: "MG-ESPUMA-MANI",
    nombre: "Espuma limpiadora para manicure",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    // El contenido cambia entre etiquetas: la rosa trae 150 ml y las otras dos
    // 100 ml, al mismo precio. Por eso la presentación va en cada variante y no
    // a nivel de producto.
    presentacion: null,
    destacado: false,
    tipo_variante: "aroma",
    variantes: [
      { tono: "Rosa · 150 ml", archivo: "Espuma limpiadora 3$ 1.png" },
      { tono: "Negra · 100 ml", archivo: "Espuma limpiadora 3$ 2.png" },
      { tono: "Crema · 100 ml", archivo: "Espuma limpiadora 3$ 3.png" },
    ],
  },
  {
    id: "MG-SANITIZANTE",
    nombre: "Sanitizante para manicure",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 3.0,
    presentacion: "100 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Sanitizante 3$.png" }],
  },
  {
    id: "MG-LIMPIA-PINCELES",
    nombre: "Limpia pinceles",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 2.0,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Limpia pinceles 2$.png" }],
  },
  {
    id: "MG-TOALLAS-REMOV",
    nombre: "Toallas removedoras de esmalte",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 2.0,
    presentacion: "90 g",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Algodón celulosas 2$.png" }],
  },
  {
    id: "MG-TIPS-500",
    nombre: "Uñas postizas por 500",
    marca: "MAXGLOW",
    categoria: "unas",
    uso_profesional: true,
    precio_divisa: 5.0,
    presentacion: "500 piezas",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Uñas por 500 5$.png" }],
  },

  /* ── CUIDADO FACIAL ───────────────────────────────────────────────────── */
  {
    id: "MG-AGUA-MICELAR",
    nombre: "Agua micelar",
    marca: "MAXGLOW",
    categoria: "facial",
    uso_profesional: false,
    precio_divisa: 3.5,
    presentacion: "200 ml",
    destacado: true,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Agua micelar 3.5$.png" }],
  },
  {
    id: "MG-AGUA-ROSAS",
    nombre: "Agua de rosas",
    marca: "MAXGLOW",
    categoria: "facial",
    uso_profesional: false,
    precio_divisa: 3.5,
    presentacion: "250 ml",
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Agua de rosas 3.5$.png" }],
  },
  {
    id: "MG-GASAS-PESTANAS",
    nombre: "Gasas mágicas para pestañas",
    marca: "MAXGLOW",
    categoria: "facial",
    uso_profesional: true,
    precio_divisa: 2.0,
    presentacion: "300 piezas",
    destacado: false,
    tipo_variante: "aroma",
    variantes: [
      { tono: "Lisa", archivo: "Algodón gasa de pestañas 2$.png" },
      { tono: "Corazones rosas", archivo: "Algodón gasas de pestañas 2$ corazones rosas.png" },
      { tono: "Corazones morados", archivo: "Algodón gasas de pestañas 2$ corazones morados.png" },
    ],
  },

  /* ── CUERPO Y SPA ─────────────────────────────────────────────────────── */
  {
    id: "MG-VELOTERAPIA",
    nombre: "Veloterapia",
    marca: "MAXGLOW",
    categoria: "cuerpo",
    uso_profesional: false,
    precio_divisa: 2.5,
    presentacion: "80 g",
    destacado: true,
    tipo_variante: "aroma",
    variantes: [
      { tono: "Lavanda", archivo: "veloterapia lavanda 2.5$.png" },
      { tono: "Vainilla", archivo: "veloterapia vainilla 2.5$.png" },
      { tono: "Coconut", archivo: "veloterapia coconut 2.5$.png" },
      { tono: "Agua de rosas", archivo: "veloterapia agua de rosas 2.5$.png" },
      { tono: "Brisas del mar", archivo: "veloterapia brisas del mar 2.5$.png" },
    ],
  },
  {
    id: "MG-EXFOLIANTE",
    nombre: "Exfoliante corporal",
    marca: "MAXGLOW",
    categoria: "cuerpo",
    uso_profesional: false,
    precio_divisa: 3.5,
    presentacion: "350 g",
    destacado: true,
    tipo_variante: "aroma",
    // Los nombres de archivo están cruzados: el que se llama MANGO es passion
    // fruit y el que se llama PARCHITA es mango; el de MELON es watermelon.
    // Manda la etiqueta del envase, verificada foto por foto.
    variantes: [
      { tono: "Passion fruit", archivo: "Exfoliante 3.5$ MANGO.png" },
      { tono: "Watermelon", archivo: "Exfoliante 3.5$ MELON.png" },
      { tono: "Mango", archivo: "Exfoliante 3.5$ PARCHITA.png" },
      { tono: "Grape fruit", archivo: "Exfoliante 3.5$ GRAPE FRUIT.png" },
    ],
  },
  {
    id: "MG-BODY-BUTTER",
    nombre: "Crema body butter",
    marca: "MAXGLOW",
    categoria: "cuerpo",
    uso_profesional: false,
    precio_divisa: 3.5,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Crema body buter 3.5$.png" }],
  },
  {
    id: "MG-BOMBAS-EFERV",
    nombre: "Bombas efervescentes mini",
    marca: "MAXGLOW",
    categoria: "cuerpo",
    uso_profesional: false,
    precio_divisa: 3.9,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Bombas efervescente mini 3.9$.png" }],
  },
  {
    id: "MG-ATOMIZADOR-TALCO",
    nombre: "Atomizador de talco",
    marca: "MAXGLOW",
    categoria: "cuerpo",
    uso_profesional: false,
    precio_divisa: 3.5,
    presentacion: null,
    destacado: false,
    tipo_variante: null,
    variantes: [{ tono: null, archivo: "Atomizador de talco 3.5$.png" }],
  },
];

/* ── construcción ─────────────────────────────────────────────────────────
 *
 * Orden en la grilla: destacados primero, luego consumidora antes que uso
 * profesional dentro de cada categoria. El recorrido por defecto es el de
 * Rebeca; la manicurista encuentra lo suyo por la etiqueta.
 */

const PESO_CATEGORIA = { unas: 0, facial: 1, cuerpo: 2 };
const RECARGO_BOLIVARES = 1.35;

async function construir() {
  const textos = JSON.parse(fs.readFileSync(TEXTOS, "utf8"));
  const usados = new Set();
  const productos = [];

  for (const p of CATALOGO) {
    const variantes = [];

    for (let i = 0; i < p.variantes.length; i++) {
      const v = p.variantes[i];
      const archivo = resolver(v.archivo);
      usados.add(archivo);

      const muestra =
        p.tipo_variante === "color" ? await muestrearColor(archivo) : { hex: null, revisar: false };

      const familia = familiaDeColor(muestra.hex);
      const automatico = familia ? `Tono ${i + 1} · ${familia}` : `Tono ${i + 1}`;

      variantes.push({
        tono: v.tono ?? (p.tipo_variante === "color" ? automatico : null),
        swatch_hex: muestra.hex,
        swatch_revisar: muestra.revisar,
        imagenes: [`/img/productos/${p.id}-${String(i + 1).padStart(2, "0")}.webp`],
        origen: [archivo],
        disponible: true,
      });
    }

    for (const extra of p.fotos_extra ?? []) usados.add(resolver(extra));

    productos.push({
      producto_id: p.id,
      nombre: p.nombre,
      marca: p.marca,
      categoria: p.categoria,
      uso_profesional: p.uso_profesional,
      precio_divisa: p.precio_divisa,
      // Pagar en bolívares cuesta un 35 % más que pagar en divisa. Ambos
      // montos van en dólares; el monto en Bs se calcula en el cliente
      // multiplicando este por la tasa BCV del día.
      precio_referencia: Math.round(p.precio_divisa * RECARGO_BOLIVARES * 100) / 100,
      nota_precio: p.nota_precio ?? null,
      presentacion: p.presentacion,
      descripcion: textos[p.id]?.descripcion ?? "",
      modo_uso: textos[p.id]?.modo_uso ?? "",
      rendimiento: textos[p.id]?.rendimiento ?? "",
      destacado: p.destacado,
      disponible: true,
      tipo_variante: p.tipo_variante,
      variantes,
    });
  }

  productos.sort((a, b) => {
    if (a.destacado !== b.destacado) return a.destacado ? -1 : 1;
    const ca = PESO_CATEGORIA[a.categoria];
    const cb = PESO_CATEGORIA[b.categoria];
    if (ca !== cb) return ca - cb;
    if (a.uso_profesional !== b.uso_profesional) return a.uso_profesional ? 1 : -1;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  productos.forEach((p, i) => (p.orden = i + 1));

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(productos, null, 2) + "\n", "utf8");

  /* informe */
  const huerfanas = archivos.filter((f) => !usados.has(f));
  const fotos = productos.reduce((n, p) => n + p.variantes.length, 0);
  const pro = productos.filter((p) => p.uso_profesional).length;

  console.log(`productos     ${productos.length}`);
  console.log(`variantes     ${fotos}`);
  console.log(`uso pro       ${pro} (${Math.round((pro / productos.length) * 100)} %)`);
  for (const c of ["unas", "facial", "cuerpo"]) {
    console.log(`  ${c.padEnd(12)}${productos.filter((p) => p.categoria === c).length}`);
  }
  const dudosos = productos
    .flatMap((p) => p.variantes.map((v) => ({ ...v, id: p.producto_id })))
    .filter((v) => v.swatch_revisar);
  console.log(`swatch dudoso ${dudosos.length}${dudosos.length ? ": " + dudosos.map((d) => d.id + "/" + d.tono).join(", ") : ""}`);
  console.log(`fotos sueltas ${huerfanas.length}${huerfanas.length ? ": " + huerfanas.join(", ") : ""}`);

  for (const p of productos) {
    if (p.variantes.length < 2) continue;
    const tonos = p.variantes.map((v) => v.tono);
    if (new Set(tonos).size !== tonos.length) {
      throw new Error(
        `${p.producto_id}: tonos repetidos o vacíos (${tonos.join(", ")}). ` +
          "El pedido saldría ambiguo: hay que nombrarlos en el catálogo."
      );
    }
  }

  const sinTexto = productos.filter((p) => !p.descripcion);
  console.log(`sin texto     ${sinTexto.length}${sinTexto.length ? ": " + sinTexto.map((p) => p.producto_id).join(", ") : ""}`);
}

construir().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
