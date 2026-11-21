'use strict';

/* Landing: calcula las cifras con los mismos GeoJSON que usa el mapa y dibuja las calles reales de fondo.
   Los archivos quedan en la caché del navegador, así que "Ver el mapa" abre más rápido. */

const ARCHIVOS = { asfalto: 'data/asfalto.geojson', tierra: 'data/tierra.geojson' };
const fmtEntero = new Intl.NumberFormat('es-AR');
const fmtDecimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Igual que en app.js: lleva longitudes "con vueltas" (exportaciones de uMap) a [-180, 180).
const normalizarLon = (lon) => (lon >= -180 && lon < 180 ? lon : ((((lon + 180) % 360) + 360) % 360) - 180);
const lineasDe = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [])
  .map((l) => l.map(([lon, lat]) => [normalizarLon(lon), lat]));

function distancia([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

const movimientoReducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Cuenta de 0 al valor en ~1,2 s (con frenado al final). Sin animación si el dispositivo pide menos movimiento. */
function contar(elemento, valor, formato, duracion = 1200) {
  if (movimientoReducido()) {
    elemento.textContent = formato(valor);
    return Promise.resolve();
  }
  return new Promise((listo) => {
    const inicio = performance.now();
    const paso = (ahora) => {
      const k = Math.min(1, (ahora - inicio) / duracion);
      elemento.textContent = formato(valor * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(paso);
      else {
        elemento.textContent = formato(valor);
        listo();
      }
    };
    requestAnimationFrame(paso);
  });
}

async function mostrarCifras(capas) {
  const calles = new Set();
  const largo = { asfalto: 0, tierra: 0 };
  for (const [capa, features] of Object.entries(capas)) {
    for (const f of features) {
      if (f.properties?.nombre) calles.add(f.properties.nombre);
      for (const l of lineasDe(f.geometry)) for (let i = 1; i < l.length; i++) largo[capa] += distancia(l[i - 1], l[i]);
    }
  }
  const total = largo.asfalto + largo.tierra;
  const porcentaje = (v) => `${fmtDecimal.format(v)} %`;
  await Promise.all([
    contar(document.getElementById('cifra-calles'), calles.size, (v) => fmtEntero.format(Math.round(v))),
    // La superficie (12–15 km², ciudad de Victoria con los alrededores sobre las rutas) es una estimación fija
    // del dueño, escrita en index.html: los datos no la dan (las cuadras relevadas cubren unos 6,9 km²).
    contar(document.getElementById('cifra-asfalto'), (largo.asfalto / total) * 100, porcentaje),
    contar(document.getElementById('cifra-tierra'), (largo.tierra / total) * 100, porcentaje),
  ]);
}

/**
 * Dibuja todas las cuadras en el canvas de fondo, centradas y ajustadas al tamaño del hero.
 * Con `animar`, las calles aparecen de a poco desde el centro hacia afuera (~1,6 s).
 */
let animacionDibujo = 0;

function dibujar(capas, animar = false) {
  cancelAnimationFrame(animacionDibujo); // si se redibuja (cambio de tamaño o de tema), corta la animación anterior
  const canvas = document.getElementById('trazado');
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Proyección simple (suficiente para una ciudad): x = lon·cos(lat), y = -lat.
  const todas = Object.values(capas).flat().flatMap((f) => lineasDe(f.geometry));
  const k = Math.cos((todas[0][0][1] * Math.PI) / 180);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of todas) for (const [lon, lat] of l) {
    minX = Math.min(minX, lon * k); maxX = Math.max(maxX, lon * k);
    minY = Math.min(minY, -lat); maxY = Math.max(maxY, -lat);
  }
  const angosto = width <= 860;
  const margen = angosto ? 0.04 : 0.08;
  const escala = Math.min((width * (1 - 2 * margen)) / (maxX - minX), (height * (1 - 2 * margen)) / (maxY - minY))
    * (angosto ? 1.35 : 1); // en celular se agranda y se recorta: es solo un fondo
  const ox = (width - (maxX - minX) * escala) / 2;
  const oy = (height - (maxY - minY) * escala) / 2;

  const estilos = getComputedStyle(document.documentElement);
  const color = { asfalto: estilos.getPropertyValue('--c-asfalto').trim(), tierra: estilos.getPropertyValue('--c-tierra').trim() };
  const trazos = [];
  for (const capa of ['tierra', 'asfalto']) {
    for (const f of capas[capa]) {
      for (const l of lineasDe(f.geometry)) {
        const pts = l.map(([lon, lat]) => [ox + (lon * k - minX) * escala, oy + (-lat - minY) * escala]);
        const [mx, my] = pts[Math.floor(pts.length / 2)];
        trazos.push({ capa, pts, d: Math.hypot(mx - width / 2, my - height / 2) });
      }
    }
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = angosto ? 2 : 2.4;
  const pintar = (desde, hasta) => {
    for (let i = desde; i < hasta; i++) {
      const { capa, pts } = trazos[i];
      ctx.strokeStyle = color[capa];
      ctx.beginPath();
      pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  };

  canvas.classList.add('listo');
  if (!animar || movimientoReducido()) {
    pintar(0, trazos.length);
    return;
  }
  trazos.sort((a, b) => a.d - b.d);
  const inicio = performance.now();
  let hechos = 0;
  const paso = (ahora) => {
    // El reloj del primer cuadro puede ser un poco anterior a `inicio`: se limita a [0, 1].
    const t = Math.min(1, Math.max(0, (ahora - inicio) / 1600));
    const meta = Math.max(hechos, Math.min(trazos.length, Math.round(trazos.length * (1 - (1 - t) ** 2))));
    pintar(hechos, meta);
    hechos = meta;
    if (t < 1) animacionDibujo = requestAnimationFrame(paso);
  };
  animacionDibujo = requestAnimationFrame(paso);
}

async function iniciar() {
  try {
    const [asfalto, tierra] = await Promise.all(Object.values(ARCHIVOS).map(async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return (await r.json()).features ?? [];
    }));
    const capas = { asfalto, tierra };
    mostrarCifras(capas);
    dibujar(capas, true);
    let espera;
    window.addEventListener('resize', () => {
      clearTimeout(espera);
      espera = setTimeout(() => dibujar(capas), 150);
    });
    window.addEventListener('cambio-tema', () => dibujar(capas)); // los colores salen de las variables CSS
  } catch (error) {
    console.error(error); // las cifras quedan con "—"; el botón al mapa sigue funcionando
  }
}

iniciar();
