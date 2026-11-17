// Une los GeoJSON crudos de dataset/ (CAPA-FUENTE/zona_x.geojson) en dos capas:
//   public/data/asfalto.geojson y public/data/tierra.geojson
// Cada tramo recibe un id numérico estable y las propiedades `zona` y `fuente`.
// Uso: node scripts/build-data.mjs

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "dataset");
const out = join(root, "public", "data");

const layers = { asfalto: [], tierra: [] };
let nextId = 1;
let fixedLon = 0;

// Algunas exportaciones de uMap traen longitudes "con vueltas" (p. ej. -780.16 en vez de -60.16).
// Se llevan al rango [-180, 180) sin cambiar la posición real.
const normalizeLon = (lon) => {
  if (lon >= -180 && lon < 180) return lon;
  fixedLon++;
  return Number((((((lon + 180) % 360) + 360) % 360) - 180).toFixed(6));
};
const normalizeCoords = (c) => (typeof c[0] === "number" ? [normalizeLon(c[0]), ...c.slice(1)] : c.map(normalizeCoords));

// ASFALTO-SATELITAL, ASFALTO-VERIFICADA, TIERRA-...  (osm-calles.geojson no es una carpeta: se ignora)
const dirs = readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const dir of dirs) {
  const match = /^(ASFALTO|TIERRA)-(SATELITAL|VERIFICADA)$/i.exec(dir);
  if (!match) {
    console.warn(`Ignorando carpeta desconocida: ${dir}`);
    continue;
  }
  const capa = match[1].toLowerCase();
  const fuente = match[2].toLowerCase();

  for (const file of readdirSync(join(src, dir)).filter((f) => f.endsWith(".geojson")).sort()) {
    const zona = (/zona_([a-z0-9]+)/i.exec(file)?.[1] ?? "?").toUpperCase();
    const fc = JSON.parse(readFileSync(join(src, dir, file), "utf8"));
    for (const feature of fc.features ?? []) {
      layers[capa].push({
        type: "Feature",
        properties: { id: nextId++, zona, fuente, ...(feature.properties ?? {}) },
        geometry: { ...feature.geometry, coordinates: normalizeCoords(feature.geometry.coordinates) },
      });
    }
  }
}

if (fixedLon) console.log(`Longitudes normalizadas: ${fixedLon} puntos fuera de [-180, 180)`);

mkdirSync(out, { recursive: true });
for (const [capa, features] of Object.entries(layers)) {
  features.sort((a, b) => a.properties.id - b.properties.id);
  writeFileSync(join(out, `${capa}.geojson`), JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`${capa}: ${features.length} tramos -> public/data/${capa}.geojson`);
}
