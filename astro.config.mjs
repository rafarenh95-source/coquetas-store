import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dominio del sitio, para el sitemap, las URLs canónicas, los datos
 * estructurados y la imagen que se ve al compartir el enlace en redes.
 *
 * Vercel expone la URL de producción real en VERCEL_PROJECT_PRODUCTION_URL
 * durante el build — hoy es el subdominio *.vercel.app; el día que se
 * compre coquetas.store y se conecte en el panel de Vercel, esa variable
 * pasa a valer el dominio propio automáticamente, sin tocar este archivo.
 *
 * El valor fijo de abajo solo se usa fuera de Vercel (build local).
 */
const sitio = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://coquetas-store.vercel.app";

export default defineConfig({
  site: sitio,
  vite: {
    plugins: [tailwindcss()],
  },
  /* La hoja de estilos va dentro de cada página y no en un archivo aparte:
     en 4G lenta eso era una ida y vuelta más antes de poder pintar nada
     (~190 ms según Lighthouse móvil). Comprimida pesa unos 6 KB. */
  build: {
    inlineStylesheets: "always",
  },
});
