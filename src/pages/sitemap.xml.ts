/**
 * Sitemap.
 *
 * La página del sistema de diseño no entra: es andamiaje interno y en
 * producción redirige a la portada.
 */

import type { APIRoute } from "astro";
import productos from "../data/productos.json";

export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, "") ?? "";
  const hoy = new Date().toISOString().slice(0, 10);

  const rutas = [
    { url: `${base}/`, prioridad: "1.0" },
    ...productos.map((p) => ({
      url: `${base}/producto/${p.producto_id.toLowerCase()}`,
      prioridad: "0.8",
    })),
  ];

  const cuerpo = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rutas
  .map(
    (r) => `  <url>
    <loc>${r.url}</loc>
    <lastmod>${hoy}</lastmod>
    <priority>${r.prioridad}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

  return new Response(cuerpo, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
