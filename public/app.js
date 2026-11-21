'use strict';

/* =========================================================================
   Calles de Victoria: capas de asfalto y tierra sobre Leaflet.
   Sin base de datos: los GeoJSON se sirven como archivos estáticos y los
   cambios de capa se guardan en el navegador (localStorage) hasta que se
   descargan como GeoJSON nuevos.
   ========================================================================= */

/* ---------- Configuración ---------- */
const CAPAS = ['asfalto', 'tierra'];   // capas reales: se cuentan, se exportan y son destino de "mover"
const SIN = 'sinclasificar';           // calles de OSM que no están en ninguna capa; se pueden "pintar"
const TODAS = [...CAPAS, SIN];         // SIN va última: si un id ya está en asfalto/tierra, se ignora acá
const NOMBRE = { asfalto: 'Asfalto', tierra: 'Tierra', sinclasificar: 'Sin clasificar' };
const ARCHIVO = {
  asfalto: 'data/asfalto.geojson',
  tierra: 'data/tierra.geojson',
  sinclasificar: 'data/sin-clasificar.geojson',
};
const CLAVE_CAMBIOS = 'victoriamap:cambios:v1';
const CLAVE_PREFS = 'victoriamap:prefs:v1';
// Expositor: por defecto solo se mira y se busca. Con ?editar en la URL aparecen la selección de calles,
// mover/pintar, deshacer y descargas.
const EDICION = new URLSearchParams(window.location.search).has('editar');
const VISTA_INICIAL = { centro: [-32.62, -60.155] }; // el zoom inicial es zoomMinimo()
const ANCHO_CALLE_M = 10;    // ancho con el que se "pinta" la calle; a zoom alto cubre la calzada del mapa
// Zoom más alejado permitido (y vista inicial): en compu escala ~300 m (15); en celular ~500 m (14),
// para ver la ciudad entera en una pantalla angosta. Celular = el mismo corte que el CSS (≤ 720 px).
const esCelular = () => window.innerWidth <= 720;
const zoomMinimo = () => (esCelular() ? 14 : 15);
const ZOOM_MIN = zoomMinimo();
const zoomEtiquetas = () => zoomMinimo(); // los nombres se ven desde la vista más alejada
const LIMITE_M = 5000;       // no se puede desplazar el mapa más de 5 km fuera del área de los datos
const ZOOM_MAX = 18;         // escala ~50 m: más cerca, el satélite de Esri muestra "Map data not yet available"
// Fecha de los datos publicados (año, mes, día): mantenerla junto con public/data/. De acá salen
// "16 de noviembre de 2026" (panel de celular) y "16 nov 2026" (pie del panel de compu).
const FECHA_DATOS = [2026, 11, 16];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ACTUALIZACION_DATOS = `${FECHA_DATOS[2]} de ${MESES[FECHA_DATOS[1] - 1]} de ${FECHA_DATOS[0]}`;
const ACTUALIZACION_CORTA = `${FECHA_DATOS[2]} ${MESES[FECHA_DATOS[1] - 1].slice(0, 3)} ${FECHA_DATOS[0]}`;
// Panel de compu (≥ 1024 px): una sola fila con título, buscador, barra-filtro y Verificadas, más un pie.
const esEscritorio = window.matchMedia('(min-width: 1024px)');

const PALETAS = {
  mapa: { asfalto: '#3b5bdb', tierra: '#e8590c', sinclasificar: '#495057', sel: '#d6336c' },
  color: { asfalto: '#3b5bdb', tierra: '#e8590c', sinclasificar: '#495057', sel: '#d6336c' },
  // Fondo "Gris" con tema oscuro (fondo gris oscuro de Esri): colores más claros para que contrasten.
  oscuro: { asfalto: '#748ffc', tierra: '#ff922b', sinclasificar: '#ced4da', sel: '#f06595' },
  satelite: { asfalto: '#74c0fc', tierra: '#ffa94d', sinclasificar: '#f1f3f5', sel: '#f06595' },
};

const temaOscuro = () => document.documentElement.dataset.tema === 'oscuro'; // lo pone tema.js

const FONDOS = {
  // Fondo gris sin textos ni números de casa: los nombres los escribe la app (ver actualizarEtiquetas).
  // Esri lo sirve hasta zoom 16; más cerca se agranda, y al ser gris liso no molesta.
  // Con tema oscuro se usa la versión gris oscura del mismo fondo.
  mapa: () => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${temaOscuro() ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: ZOOM_MAX,
    maxNativeZoom: 16,
    attribution: 'Mapa base &copy; Esri, HERE, Garmin',
  }),
  // A color, sin números de casa hasta zoom 17 (a 18 los trae: por eso se agranda el 17).
  color: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: ZOOM_MAX,
    maxNativeZoom: 17,
    attribution: 'Mapa base &copy; Esri, HERE, Garmin, USGS',
  }),
  satelite: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: ZOOM_MAX,
    maxNativeZoom: ZOOM_MAX,
    attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics',
  }),
};

/* ---------- Estado ---------- */
const estado = {
  tramos: new Map(),   // id (string) -> { id, props, geometry, capa, original, largo, layer }
  visibles: { asfalto: true, tierra: true, sinclasificar: true },
  seleccion: new Set(),
  historial: [],       // pila para deshacer: cada entrada es [[id, capaAnterior], ...]
  multiple: false,
  nombres: true,         // los nombres de calle siempre se muestran (ya no hay interruptor)
  soloVerificadas: false, // filtro "Solo calles verificadas": oculta las cuadras satelitales
  fondo: 'mapa',
  busqueda: '',
};

/* ---------- Utilidades ---------- */
const $ = (selector) => document.querySelector(selector);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtEntero = new Intl.NumberFormat('es-AR');
const fmtDecimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtKm = (m) => `${fmtDecimal.format(m / 1000)} km`;
const fmtLargo = (m) => (m >= 1000 ? fmtKm(m) : `${fmtEntero.format(Math.round(m))} m`);
const plural = (n, uno, varios) => `${fmtEntero.format(n)} ${n === 1 ? uno : varios}`;
const compararIds = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const nombreFuente = (f) => ({ verificada: 'Verificada', satelital: 'Satelital', osm: 'OpenStreetMap' })[f] ?? '—';
const nombreTramo = (t) => (t.props.nombre ? `Cuadra de ${t.props.nombre}` : 'Cuadra sin nombre');

function leerJSON(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(clave);
    return valor ? JSON.parse(valor) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribirJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento no disponible: los cambios viven solo en esta pestaña */
  }
}

function distancia([lon1, lat1], [lon2, lat2]) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Lleva longitudes "con vueltas" (p. ej. -780.16, típico de exportaciones de uMap) a [-180, 180).
function normalizarCoords(c) {
  if (typeof c[0] !== 'number') return c.map(normalizarCoords);
  const [lon, ...resto] = c;
  if (lon >= -180 && lon < 180) return c;
  return [Number(((((lon + 180) % 360) + 360) % 360 - 180).toFixed(6)), ...resto];
}

function largoGeometria(geometry) {
  const lineas = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const linea of lineas) {
    for (let i = 1; i < linea.length; i++) total += distancia(linea[i - 1], linea[i]);
  }
  return total;
}

// Geometría en píxeles para ubicar etiquetas sin que se pisen.
function distPuntoSegmento([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function distSegmentos(a, b, c, d) {
  const lado = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  if (lado(a, b, c) !== lado(a, b, d) && lado(c, d, a) !== lado(c, d, b)) return 0;
  return Math.min(distPuntoSegmento(a, c, d), distPuntoSegmento(b, c, d), distPuntoSegmento(c, a, b), distPuntoSegmento(d, a, b));
}

/* ---------- Mapa ---------- */
const map = L.map('map', {
  zoomControl: false, boxZoom: false, minZoom: ZOOM_MIN, maxZoom: ZOOM_MAX, maxBoundsViscosity: 1,
  attributionControl: false, // los créditos van dentro del panel (actualizarCreditos), no en una "i" sobre el mapa
  // Zoom suave: con la rueda o el pellizco se avanza de a cuartos de nivel y más despacio.
  zoomSnap: 0.25,
  wheelPxPerZoomLevel: 120,
})
  .setView(VISTA_INICIAL.centro, ZOOM_MIN);

// Botones + y −: en vez del salto de un nivel, un vuelo corto hasta el zoom siguiente (salvo "reducir movimiento").
// Se reemplazan antes de agregar el control, porque Leaflet engancha los clics al agregarlo.
const controlZoom = L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' });
const zoomSuave = (delta) => {
  const destino = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), Math.round(map.getZoom() + delta)));
  if (destino === map.getZoom()) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) map.setZoom(destino);
  else map.flyTo(map.getCenter(), destino, { duration: 0.45, easeLinearity: 0.2 });
};
controlZoom._zoomIn = () => zoomSuave(1);
controlZoom._zoomOut = () => zoomSuave(-1);
controlZoom.addTo(map);
// Escala: debajo del botón de centrar el mapa (styles.css, .escala-flotante), no en una esquina de Leaflet.
const controlEscala = L.control.scale({ position: 'topright', imperial: false }).addTo(map);
controlEscala.getContainer().classList.add('escala-flotante');
map.getContainer().append(controlEscala.getContainer());

/* Créditos del mapa: las licencias de OpenStreetMap (calles y nombres) y de Esri (fondos) piden mostrarlos.
   Van en una línea chica dentro del panel, siempre visible, y cambian con el fondo elegido. */
const CREDITO_OSM = 'Calles y nombres &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
function actualizarCreditos() {
  const fondo = capaFondo?.getAttribution?.() ?? '';
  const linea = document.querySelector('#creditos-mapa');
  if (linea) linea.innerHTML = [CREDITO_OSM, fondo].filter(Boolean).join(' · '); // textos fijos nuestros, no de usuarios
  // Pie del panel de compu, más corto: "© OpenStreetMap · Esri, HERE, Garmin"
  const pie = document.querySelector('[data-creditos]');
  if (pie) {
    pie.innerHTML = ['&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      fondo.replace(/^.*?&copy;\s*/, '')].filter(Boolean).join(' · ');
  }
}

// Panes: halos de selección debajo de las calles; nombres por encima de todo.
map.createPane('halos').style.zIndex = 390;
map.createPane('etiquetas').style.zIndex = 450;
const rendererTramos = L.canvas({ padding: 0.5, tolerance: 8 });
const rendererHalos = L.canvas({ padding: 0.5, pane: 'halos' });

const grupos = Object.fromEntries(TODAS.map((capa) => [capa, L.layerGroup()]));
const halos = L.layerGroup().addTo(map);
const etiquetas = L.layerGroup().addTo(map);
const conHover = window.matchMedia('(hover: hover)').matches;
let capaFondo = null;
let idsDibujados = new Set();

const paleta = () => (estado.fondo === 'mapa' && temaOscuro() ? PALETAS.oscuro : PALETAS[estado.fondo] ?? PALETAS.mapa);

/** Ancho en píxeles de una calle de ANCHO_CALLE_M metros al zoom actual (mínimo 3 px para la vista general). */
function anchoCalle() {
  const metrosPorPixel = (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
  return Math.min(36, Math.max(3, ANCHO_CALLE_M / metrosPorPixel));
}

function estilo(t, resaltado = false) {
  const pendiente = t.capa === SIN;
  const base = anchoCalle();
  const punteado = pendiente || t.props.fuente === 'satelital';
  return {
    color: paleta()[t.capa],
    weight: resaltado || estado.seleccion.has(t.id) ? base + 2 : base,
    opacity: 1,
    dashArray: punteado ? `${Math.round(base * 1.4 + 3)} ${Math.round(base + 3)}` : null,
    lineCap: punteado ? 'butt' : 'round',
    lineJoin: 'round',
  };
}

function crearTramo(props, geometry, capa) {
  const id = String(props.id);
  const t = { id, props, geometry, capa, original: capa, largo: largoGeometria(geometry), layer: null };
  const nivel = geometry.type === 'LineString' ? 0 : 1;

  t.layer = L.polyline(L.GeoJSON.coordsToLatLngs(geometry.coordinates, nivel), {
    renderer: rendererTramos,
    interactive: EDICION, // en el expositor las calles no se seleccionan
    ...estilo(t),
  });

  t.layer.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    const o = e.originalEvent;
    tocarTramo(id, estado.multiple || o.shiftKey || o.ctrlKey || o.metaKey);
  });

  if (EDICION && conHover) {
    t.layer.on('mouseover', () => t.layer.setStyle(estilo(t, true)));
    t.layer.on('mouseout', () => t.layer.setStyle(estilo(t)));
  }

  grupos[capa].addLayer(t.layer);
  estado.tramos.set(id, t);
}

/** Restiliza los tramos cuya selección cambió y vuelve a dibujar los halos. */
function dibujarSeleccion() {
  for (const id of new Set([...idsDibujados, ...estado.seleccion])) {
    const t = estado.tramos.get(id);
    if (t) t.layer.setStyle(estilo(t));
  }
  idsDibujados = new Set(estado.seleccion);

  halos.clearLayers();
  for (const id of estado.seleccion) {
    const t = estado.tramos.get(id);
    halos.addLayer(L.polyline(t.layer.getLatLngs(), {
      renderer: rendererHalos,
      interactive: false,
      color: paleta().sel,
      weight: estilo(t).weight + 12,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    }));
    t.layer.bringToFront();
  }
}

function restilizarTodo() {
  for (const t of estado.tramos.values()) t.layer.setStyle(estilo(t));
  dibujarSeleccion();
}

/* ---------- Nombres de calles ---------- */

// Proyección local en metros (alcanza para una ciudad), para agrupar cuadras alineadas.
const KX = 111320 * Math.cos((VISTA_INICIAL.centro[0] * Math.PI) / 180);
const KY = 110540;
const difAng = (x, y) => {
  const d = Math.abs(x - y) % Math.PI;
  return Math.min(d, Math.PI - d);
};
const aLo = ([x, y], ang) => x * Math.cos(ang) + y * Math.sin(ang);       // posición a lo largo de la recta
const perp = ([x, y], ang) => -x * Math.sin(ang) + y * Math.cos(ang);     // distancia perpendicular
const aLatLng = (t, ang, d) => L.latLng(
  (t * Math.sin(ang) + d * Math.cos(ang)) / KY,
  (t * Math.cos(ang) - d * Math.sin(ang)) / KX,
);

/**
 * Corridas: cuadras visibles con el mismo nombre que están sobre la misma recta, unidas en un solo
 * segmento (una calle recta entera, aunque mezcle asfalto y tierra). Sirven para escribir el nombre
 * a lo largo de varias cuadras cuando el zoom es bajo y una cuadra sola es demasiado corta.
 */
let corridas = [];
function calcularCorridas() {
  const porNombre = new Map();
  for (const t of estado.tramos.values()) {
    if (!t.props.nombre || !seVe(t)) continue;
    const ll = t.layer.getLatLngs();
    const pts = L.LineUtil.isFlat(ll) ? ll : ll.flat();
    const a = [pts[0].lng * KX, pts[0].lat * KY];
    const b = [pts[pts.length - 1].lng * KX, pts[pts.length - 1].lat * KY];
    const ang = ((Math.atan2(b[1] - a[1], b[0] - a[0]) % Math.PI) + Math.PI) % Math.PI;
    if (!porNombre.has(t.props.nombre)) porNombre.set(t.props.nombre, []);
    porNombre.get(t.props.nombre).push({ a, b, ang });
  }

  corridas = [];
  for (const [nombre, segmentos] of porNombre) {
    const rectas = []; // { ang, d, intervalos: [[t0, t1], ...] }
    for (const s of segmentos) {
      let r = rectas.find((g) => difAng(g.ang, s.ang) < 0.1 && Math.abs(perp(s.a, g.ang) - g.d) < 15);
      if (!r) {
        r = { ang: s.ang, d: perp(s.a, s.ang), intervalos: [] };
        rectas.push(r);
      }
      const [t0, t1] = [aLo(s.a, r.ang), aLo(s.b, r.ang)];
      r.intervalos.push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
    for (const r of rectas) {
      r.intervalos.sort((x, y) => x[0] - y[0]);
      let [ini, fin] = r.intervalos[0];
      const cerrar = () => corridas.push({ nombre, a: aLatLng(ini, r.ang, r.d), b: aLatLng(fin, r.ang, r.d) });
      for (const [t0, t1] of r.intervalos.slice(1)) {
        if (t0 - fin <= 25) fin = Math.max(fin, t1); // cuadras seguidas (se toleran esquinas anchas)
        else {
          cerrar();
          [ini, fin] = [t0, t1];
        }
      }
      cerrar();
    }
  }
}

/**
 * Escribe los nombres sobre las calles visibles, girados según la calle. Cada corrida lleva una
 * etiqueta cada cierto trecho; primero las calles más largas, y se descarta una etiqueta si pisa
 * a otra o si repite el mismo nombre demasiado cerca.
 */
function actualizarEtiquetas() {
  etiquetas.clearLayers();
  if (!estado.nombres || map.getZoom() < zoomEtiquetas()) return;

  const z = map.getZoom();
  const tam = z >= 18 ? 13 : z >= 16 ? 12 : 11;
  const alto = tam + 4;
  const tamaño = map.getSize();
  const pantalla = L.bounds([0, 0], [tamaño.x, tamaño.y]);

  const candidatos = [];
  for (const c of corridas) {
    const a = map.latLngToContainerPoint(c.a);
    const b = map.latLngToContainerPoint(c.b);
    const largo = a.distanceTo(b);
    const ancho = c.nombre.length * tam * 0.55 + 6;
    if (largo < ancho * 0.9) continue;
    const ux = (b.x - a.x) / largo;
    const uy = (b.y - a.y) / largo;
    const en = (k) => L.point(a.x + ux * k, a.y + uy * k);

    // Posiciones fijas a lo largo de la calle (no saltan al desplazar el mapa).
    const separacionMinima = z >= 17 ? 2.2 : 3.2;
    const paso = ancho * separacionMinima + 200;
    const n = Math.max(1, Math.floor(largo / paso));
    let alguna = false;
    for (let i = 0; i < n; i++) {
      const p = en(((i + 0.5) / n) * largo);
      if (!pantalla.contains(p)) continue;
      candidatos.push({ p, ux, uy, ancho, nombre: c.nombre, largo });
      alguna = true;
    }
    // Si ninguna cae en pantalla pero se ve un buen pedazo de la calle, una en el medio de lo visible.
    if (!alguna) {
      const recorte = L.LineUtil.clipSegment(a, b, pantalla, false, false);
      if (recorte && recorte[0].distanceTo(recorte[1]) >= ancho * 1.2) {
        candidatos.push({ p: recorte[0].add(recorte[1]).divideBy(2), ux, uy, ancho, nombre: c.nombre, largo });
      }
    }
  }
  candidatos.sort((x, y) => y.largo - x.largo);

  const puestas = [];
  for (const c of candidatos) {
    const centro = [c.p.x, c.p.y];
    const p1 = [centro[0] - (c.ux * c.ancho) / 2, centro[1] - (c.uy * c.ancho) / 2];
    const p2 = [centro[0] + (c.ux * c.ancho) / 2, centro[1] + (c.uy * c.ancho) / 2];
    const choca = puestas.some((o) => distSegmentos(p1, p2, o.p1, o.p2) < alto
      || (o.nombre === c.nombre
        && Math.hypot(o.centro[0] - centro[0], o.centro[1] - centro[1]) < c.ancho * (z >= 17 ? 2.5 : 3.5)));
    if (choca) continue;
    puestas.push({ p1, p2, centro, nombre: c.nombre });

    let grados = (Math.atan2(c.uy, c.ux) * 180) / Math.PI;
    if (grados > 90) grados -= 180;
    else if (grados <= -90) grados += 180;
    etiquetas.addLayer(L.marker(map.containerPointToLatLng(c.p), {
      pane: 'etiquetas',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'etiqueta',
        iconSize: [0, 0],
        html: `<span style="font-size:${tam}px;transform:translate(-50%,-50%) rotate(${grados.toFixed(1)}deg)">${esc(c.nombre)}</span>`,
      }),
    }));
  }
}

/** El mapa no se puede alejar de la ciudad: área de los datos más LIMITE_M metros alrededor. */
function limitarArea() {
  const datos = L.latLngBounds([]);
  for (const t of estado.tramos.values()) datos.extend(t.layer.getBounds());
  if (!datos.isValid()) return;
  const dLat = LIMITE_M / KY;
  const dLng = LIMITE_M / KX;
  map.setMaxBounds(L.latLngBounds(
    [datos.getSouth() - dLat, datos.getWest() - dLng],
    [datos.getNorth() + dLat, datos.getEast() + dLng],
  ));
}

/* ---------- Buscador de calles y alturas ---------- */
// La numeración (public/data/alturas.json, `npm run alturas`) no se dibuja: solo se usa para ubicar
// direcciones. Se descarga en la primera búsqueda que tiene número.
let alturas = null; // [[lon, lat, número, calle], ...]
const resaltado = L.layerGroup().addTo(map); // calle encontrada y pin de la dirección

const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

async function cargarAlturas() {
  if (alturas) return alturas;
  try {
    const respuesta = await fetch('data/alturas.json', { cache: 'no-cache' });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    alturas = (await respuesta.json()).puntos ?? [];
  } catch (error) {
    console.error(error);
    alturas = [];
  }
  return alturas;
}

/** Nombres de calle conocidos (de las capas), para sugerir y para reconocer lo que se escribe. */
function nombresDeCalles() {
  const nombres = new Set();
  for (const t of estado.tramos.values()) if (t.props.nombre) nombres.add(t.props.nombre);
  return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
}

/** "Laprida 450" -> { calle: 'Laprida', numero: 450 }. Acepta también "Laprida al 450". */
function interpretarBusqueda(texto) {
  const m = texto.trim().match(/^(.*?)(?:\s+(?:al|n[°º]?|nro\.?))?\s+(\d{1,5})$/i);
  if (m && m[1].trim()) return { texto: m[1].trim(), numero: Number(m[2]) };
  return { texto: texto.trim(), numero: null };
}

/** Busca la calle por nombre: primero exacto, después "empieza con", después "contiene". */
function encontrarCalle(texto) {
  const buscado = normalizar(texto).replace(/^(calle|avenida|av\.?|bulevar|bv\.?) /, '');
  if (!buscado) return null;
  const nombres = nombresDeCalles();
  const norm = nombres.map((n) => [n, normalizar(n)]);
  const sinPrefijo = (n) => n.replace(/^(calle|avenida|bulevar) /, '');
  return (norm.find(([, n]) => n === buscado || sinPrefijo(n) === buscado)
    ?? norm.find(([, n]) => n.startsWith(buscado) || sinPrefijo(n).startsWith(buscado))
    ?? norm.find(([, n]) => n.includes(buscado)))?.[0] ?? null;
}

/**
 * Ubica una altura sobre la calle. OSM tiene números en las esquinas de cada cuadra (p. ej. 401 y 499):
 * se busca el par del mismo lado (par/impar) que encierra el número y se interpola entre los dos.
 */
function ubicarAltura(calle, numero) {
  const puntos = alturas
    .filter((p) => p[3] === calle)
    .map(([lon, lat, n]) => ({ latlng: L.latLng(lat, lon), n: parseInt(n, 10) }))
    .filter((p) => Number.isFinite(p.n));
  if (!puntos.length) return null;

  const exacto = puntos.find((p) => p.n === numero);
  if (exacto) return { latlng: exacto.latlng, aproximado: false };

  let mejor = null;
  for (const a of puntos) {
    for (const b of puntos) {
      if (!(a.n < numero && numero < b.n) || a.n % 2 !== b.n % 2) continue;
      if (a.latlng.distanceTo(b.latlng) > 250) continue; // tienen que ser de la misma cuadra
      if (!mejor || b.n - a.n < mejor.b.n - mejor.a.n) mejor = { a, b };
    }
  }
  if (mejor) {
    const k = (numero - mejor.a.n) / (mejor.b.n - mejor.a.n);
    const latlng = L.latLng(
      mejor.a.latlng.lat + (mejor.b.latlng.lat - mejor.a.latlng.lat) * k,
      mejor.a.latlng.lng + (mejor.b.latlng.lng - mejor.a.latlng.lng) * k,
    );
    return { latlng, aproximado: false };
  }
  // Fuera de rango: la altura cargada más cercana.
  const cercano = puntos.reduce((x, y) => (Math.abs(y.n - numero) < Math.abs(x.n - numero) ? y : x));
  return { latlng: cercano.latlng, aproximado: true, numeroCercano: cercano.n };
}

/** La cuadra de esa calle más cercana a un punto (para decir si es de asfalto o de tierra). */
function cuadraMasCercana(calle, latlng) {
  let mejor = null;
  const p = map.latLngToLayerPoint(latlng);
  for (const t of estado.tramos.values()) {
    if (t.props.nombre !== calle) continue;
    const ll = t.layer.getLatLngs();
    const pts = (L.LineUtil.isFlat(ll) ? ll : ll.flat()).map((x) => map.latLngToLayerPoint(x));
    for (let i = 1; i < pts.length; i++) {
      const d = L.LineUtil.pointToSegmentDistance(p, pts[i - 1], pts[i]);
      if (!mejor || d < mejor.d) mejor = { t, d };
    }
  }
  return mejor?.t ?? null;
}

function limpiarBusqueda(reiniciar = true) {
  resaltado.clearLayers();
  $('#resultado').innerHTML = '';
  $('#resultado').hidden = true;
  if (reiniciar) {
    estado.busqueda = '';
    $('#busqueda').value = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }
}

function resaltarCalle(cuadras) {
  for (const t of cuadras) {
    resaltado.addLayer(L.polyline(t.layer.getLatLngs(), {
      renderer: rendererHalos,
      interactive: false,
      color: paleta().sel,
      weight: estilo(t).weight + 12,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    }));
  }
}

function mostrarResultado(html) {
  const caja = $('#resultado');
  caja.innerHTML = html;
  caja.hidden = false;
  caja.classList.remove('aparecer'); // se reinicia la animación en cada búsqueda
  void caja.offsetWidth;
  caja.classList.add('aparecer');
}

function accionesBusqueda() {
  return `<div class="acciones">
    <button type="button" class="btn" data-accion="compartir-busqueda">Compartir</button>
    <button type="button" class="btn" data-accion="ver-todo">Ver toda la ciudad</button>
  </div>`;
}

async function buscar(texto) {
  limpiarBusqueda(false);
  estado.busqueda = texto.trim();
  const { texto: textoCalle, numero } = interpretarBusqueda(texto);
  if (!textoCalle) return;
  const url = new URL(window.location.href);
  url.searchParams.set('q', estado.busqueda);
  history.replaceState(null, '', url);
  const calle = encontrarCalle(textoCalle);
  if (!calle) {
    mostrarResultado(`<p class="vacio">No encontramos una calle "${esc(textoCalle)}" en Victoria.</p>`);
    return;
  }
  const cuadras = [...estado.tramos.values()].filter((t) => t.props.nombre === calle);

  // Solo la calle: se resalta entera y se muestra cuánto tiene de cada tipo.
  if (numero == null) {
    resaltarCalle(cuadras);
    encuadrar(cuadras, { maxZoom: 17 });
    const porCapa = TODAS.map((c) => [c, cuadras.filter((t) => t.capa === c)]).filter(([, l]) => l.length);
    mostrarResultado(`<div class="sel-cabecera"><strong>${esc(calle)}</strong></div>
      <p class="sel-resumen">${porCapa.map(([c, l]) => chip(c, l.length)).join('')}
        <span>${plural(cuadras.length, 'cuadra', 'cuadras')} · ${fmtLargo(cuadras.reduce((s, t) => s + t.largo, 0))}</span></p>
      ${accionesBusqueda()}`);
    return;
  }

  // Calle y altura: se ubica el punto y se informa el tipo de calzada de esa cuadra.
  await cargarAlturas();
  const ubicacion = ubicarAltura(calle, numero);
  if (!ubicacion) {
    resaltarCalle(cuadras);
    encuadrar(cuadras, { maxZoom: 17 });
    mostrarResultado(`<div class="sel-cabecera"><strong>${esc(calle)}</strong></div>
      <p class="nota">No hay numeración cargada para esta calle; se muestra la calle entera.</p>
      ${accionesBusqueda()}`);
    return;
  }
  const cuadra = cuadraMasCercana(calle, ubicacion.latlng);
  if (cuadra) resaltarCalle([cuadra]);
  resaltado.addLayer(L.marker(ubicacion.latlng, {
    pane: 'etiquetas',
    interactive: false,
    keyboard: false,
    icon: L.divIcon({ className: 'pin', iconSize: [0, 0], html: '<span class="pin-punto"></span>' }),
  }));
  const zoomDireccion = Math.max(map.getZoom(), 17);
  if (movimientoReducido()) map.setView(ubicacion.latlng, zoomDireccion);
  else map.flyTo(ubicacion.latlng, zoomDireccion, { duration: 1 });
  mostrarResultado(`<div class="sel-cabecera"><strong>${esc(calle)} ${fmtEntero.format(numero)}</strong>
      ${cuadra ? chip(cuadra.capa) : ''}</div>
    ${cuadra ? `<p class="nota">${cuadra.capa === SIN ? 'Esta cuadra no fue relevada.' : `Cuadra de ${NOMBRE[cuadra.capa].toLowerCase()}`}${cuadra.props.fuente === 'satelital' ? ' (según imagen satelital)' : ''}.</p>` : ''}
    ${ubicacion.aproximado ? `<p class="nota">No hay numeración cargada para el ${fmtEntero.format(numero)}; se muestra la más cercana (${fmtEntero.format(ubicacion.numeroCercano)}).</p>` : ''}
    ${accionesBusqueda()}`);
}

/**
 * Sugerencias del buscador: recién desde la 2.ª letra, hasta 8 calles; primero las que empiezan con lo escrito.
 * (Antes la lista traía todas las calles apenas se tocaba el campo.)
 */
function sugerirCalles(texto) {
  const buscado = normalizar(interpretarBusqueda(texto).texto);
  if (buscado.length < 2) {
    $('#calles').innerHTML = '';
    return;
  }
  const nombres = nombresDeCalles();
  const empiezan = nombres.filter((n) => normalizar(n).startsWith(buscado));
  const contienen = nombres.filter((n) => !empiezan.includes(n) && normalizar(n).includes(buscado));
  $('#calles').innerHTML = [...empiezan, ...contienen].slice(0, 8).map((n) => `<option value="${esc(n)}">`).join('');
}

function prepararBuscador() {
  $('#calles').innerHTML = '';
  $('#buscador').addEventListener('submit', (e) => {
    e.preventDefault();
    buscar($('#busqueda').value);
  });
  $('#busqueda').addEventListener('input', (e) => {
    sugerirCalles(e.target.value);
    if (!e.target.value.trim()) limpiarBusqueda();
  });
}

async function compartirBusqueda() {
  if (!estado.busqueda) {
    toast('Hacé una búsqueda antes de compartirla.');
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('editar');
  url.searchParams.set('q', estado.busqueda);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Calles de Victoria', text: estado.busqueda, url: url.href });
    } else {
      await navigator.clipboard.writeText(url.href);
      toast('Enlace copiado al portapapeles.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('No se pudo compartir el enlace. Podés copiarlo desde la barra de direcciones.');
  }
}

function verTodaLaCiudad(animar = true) {
  // En compu la ciudad se centra en toda la pantalla (sin correrse para esquivar el panel).
  encuadrar([...estado.tramos.values()].filter((t) => t.capa !== SIN), { maxZoom: zoomMinimo(), animate: animar, centrado: true });
}

/**
 * Márgenes para encuadrar. Compu: el panel es un dock abajo al centro; con `centrado` (vista de toda la ciudad)
 * se centra en toda la pantalla, y si no, se deja libre la franja del dock. Celular: por encima del panel.
 */
function relleno(centrado = false) {
  const r = $('#panel').getBoundingClientRect();
  if (window.innerWidth > 720) {
    if (centrado) return { paddingTopLeft: [24, 24], paddingBottomRight: [24, 24] };
    return { paddingTopLeft: [24, 24], paddingBottomRight: [24, Math.max(24, window.innerHeight - r.top + 16)] };
  }
  return { paddingTopLeft: [16, 16], paddingBottomRight: [16, Math.max(16, window.innerHeight - r.top + 16)] };
}

const movimientoReducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Encuadra las cuadras. Por defecto vuela hasta ellas; con { animate: false } (o "reducir movimiento") salta. */
function encuadrar(tramos, opciones = {}) {
  const limites = L.latLngBounds([]);
  for (const t of tramos) limites.extend(t.layer.getBounds());
  if (!limites.isValid()) return;
  const { centrado = false, ...resto } = opciones;
  opciones = resto;
  if (opciones.animate === false || movimientoReducido()) map.fitBounds(limites, { ...relleno(centrado), ...opciones, animate: false });
  else map.flyToBounds(limites, { ...relleno(centrado), duration: 0.9, ...opciones });
}

/* ---------- Acciones ---------- */
function tocarTramo(id, sumar) {
  const sel = estado.seleccion;
  if (sumar) {
    if (sel.has(id)) sel.delete(id);
    else sel.add(id);
  } else if (sel.size === 1 && sel.has(id)) {
    sel.clear();
  } else {
    sel.clear();
    sel.add(id);
  }
  dibujarSeleccion();
  renderSeleccion();
}

function limpiarSeleccion() {
  if (!estado.seleccion.size) return;
  estado.seleccion.clear();
  dibujarSeleccion();
  renderSeleccion();
}

/** ¿El filtro "Solo calles verificadas" esconde este tramo? */
const filtrado = (t) => estado.soloVerificadas && t.props.fuente === 'satelital';
/** ¿El tramo se ve en el mapa? (capa visible y no filtrado) */
const seVe = (t) => estado.visibles[t.capa] && !filtrado(t);

function asignarCapa(t, capa) {
  grupos[t.capa].removeLayer(t.layer);
  t.capa = capa;
  t.layer.setStyle(estilo(t));
  if (!filtrado(t)) grupos[capa].addLayer(t.layer);
  if (!seVe(t)) estado.seleccion.delete(t.id);
}

/** Muestra solo las cuadras verificadas (oculta las satelitales del mapa, los conteos y los nombres). */
function setSoloVerificadas(activo, guardar = true) {
  estado.soloVerificadas = activo;
  for (const boton of document.querySelectorAll('[data-verificadas]')) { // chip (celular) y botón del panel de compu
    boton.setAttribute('aria-pressed', String(activo));
    const icono = boton.querySelector('.bi');
    if (icono) icono.className = `bi ${activo ? 'bi-check-lg' : 'bi-circle'}`; // ✓ prendido, ○ apagado
    const texto = boton.querySelector('.verif-icono');
    if (texto) texto.textContent = activo ? '✓' : '○';
  }
  for (const t of estado.tramos.values()) {
    if (t.props.fuente !== 'satelital') continue;
    if (activo) {
      grupos[t.capa].removeLayer(t.layer);
      estado.seleccion.delete(t.id);
    } else {
      grupos[t.capa].addLayer(t.layer);
    }
  }
  dibujarSeleccion();
  if (guardar) guardarPrefs();
  render();
}

function mover(ids, destino) {
  const cambios = [];
  for (const id of ids) {
    const t = estado.tramos.get(id);
    if (!t || t.capa === destino) continue;
    cambios.push([id, t.capa]);
    asignarCapa(t, destino);
  }
  if (!cambios.length) return;

  estado.historial.push(cambios);
  guardarCambios();
  dibujarSeleccion();
  render();

  const pintados = cambios.every(([, anterior]) => anterior === SIN);
  const verbo = pintados ? 'pintada como' : 'movida a';
  const texto = cambios.length === 1
    ? `${nombreTramo(estado.tramos.get(cambios[0][0]))} ${verbo} ${NOMBRE[destino]}`
    : `${cambios.length} cuadras ${pintados ? 'pintadas como' : 'movidas a'} ${NOMBRE[destino]}`;
  toast(texto + (estado.visibles[destino] ? '' : ' (capa oculta)'), true);
}

function deshacer() {
  const cambios = estado.historial.pop();
  if (!cambios) return;
  for (const [id, anterior] of cambios) {
    const t = estado.tramos.get(id);
    if (t) asignarCapa(t, anterior);
  }
  guardarCambios();
  dibujarSeleccion();
  render();
  toast(cambios.length === 1
    ? `${nombreTramo(estado.tramos.get(cambios[0][0]))} vuelve a ${NOMBRE[cambios[0][1]]}`
    : `Se deshicieron ${cambios.length} cambios`);
}

const tramosMovidos = () => [...estado.tramos.values()].filter((t) => t.capa !== t.original);

function restablecer() {
  const movidos = tramosMovidos();
  if (!movidos.length) return;
  const ok = window.confirm(
    `¿Devolver ${plural(movidos.length, 'cuadra', 'cuadras')} a su capa original?\nSe borran los cambios guardados en este navegador.`,
  );
  if (!ok) return;
  for (const t of movidos) asignarCapa(t, t.original);
  estado.historial = [];
  guardarCambios();
  dibujarSeleccion();
  render();
  toast('Se restablecieron las capas originales');
}

function verCambios() {
  const movidos = tramosMovidos().filter((t) => estado.visibles[t.capa]);
  if (!movidos.length) {
    toast('Las cuadras movidas están en una capa oculta');
    return;
  }
  estado.seleccion = new Set(movidos.map((t) => t.id));
  dibujarSeleccion();
  renderSeleccion();
  encuadrar(movidos, { maxZoom: 17 });
}

function setVisible(capa, visible) {
  estado.visibles[capa] = visible;
  if (visible) {
    grupos[capa].addTo(map);
  } else {
    map.removeLayer(grupos[capa]);
    for (const id of [...estado.seleccion]) {
      if (estado.tramos.get(id)?.capa === capa) estado.seleccion.delete(id);
    }
  }
  dibujarSeleccion();
  guardarPrefs();
  render();
}

function aplicarFondo(nombre) {
  if (!FONDOS[nombre]) return;
  if (capaFondo) map.removeLayer(capaFondo);
  capaFondo = FONDOS[nombre]().addTo(map);
  estado.fondo = nombre;
  actualizarCreditos();
  // Fondo oscuro (satélite, o gris con tema oscuro): nombres en blanco con halo oscuro.
  map.getContainer().classList.toggle('fondo-oscuro', nombre === 'satelite' || (nombre === 'mapa' && temaOscuro()));

  const pal = paleta();
  const raiz = document.documentElement.style;
  // En el panel, sin clasificar queda siempre gris oscuro (styles.css): el blanco del satélite
  // hacía que su interruptor pareciera apagado.
  for (const capa of CAPAS) raiz.setProperty(`--c-${capa}`, pal[capa]);
  raiz.setProperty('--c-sel', pal.sel);
  document.querySelectorAll('[data-accion="fondo"]').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.fondo === nombre)); // opciones del menú de fondo
  });
  restilizarTodo();
}

function descargar(capa) {
  const features = [...estado.tramos.values()]
    .filter((t) => t.capa === capa)
    .sort((a, b) => compararIds(a.id, b.id))
    .map((t) => ({ type: 'Feature', properties: t.props, geometry: t.geometry }));
  const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features })], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${capa}.geojson` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Descargado ${capa}.geojson (${plural(features.length, 'cuadra', 'cuadras')})`);
}

/* ---------- Persistencia ---------- */
function guardarCambios() {
  const cambios = {};
  for (const t of tramosMovidos()) cambios[t.id] = t.capa;
  escribirJSON(CLAVE_CAMBIOS, cambios);
}

function guardarPrefs() {
  escribirJSON(CLAVE_PREFS, { visibles: estado.visibles, fondo: estado.fondo, soloVerificadas: estado.soloVerificadas });
}

function aplicarCambiosGuardados() {
  if (!EDICION) return; // el expositor muestra siempre los datos publicados
  const guardados = leerJSON(CLAVE_CAMBIOS, {});
  if (!guardados || typeof guardados !== 'object') return;
  for (const [id, capa] of Object.entries(guardados)) {
    const t = estado.tramos.get(id);
    if (t && CAPAS.includes(capa) && t.capa !== capa) asignarCapa(t, capa);
  }
  guardarCambios(); // descarta los cambios que ya no aplican a los datos publicados
}

/* ---------- Carga de datos ---------- */
async function cargarDatos() {
  const colecciones = await Promise.all(TODAS.map(async (capa) => {
    const respuesta = await fetch(ARCHIVO[capa], { cache: 'no-cache' });
    if (!respuesta.ok) {
      if (capa === SIN) return [capa, { features: [] }]; // opcional
      throw new Error(`No se pudo cargar ${ARCHIVO[capa]} (HTTP ${respuesta.status})`);
    }
    return [capa, await respuesta.json()];
  }));

  // Cada tramo necesita un id único entre todas las capas; se asigna uno si falta o se repite.
  let maxId = 0;
  for (const [, fc] of colecciones) {
    for (const f of fc.features ?? []) {
      const n = Number(f.properties?.id);
      if (Number.isFinite(n)) maxId = Math.max(maxId, n);
    }
  }

  const usados = new Set();
  for (const [capa, fc] of colecciones) {
    for (const f of fc.features ?? []) {
      if (!f.geometry || !/^(Multi)?LineString$/.test(f.geometry.type)) continue;
      const props = { ...(f.properties ?? {}) };
      const repetido = props.id != null && usados.has(String(props.id));
      // Un tramo sin clasificar que ya se publicó en asfalto o tierra no se vuelve a mostrar.
      if (repetido && capa === SIN) continue;
      if (props.id == null || repetido) props.id = ++maxId;
      usados.add(String(props.id));
      crearTramo(props, { ...f.geometry, coordinates: normalizarCoords(f.geometry.coordinates) }, capa);
    }
  }
}

/* ---------- Interfaz ---------- */

/**
 * Totales por capa. Se cuentan **calles** (nombres distintos) y también cuadras y km.
 * Una calle con cuadras de asfalto y de tierra cuenta en las dos capas.
 */
function resumen() {
  const r = {};
  for (const capa of TODAS) r[capa] = { calles: new Set(), cuadras: 0, sinNombre: 0, largo: 0, satelital: 0 };
  for (const t of estado.tramos.values()) {
    if (filtrado(t)) continue; // con "Solo calles verificadas" se cuenta solo lo que se ve
    const x = r[t.capa];
    x.cuadras++;
    x.largo += t.largo;
    if (t.props.nombre) x.calles.add(t.props.nombre);
    else x.sinNombre++;
    if (t.props.fuente === 'satelital') x.satelital++;
  }
  return r;
}

const chip = (capa, n) =>
  `<span class="chip" style="--c: var(--c-${capa})">${n != null ? `${fmtEntero.format(n)} ` : ''}${NOMBRE[capa]}</span>`;

/** Cambia un número del panel y, si cambió de verdad, le da un pequeño salto. */
function cambiarNumero(elemento, texto) {
  if (elemento.textContent === texto) return;
  const habiaValor = elemento.textContent !== '—';
  elemento.textContent = texto;
  if (!habiaValor) return;
  elemento.classList.remove('latir');
  void elemento.offsetWidth;
  elemento.classList.add('latir');
}

function renderCapas() {
  const r = resumen();
  for (const capa of CAPAS) {
    // Chip de la capa: número de calles y si está prendida (lo que muestra el mapa).
    cambiarNumero($(`[data-conteo="${capa}"]`), fmtEntero.format(r[capa].calles.size));
    $(`[data-chip="${capa}"]`).setAttribute('aria-pressed', String(estado.visibles[capa]));
    // En la barra, la parte de una capa apagada queda tenue (celular) o gris (compu, donde es un botón).
    const barra = $(`[data-barra="${capa}"]`);
    barra.classList.toggle('apagada', !estado.visibles[capa]);
    barra.setAttribute('aria-pressed', String(estado.visibles[capa]));
  }
  cambiarNumero($('[data-conteo-barra="asfalto"]'), fmtEntero.format(r.asfalto.calles.size));
  const todas = new Set(CAPAS.flatMap((capa) => [...r[capa].calles])); // una calle con los dos tipos cuenta una vez
  cambiarNumero($('[data-total-calles]'), fmtEntero.format(todas.size));

  // La proporción va por kilómetros (una calle puede tener cuadras de los dos tipos). Se muestran enteros que suman 100.
  // El ancho de cada parte de la barra sale de --pct (en compu, flex-grow; en celular, porcentaje del ancho).
  const largo = CAPAS.reduce((suma, capa) => suma + r[capa].largo, 0);
  const pctAsfalto = largo ? (r.asfalto.largo / largo) * 100 : 0;
  $('[data-barra="asfalto"]').style.setProperty('--pct', pctAsfalto);
  $('[data-barra="tierra"]').style.setProperty('--pct', largo ? 100 - pctAsfalto : 0);
  const enteroAsfalto = Math.round(pctAsfalto);
  const enteroTierra = largo ? 100 - enteroAsfalto : 0;
  $('[data-pct="asfalto"]').innerHTML = `<strong>${enteroAsfalto} %</strong> asfaltado`;
  $('[data-pct="tierra"]').innerHTML = `<strong>${enteroTierra} %</strong> de tierra`;
  $('[data-pct-barra="asfalto"]').textContent = `${enteroAsfalto} %`;
  $('[data-pct-barra="tierra"]').textContent = `${enteroTierra} %`;
}

/**
 * Ajustes que dependen del ancho: en compu (≥ 1024 px) la barra es un filtro con foco de teclado y el
 * buscador tiene un texto de ejemplo más corto; en celular la barra es solo un gráfico.
 */
function ajustarPanelAncho() {
  const compu = esEscritorio.matches;
  for (const barra of document.querySelectorAll('[data-barra]')) barra.tabIndex = compu ? 0 : -1;
  $('.proporcion').setAttribute('aria-hidden', String(!compu));
  $('#busqueda').placeholder = compu ? 'Calle y altura' : 'Calle y altura, ej. Laprida 450';
}

function listaNombres(tramos) {
  const nombres = [...new Set(tramos.map((t) => t.props.nombre).filter(Boolean))];
  if (!nombres.length) return '';
  const visibles = nombres.slice(0, 3).map(esc).join(', ');
  return nombres.length > 3 ? `${visibles} y ${nombres.length - 3} más` : visibles;
}

/** Cuadras visibles de la misma calle (mismo nombre), en cualquier capa. */
const cuadrasDeLaCalle = (nombre) =>
  [...estado.tramos.values()].filter((t) => t.props.nombre === nombre && seVe(t));

function seleccionarCalle(nombre) {
  estado.seleccion = new Set(cuadrasDeLaCalle(nombre).map((t) => t.id));
  dibujarSeleccion();
  renderSeleccion();
}

function renderSeleccion() {
  const caja = $('#seleccion');
  const sel = [...estado.seleccion]
    .map((id) => estado.tramos.get(id))
    .filter(Boolean)
    .sort((a, b) => compararIds(a.id, b.id));

  if (!sel.length) {
    caja.innerHTML = `<p class="vacio">Hacé clic en una calle del mapa para seleccionarla.
      Con <kbd>Shift</kbd>&nbsp;+&nbsp;clic, o activando <em>Varias</em>, podés sumar más de una.</p>`;
    return;
  }

  let html;
  let botonCalle = '';
  if (sel.length === 1) {
    const t = sel[0];
    let nota = '';
    if (t.capa !== t.original) {
      nota = t.original === SIN
        ? '<p class="nota">Pintada: no estaba en ninguna capa.</p>'
        : `<p class="nota">Movida: originalmente era de ${NOMBRE[t.original].toLowerCase()}.</p>`;
    } else if (t.capa === SIN) {
      nota = `<p class="nota">Esta cuadra está en OpenStreetMap pero no en los datos relevados.${EDICION ? ' Pintala como asfalto o tierra.' : ''}</p>`;
    }
    const resto = t.props.nombre ? cuadrasDeLaCalle(t.props.nombre).length : 0;
    if (resto > 1) {
      botonCalle = `<button type="button" class="btn" data-accion="calle" data-nombre="${esc(t.props.nombre)}">Toda la calle (${resto})</button>`;
    }
    html = `<div class="sel-cabecera">
        <strong>${t.props.nombre ? esc(t.props.nombre) : 'Calle sin nombre'}</strong>
        ${chip(t.capa)}
      </div>
      <dl class="props">
        <div><dt>Zona</dt><dd>${esc(t.props.zona ?? '—')}</dd></div>
        <div><dt>Fuente</dt><dd>${nombreFuente(t.props.fuente)}</dd></div>
        <div><dt>Largo</dt><dd>${fmtLargo(t.largo)}</dd></div>
      </dl>
      ${nota}`;
  } else {
    const porCapa = Object.fromEntries(TODAS.map((c) => [c, 0]));
    let largo = 0;
    for (const t of sel) {
      porCapa[t.capa]++;
      largo += t.largo;
    }
    const nombres = listaNombres(sel);
    html = `<div class="sel-cabecera"><div class="sel-titulo"><strong>${sel.length} cuadras seleccionadas</strong>
        ${nombres ? `<small>${nombres}</small>` : ''}</div></div>
      <p class="sel-resumen">${TODAS.filter((c) => porCapa[c]).map((c) => chip(c, porCapa[c])).join('')}
        <span>${fmtLargo(largo)} en total</span></p>`;
  }

  const todosSin = sel.every((t) => t.capa === SIN);
  const botones = !EDICION ? '' : CAPAS.map((destino) => {
    const n = sel.filter((t) => t.capa !== destino).length;
    if (!n) return '';
    const cuenta = sel.length > 1 && n !== sel.length ? ` (${n})` : '';
    return `<button type="button" class="btn btn-primario" data-accion="mover" data-capa="${destino}"
      style="--c: var(--c-${destino})"><span class="punto"></span>${todosSin ? 'Pintar como' : 'Mover a'} ${NOMBRE[destino]}${cuenta}</button>`;
  }).join('');

  caja.innerHTML = `${html}<div class="acciones">${botones}${botonCalle}
    <button type="button" class="btn" data-accion="limpiar">Quitar selección</button></div>`;
}

/** La sección Cambios solo aparece cuando hay algo movido o pintado. */
function renderCambios() {
  const movidos = EDICION ? tramosMovidos() : [];
  $('#seccion-cambios').hidden = !movidos.length;
  if (!movidos.length) return;
  const pintadas = movidos.filter((t) => t.original === SIN).length;
  const detalle = CAPAS
    .map((c) => [c, movidos.filter((t) => t.capa === c).length])
    .filter(([, n]) => n)
    .map(([c, n]) => `${fmtEntero.format(n)} a ${NOMBRE[c].toLowerCase()}`)
    .join(' · ');
  $('#cambios').innerHTML = `<p class="cambios-titulo">${plural(movidos.length, 'cuadra cambió', 'cuadras cambiaron')} de capa</p>
    <p class="vacio">${detalle}${pintadas ? ` (${plural(pintadas, 'estaba', 'estaban')} sin clasificar)` : ''}.
      Guardado en este navegador; descargá los GeoJSON para conservarlo.</p>
    <div class="acciones">
      <button type="button" class="btn" data-accion="ver-cambios">Ver en el mapa</button>
      <button type="button" class="btn" data-accion="deshacer" ${estado.historial.length ? '' : 'disabled'}>Deshacer</button>
      <button type="button" class="btn" data-accion="restablecer">Restablecer</button>
    </div>`;
}

function render() {
  renderCapas();
  renderSeleccion();
  renderCambios();
  calcularCorridas();
  actualizarEtiquetas();
}

let temporizadorToast;
function toast(texto, conDeshacer = false) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(texto)}</span>${conDeshacer ? '<button type="button" data-accion="deshacer">Deshacer</button>' : ''}`;
  el.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => el.classList.remove('visible'), 5000);
}

function mostrarError(mensaje) {
  const el = $('#alerta');
  el.textContent = mensaje;
  el.hidden = false;
}

/** Abre o cierra el bloque expandible del panel (cerrado: encabezado, buscador y chips). */
/**
 * Abre o cierra la búsqueda del panel. Cerrado (como arranca): encabezado, chips y gráfico.
 * Abierto: además el buscador, con el cursor ya en el campo.
 */
function abrirBusqueda(abrir = !$('#panel').classList.contains('abierto'), enfocar = true) {
  $('#panel').classList.toggle('abierto', abrir);
  const boton = $('[data-accion="panel"]');
  boton.setAttribute('aria-expanded', String(abrir));
  boton.setAttribute('aria-label', abrir ? 'Cerrar búsqueda' : 'Abrir búsqueda');
  boton.title = abrir ? 'Cerrar búsqueda' : 'Abrir búsqueda';
  boton.querySelector('.bi').className = `bi ${abrir ? 'bi-chevron-down' : 'bi-chevron-up'}`;
  // En compu el cursor queda en el campo. En celular no: el teclado achicaría la pantalla de golpe;
  // aparece recién cuando se toca el campo.
  if (abrir && enfocar && window.matchMedia('(pointer: fine)').matches) $('#busqueda').focus({ preventScroll: true });
}

const plegarPanel = () => abrirBusqueda();

function conectarUI() {
  document.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton || boton.disabled) return;
    const { accion, capa, fondo } = boton.dataset;
    if (accion === 'mover') mover([...estado.seleccion], capa);
    else if (accion === 'limpiar') limpiarSeleccion();
    else if (accion === 'calle') seleccionarCalle(boton.dataset.nombre);
    else if (accion === 'deshacer') deshacer();
    else if (accion === 'restablecer') restablecer();
    else if (accion === 'ver-cambios') verCambios();
    else if (accion === 'descargar') descargar(capa);
    else if (accion === 'panel') plegarPanel();
    else if (accion === 'limpiar-busqueda') limpiarBusqueda();
    else if (accion === 'compartir-busqueda') compartirBusqueda();
    else if (accion === 'ver-todo') verTodaLaCiudad();
    else if (accion === 'fondo') {
      aplicarFondo(fondo);
      actualizarEtiquetas();
      guardarPrefs();
    }
  });

  for (const capa of CAPAS) { // cada chip prende o apaga su capa (sin clasificar no tiene chip)
    $(`[data-chip="${capa}"]`).addEventListener('click', () => setVisible(capa, !estado.visibles[capa]));
    $(`[data-barra="${capa}"]`).addEventListener('click', () => setVisible(capa, !estado.visibles[capa])); // compu
  }
  $('#multiple').addEventListener('change', (e) => {
    estado.multiple = e.target.checked;
  });
  for (const boton of document.querySelectorAll('[data-verificadas]')) {
    boton.addEventListener('click', () => setSoloVerificadas(!estado.soloVerificadas));
  }
  ajustarPanelAncho();
  esEscritorio.addEventListener('change', ajustarPanelAncho);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      limpiarSeleccion();
      limpiarBusqueda();
    }
    else if (EDICION && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      deshacer();
    }
  });

  map.on('click', () => {
    if (!estado.multiple) limpiarSeleccion();
  });
  map.on('zoomend', restilizarTodo);
  map.on('moveend', actualizarEtiquetas);
  window.addEventListener('cambio-tema', () => {
    aplicarFondo(estado.fondo); // cambia el fondo gris y los colores de las calles
    actualizarEtiquetas();
  });

  // En móvil el panel es una hoja inferior: los controles y el aviso se ubican por encima.
  const panel = $('#panel');
  const medirHoja = () => {
    const alto = Math.max(0, window.innerHeight - panel.getBoundingClientRect().top);
    document.documentElement.style.setProperty('--sheet-h', `${alto}px`);
  };
  new ResizeObserver(medirHoja).observe(panel);
  panel.addEventListener('animationend', medirHoja); // la animación de entrada mueve el panel
  window.addEventListener('resize', () => map.setMinZoom(zoomMinimo()));
  window.addEventListener('resize', medirHoja);
}

/* ---------- Inicio ---------- */
async function iniciar() {
  const prefs = leerJSON(CLAVE_PREFS, {}) ?? {};
  if (FONDOS[prefs.fondo]) estado.fondo = prefs.fondo;
  for (const capa of CAPAS) {
    if (typeof prefs.visibles?.[capa] === 'boolean') estado.visibles[capa] = prefs.visibles[capa];
  }
  // Sin clasificar no tiene tarjeta ni interruptor: se ve solo en modo edición, donde sirve para pintar.
  estado.visibles[SIN] = EDICION;
  if (EDICION) document.body.classList.add('modo-edicion');
  $('#seccion-seleccion').hidden = !EDICION;

  aplicarFondo(estado.fondo);
  conectarUI();
  renderSeleccion();

  try {
    await cargarDatos();
  } catch (error) {
    console.error(error);
    mostrarError('No se pudieron cargar las capas. Revisá que existan public/data/asfalto.geojson y public/data/tierra.geojson.');
    return;
  }

  aplicarCambiosGuardados();
  for (const capa of TODAS) {
    if (estado.visibles[capa]) grupos[capa].addTo(map);
  }
  if (prefs.soloVerificadas === true) setSoloVerificadas(true, false);
  limitarArea();
  prepararBuscador();
  $('#actualizacion').textContent = `Relevamiento realizado hasta el ${ACTUALIZACION_DATOS}`;
  $('[data-fecha-corta]').textContent = `Relevamiento hasta el ${ACTUALIZACION_CORTA}`;
  const consulta = new URLSearchParams(window.location.search).get('q');
  if (consulta) {
    abrirBusqueda(true, false); // un enlace con búsqueda abre el panel para mostrar el resultado
    $('#busqueda').value = consulta;
    await buscar(consulta);
  } else {
    verTodaLaCiudad(false); // la primera vista aparece directo, sin vuelo
  }
  render();
}

iniciar();
