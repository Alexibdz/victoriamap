// Consulta a la API de Overpass (OpenStreetMap), compartida por osm-calles.mjs y osm-alturas.mjs.
// Overpass suele estar saturado (504/429): se reintenta y se prueban servidores espejo.
// Ojo: un User-Agent con URL ("… (+https://…)") hace que overpass-api.de responda 406.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVIDORES = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export async function consultarOverpass(consulta) {
  for (let intento = 1; intento <= 3; intento++) {
    for (const url of SERVIDORES) {
      try {
        console.log(`Consultando ${new URL(url).host}…`);
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "victoriamap/1.0", Accept: "application/json" },
          body: new URLSearchParams({ data: consulta }),
          signal: AbortSignal.timeout(120_000),
        });
        if (r.ok) return await r.json();
        console.warn(`  HTTP ${r.status}`);
      } catch (error) {
        console.warn(`  ${error.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000 * intento));
  }
  throw new Error("Ningún servidor de Overpass respondió. Probá de nuevo en unos minutos.");
}

/** Área que cubren las capas publicadas, con margen en grados, como "sur,oeste,norte,este" para Overpass. */
export function bboxDeLasCapas(root, margen = 0.004) {
  let [oeste, sur, este, norte] = [180, 90, -180, -90];
  for (const capa of ["asfalto", "tierra"]) {
    const fc = JSON.parse(readFileSync(join(root, "public", "data", `${capa}.geojson`), "utf8"));
    for (const f of fc.features) {
      const lineas = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const [lon, lat] of lineas.flat()) {
        oeste = Math.min(oeste, lon); este = Math.max(este, lon);
        sur = Math.min(sur, lat); norte = Math.max(norte, lat);
      }
    }
  }
  return [sur - margen, oeste - margen, norte + margen, este + margen].map((v) => v.toFixed(5)).join(",");
}
