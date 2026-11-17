// Utilidades geométricas compartidas por los scripts de datos.
// Trabajan en una proyección local equirectangular en metros: precisa de sobra para una ciudad.

export function crearProyeccion(lat0) {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return {
    proyectar: ([lon, lat]) => [lon * kx, lat * ky],
    desproyectar: ([x, y]) => [x / kx, y / ky],
  };
}

export function distSegmento(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Diferencia entre dos direcciones, sin importar el sentido (0 … π/2). */
export function difAngulo(x, y) {
  const d = Math.abs(x - y) % Math.PI;
  return Math.min(d, Math.PI - d);
}

export const angulo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/** Segmentos proyectados de una geometría LineString/MultiLineString. */
export function segmentosDe(geometry, proyectar) {
  const lineas = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  const segs = [];
  for (const linea of lineas) {
    const pts = linea.map(proyectar);
    for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], angulo: angulo(pts[i - 1], pts[i]) });
  }
  return segs;
}

/** Envolvente convexa (monotone chain). */
export function envolvente(puntos) {
  const p = [...puntos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inf = [], sup = [];
  for (const q of p) {
    while (inf.length >= 2 && cruz(inf.at(-2), inf.at(-1), q) <= 0) inf.pop();
    inf.push(q);
  }
  for (const q of p.reverse()) {
    while (sup.length >= 2 && cruz(sup.at(-2), sup.at(-1), q) <= 0) sup.pop();
    sup.push(q);
  }
  return inf.slice(0, -1).concat(sup.slice(0, -1));
}

/** ¿El punto está dentro del polígono y a más de `margen` metros de su borde? */
export function dentroDe(poligono, p, margen = 0) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i], [xj, yj] = poligono[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
    if (margen && distSegmento(p, poligono[j], poligono[i]) < margen) return false;
  }
  return dentro;
}
