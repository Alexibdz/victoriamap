// Asigna la propiedad `nombre` a cada tramo de public/data/*.geojson usando dataset/osm-calles.geojson:
// para cada tramo busca la calle de OSM más cercana que corra en la misma dirección.
// Modifica los archivos en el lugar y conserva todo lo demás (id, capa, zona, fuente, cambios ya publicados),
// así que se puede correr en cualquier momento, también después de reemplazar los GeoJSON exportados.
// Uso: node scripts/nombres.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crearProyeccion, distSegmento, difAngulo, angulo } from "./geo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_MAX = 20;      // metros: distancia media máxima entre el tramo y la calle de OSM
const ANGULO_MAX = 0.35;  // radianes (~20°): diferencia de dirección tolerada

const osm = JSON.parse(readFileSync(join(root, "dataset", "osm-calles.geojson"), "utf8"));
const { proyectar } = crearProyeccion(osm.features[0]?.geometry.coordinates[0][1] ?? 0);

const segmentos = [];
for (const f of osm.features) {
  const pts = f.geometry.coordinates.map(proyectar);
  for (let i = 1; i < pts.length; i++) {
    segmentos.push({ a: pts[i - 1], b: pts[i], angulo: angulo(pts[i - 1], pts[i]), calle: f.properties });
  }
}

export function nombreDe(geometry) {
  const lineas = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const pts = lineas.flat().map(proyectar);
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dir = angulo(a, b);
  const muestras = [0.25, 0.5, 0.75].map((k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);

  // Distancia media de las muestras a cada calle candidata (paralela al tramo).
  const porCalle = new Map();
  for (const s of segmentos) {
    if (difAngulo(s.angulo, dir) > ANGULO_MAX) continue;
    const c = porCalle.get(s.calle.osm_id) ?? { calle: s.calle, d: muestras.map(() => Infinity) };
    muestras.forEach((m, i) => { c.d[i] = Math.min(c.d[i], distSegmento(m, s.a, s.b)); });
    porCalle.set(s.calle.osm_id, c);
  }
  let mejor = null;
  for (const c of porCalle.values()) {
    const media = c.d.reduce((x, y) => x + y, 0) / c.d.length;
    if (media <= DIST_MAX && (!mejor || media < mejor.media)) mejor = { ...c, media };
  }
  return mejor?.calle.nombre ?? null;
}

for (const archivo of ["asfalto", "tierra", "sin-clasificar"]) {
  const ruta = join(root, "public", "data", `${archivo}.geojson`);
  if (!existsSync(ruta)) continue;
  const fc = JSON.parse(readFileSync(ruta, "utf8"));
  const sinNombre = [];
  for (const f of fc.features) {
    const { id, nombre: _anterior, ...resto } = f.properties ?? {};
    const nombre = nombreDe(f.geometry);
    f.properties = nombre ? { id, nombre, ...resto } : { id, ...resto };
    if (!nombre) sinNombre.push(id);
  }
  writeFileSync(ruta, JSON.stringify(fc));
  console.log(`${archivo}: ${fc.features.length - sinNombre.length} de ${fc.features.length} tramos con nombre` +
    (sinNombre.length ? ` (sin nombre: ${sinNombre.join(", ")})` : ""));
}
