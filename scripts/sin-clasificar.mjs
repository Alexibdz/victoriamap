// Genera public/data/sin-clasificar.geojson: cuadras de calles de OpenStreetMap que están dentro del área
// relevada pero no aparecen ni en asfalto ni en tierra (p. ej. Suipacha, en el límite entre las zonas A y B).
// Desde el mapa se las puede "pintar" como asfalto o tierra; pasan a ser tramos normales de esa capa.
// Requiere dataset/osm-calles.geojson con `nodos` (npm run osm).
// Uso: node scripts/sin-clasificar.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { crearProyeccion, distSegmento, difAngulo, angulo, segmentosDe, envolvente, dentroDe } from "./geo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_CUBIERTO = 12;   // m: un punto de OSM está cubierto si hay un tramo paralelo a menos de esto
const LARGO_MIN = 20;       // m: se descartan huecos más cortos (puntas de cuadra, ruido)
const MARGEN_BORDE = 30;    // m: no se cuenta lo que está pegado al borde del área relevada
const PASO = 5;             // m entre muestras
const CELDA = 50;           // m: tamaño de celda del índice espacial

const osm = JSON.parse(readFileSync(join(root, "dataset", "osm-calles.geojson"), "utf8"));
if (!osm.features.every((f) => Array.isArray(f.properties.nodos))) {
  throw new Error("dataset/osm-calles.geojson no tiene `nodos`. Corré primero: npm run osm");
}
const { proyectar } = crearProyeccion(osm.features[0].geometry.coordinates[0][1]);

// Tramos ya clasificados, indexados por celda para buscar rápido.
const indice = new Map();
const puntosTramos = [];
for (const capa of ["asfalto", "tierra"]) {
  const fc = JSON.parse(readFileSync(join(root, "public", "data", `${capa}.geojson`), "utf8"));
  for (const f of fc.features) {
    for (const s of segmentosDe(f.geometry, proyectar)) {
      puntosTramos.push(s.a, s.b);
      const [x0, x1] = [Math.min(s.a[0], s.b[0]), Math.max(s.a[0], s.b[0])].map((v) => Math.floor(v / CELDA));
      const [y0, y1] = [Math.min(s.a[1], s.b[1]), Math.max(s.a[1], s.b[1])].map((v) => Math.floor(v / CELDA));
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        if (!indice.has(k)) indice.set(k, []);
        indice.get(k).push(s);
      }
    }
  }
}
const area = envolvente(puntosTramos);

const cubierto = (p, dir) => {
  const cx = Math.floor(p[0] / CELDA), cy = Math.floor(p[1] / CELDA);
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
    for (const s of indice.get(`${x},${y}`) ?? []) {
      if (difAngulo(s.angulo, dir) < 0.35 && distSegmento(p, s.a, s.b) < DIST_CUBIERTO) return true;
    }
  }
  return false;
};

// Esquinas: nodos que comparten dos o más calles.
const usos = new Map();
for (const f of osm.features) for (const n of new Set(f.properties.nodos)) usos.set(n, (usos.get(n) ?? 0) + 1);

const features = [];
for (const f of osm.features) {
  const { nodos, osm_id, nombre } = f.properties;
  const coords = f.geometry.coordinates;

  // Cortar la calle en cuadras (de esquina a esquina).
  const cuadras = [];
  let desde = 0;
  for (let i = 1; i < coords.length; i++) {
    if (i === coords.length - 1 || usos.get(nodos[i]) > 1) {
      cuadras.push(coords.slice(desde, i + 1));
      desde = i;
    }
  }

  cuadras.forEach((cuadra, k) => {
    const pts = cuadra.map(proyectar);

    // Muestras a lo largo de la cuadra, con su distancia desde el inicio.
    const muestras = [];
    let largo = 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(l / PASO));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        muestras.push({ d: largo + l * t, libre: !cubierto(p, angulo(a, b)) });
      }
      largo += l;
    }

    // Tramos sin cubrir: corridas de muestras libres seguidas. Una cuadra puede estar cubierta solo en parte.
    const corridas = [];
    let actual = null;
    for (const m of muestras) {
      if (m.libre) {
        actual ??= { desde: m.d, hasta: m.d };
        actual.hasta = m.d;
      } else if (actual) {
        corridas.push(actual);
        actual = null;
      }
    }
    if (actual) corridas.push(actual);

    const validas = corridas
      .map((c) => {
        const desde = c.desde - PASO < 0 ? 0 : c.desde - PASO / 2;
        const hasta = c.hasta + PASO > largo ? largo : c.hasta + PASO / 2;
        return { desde, hasta };
      })
      .filter((c) => c.hasta - c.desde >= LARGO_MIN && dentroDe(area, puntoEn(pts, (c.desde + c.hasta) / 2), MARGEN_BORDE));

    validas.forEach((c, r) => {
      const entera = validas.length === 1 && c.desde === 0 && c.hasta === largo;
      features.push({
        type: "Feature",
        properties: { id: entera ? `osm-${osm_id}-${k}` : `osm-${osm_id}-${k}-${r}`, ...(nombre ? { nombre } : {}), fuente: "osm", osm_id },
        geometry: { type: "LineString", coordinates: subLinea(cuadra, pts, c.desde, c.hasta) },
      });
    });
  });
}

/** Punto proyectado a `d` metros del inicio de la polilínea. */
function puntoEn(pts, d) {
  let recorrido = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (recorrido + l >= d) {
      const t = l ? (d - recorrido) / l : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    recorrido += l;
  }
  return pts[pts.length - 1];
}

/** Pedazo de la polilínea (en lon/lat) entre `d0` y `d1` metros desde el inicio. */
function subLinea(coords, pts, d0, d1) {
  const interpolar = (i, t) => coords[i - 1].map((v, e) => Number((v + (coords[i][e] - v) * t).toFixed(6)));
  const salida = [];
  let recorrido = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [ini, fin] = [recorrido, recorrido + l];
    if (fin >= d0 && ini <= d1) {
      if (!salida.length) salida.push(d0 <= ini ? coords[i - 1] : interpolar(i, (d0 - ini) / l));
      salida.push(d1 >= fin ? coords[i] : interpolar(i, (d1 - ini) / l));
    }
    recorrido = fin;
  }
  return salida;
}

writeFileSync(join(root, "public", "data", "sin-clasificar.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
const porCalle = {};
for (const f of features) porCalle[f.properties.nombre ?? "(sin nombre)"] = (porCalle[f.properties.nombre ?? "(sin nombre)"] ?? 0) + 1;
console.log(`sin clasificar: ${features.length} cuadras -> public/data/sin-clasificar.geojson`);
console.log(Object.entries(porCalle).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${c} ${n}`).join(" · "));
