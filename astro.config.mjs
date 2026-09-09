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
  build: {
    inlineStylesheets: "auto",
  },
});
