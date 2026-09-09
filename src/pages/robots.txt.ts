/**
 * Robots.
 *
 * Antes vivía como archivo estático en public/ con el dominio escrito a mano.
 * Como endpoint, toma el mismo `site` que astro.config.mjs — así, cuando ese
 * dominio cambie (Vercel u otro), el sitemap que anuncia aquí cambia solo,
 * sin tocar dos archivos por separado.
 */

import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, "") ?? "";

  const cuerpo = `User-agent: *
Allow: /
Disallow: /sistema

Sitemap: ${base}/sitemap.xml
`;

  return new Response(cuerpo, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
