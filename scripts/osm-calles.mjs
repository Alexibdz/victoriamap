// Descarga de OpenStreetMap (Overpass API) las calles del área que cubren las capas y las guarda en
// dataset/osm-calles.geojson. Ese archivo es la fuente de los nombres (ver scripts/nombres.mjs).
// Solo hace falta correrlo para actualizar los nombres desde OSM: el resultado queda en el repo.
// Uso: node scripts/osm-calles.mjs
// Datos © colaboradores de OpenStreetMap, licencia ODbL.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consultarOverpass, bboxDeLasCapas } from "./overpass.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bbox = bboxDeLasCapas(root); // área de las capas publicadas + ~400 m

const excluir = "footway|path|cycleway|steps|construction|proposed|platform|corridor|bridleway|service|elevator";
const consulta = `[out:json][timeout:90];way["highway"]["highway"!~"^(${excluir})$"](${bbox});out body geom;`;

const { elements } = await consultarOverpass(consulta);

const features = elements
  .filter((e) => e.type === "way" && e.geometry?.length > 1)
  .sort((a, b) => a.id - b.id)
  .map((e) => ({
    type: "Feature",
    properties: {
      osm_id: e.id,
      nombre: e.tags.name ?? null,
      tipo: e.tags.highway,
      superficie: e.tags.surface ?? null,
      nodos: e.nodes, // ids de nodo: los compartidos entre calles son las esquinas
    },
    geometry: { type: "LineString", coordinates: e.geometry.map((g) => [Number(g.lon.toFixed(6)), Number(g.lat.toFixed(6))]) },
  }));

const salida = {
  type: "FeatureCollection",
  attribution: "© OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright",
  bbox_consulta: bbox,
  features,
};
writeFileSync(join(root, "dataset", "osm-calles.geojson"), JSON.stringify(salida));
console.log(`${features.length} calles (${features.filter((f) => f.properties.nombre).length} con nombre) -> dataset/osm-calles.geojson`);
