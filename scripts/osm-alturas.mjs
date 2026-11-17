// Descarga de OpenStreetMap (Overpass API) la numeración de las calles (addr:housenumber + addr:street)
// del área y la guarda en public/data/alturas.json. La usa el buscador de direcciones de la app
// (no se dibuja en el mapa); se descarga recién en la primera búsqueda.
// Uso: node scripts/osm-alturas.mjs
//      node scripts/osm-alturas.mjs --desde respuesta.json   (respuesta de Overpass ya descargada,
//      útil si la API está caída; con nodos que tengan addr:housenumber)
// Datos © colaboradores de OpenStreetMap, licencia ODbL.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consultarOverpass, bboxDeLasCapas } from "./overpass.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bbox = bboxDeLasCapas(root);
const consulta = `[out:json][timeout:90];(node["addr:housenumber"](${bbox});way["addr:housenumber"](${bbox}););out tags center;`;

const desde = process.argv.indexOf("--desde");
const { elements } = desde > 0
  ? JSON.parse(readFileSync(process.argv[desde + 1], "utf8"))
  : await consultarOverpass(consulta);
const vistos = new Set();
const puntos = [];
for (const e of elements) {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const numero = e.tags?.["addr:housenumber"];
  const calle = e.tags?.["addr:street"];
  if (lat == null || lon == null || !numero || !calle) continue; // sin calle no sirve para buscar
  const p = [Number(lon.toFixed(6)), Number(lat.toFixed(6)), numero, calle];
  const clave = p.join("|");
  if (vistos.has(clave)) continue;
  vistos.add(clave);
  puntos.push(p);
}
puntos.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

writeFileSync(join(root, "public", "data", "alturas.json"), JSON.stringify({
  attribution: "© OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright",
  formato: "[lon, lat, número, calle]",
  puntos,
}));
console.log(`${puntos.length} alturas -> public/data/alturas.json`);
