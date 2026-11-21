// Prueba de punta a punta: levanta public/ en un puerto libre, abre Chrome/Edge headless
// por DevTools Protocol y recorre los flujos principales con clics reales sobre el mapa.
//
// Uso:  npm test
// Requiere Node 22+ (WebSocket global) y Chrome o Edge instalados.
// Si el navegador no está en la ruta habitual: CHROME_PATH="/ruta/al/navegador" npm test
// Las capturas quedan en tests/output/ (ignorado por git).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { servir } from "../scripts/serve.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "output");
const CANDIDATOS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const NAVEGADOR = CANDIDATOS.find((p) => existsSync(p));
if (!NAVEGADOR) {
  console.error("No se encontró Chrome/Edge. Definí CHROME_PATH con la ruta al ejecutable.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT_CDP = 9300 + Math.floor(Math.random() * 500);
const perfil = join(tmpdir(), `victoriamap-e2e-${process.pid}`);
mkdirSync(OUT, { recursive: true });

const server = await servir(0);
const URL_APP = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn(NAVEGADOR, [
  "--headless=new", `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${perfil}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

let fallas = 0;
let ws;
try {
  // ---------- Conexión CDP ----------
  let target;
  for (let i = 0; i < 75 && !target; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json();
      target = lista.find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("El navegador no abrió el puerto de depuración");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let seq = 0;
  const pendientes = new Map();
  const consola = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendientes.has(msg.id)) {
      pendientes.get(msg.id)(msg);
      pendientes.delete(msg.id);
    }
    if (msg.method === "Runtime.exceptionThrown") consola.push("EXCEPCIÓN " + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
    if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) consola.push(msg.params.type + " " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") consola.push("LOG " + msg.params.entry.text + " " + (msg.params.entry.url ?? ""));
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pendientes.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  // Evalúa en la página. Las constantes de nivel superior de app.js (estado, map, grupos…) son accesibles.
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`eval: ${expr} -> ${JSON.stringify(r.exceptionDetails)}`);
    return r.result.value;
  };
  const captura = async (nombre) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, nombre), Buffer.from(data, "base64"));
  };
  const clic = async (x, y, modifiers = 0) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, modifiers });
    await sleep(150);
  };
  const esperar = async (expr, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await ev(expr)) return;
      await sleep(150);
    }
    throw new Error(`timeout esperando: ${expr}`);
  };
  const cargado = `typeof estado !== 'undefined' && estado.tramos.size > 0 && document.querySelector('#total').textContent.includes('calles')`;
  // Cuadras por capa según el estado de la app (el panel muestra calles; ver "conteo de calles").
  const cuadras = (capa) => `[...estado.tramos.values()].filter((t) => t.capa === '${capa}').length`;
  const conteos = () => ev(`({ a: ${cuadras("asfalto")}, t: ${cuadras("tierra")} })`);
  const ok = (nombre, cond, extra = "") => {
    if (!cond) fallas++;
    console.log(`${cond ? "OK   " : "FALLA"}  ${nombre}${extra ? `  ${extra}` : ""}`);
  };
  // Busca un tramo de la capa dada cuyo punto medio esté visible y fuera del panel.
  const elegir = (capa, excluir = [], minLargo = 80) => ev(`(() => {
    const panel = document.querySelector('#panel').getBoundingClientRect();
    const excluir = new Set(${JSON.stringify(excluir)});
    for (const t of estado.tramos.values()) {
      if (t.capa !== '${capa}' || t.largo < ${minLargo} || excluir.has(t.id)) continue;
      const ll = t.layer.getLatLngs(); const a = ll[0], b = ll[ll.length - 1];
      if (!a.lat) continue;
      const p = map.latLngToContainerPoint([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]);
      if (p.x > panel.right + 40 && p.x < innerWidth - 80 && p.y > 80 && p.y < innerHeight - 80) {
        return { id: t.id, x: Math.round(p.x), y: Math.round(p.y) };
      }
    }
  })()`);

  // Los conteos esperados salen de los propios GeoJSON publicados.
  const geojson = async (capa) => (await (await fetch(`${URL_APP}data/${capa}.geojson`)).json()).features;
  const leer = async (capa) => (await geojson(capa)).length;
  const base = { a: await leer("asfalto"), t: await leer("tierra") };
  const fmt = (n) => new Intl.NumberFormat("es-AR").format(n);
  const callesDe = async (capa) => new Set((await geojson(capa)).map((f) => f.properties.nombre).filter(Boolean)).size;
  const espera = (da, dt) => ({ a: base.a + da, t: base.t + dt });
  const igual = (x, y) => x.a === y.a && x.t === y.t;

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${URL_APP}?editar` }); // modo edición: mover, pintar, deshacer
  await esperar(cargado);
  await sleep(2000);

  // ---------- Conteos ----------
  ok("modo edición: la sección Selección está visible", !(await ev(`document.querySelector('#seccion-seleccion').hidden`)));
  let c = await conteos();
  ok("conteo inicial igual a los GeoJSON", igual(c, espera(0, 0)), JSON.stringify(c));
  const panelCalles = await ev(`({ a: document.querySelector('[data-conteo=asfalto]').textContent, t: document.querySelector('[data-conteo=tierra]').textContent })`);
  ok("el panel cuenta calles (nombres distintos)", panelCalles.a === fmt(await callesDe("asfalto")) && panelCalles.t === fmt(await callesDe("tierra")), JSON.stringify(panelCalles));
  ok("la sección Cambios está oculta sin cambios", await ev(`document.querySelector('#seccion-cambios').hidden`));
  ok("créditos plegados en una 'i' y sin 'Leaflet'", (await ev(`(() => { const c = document.querySelector('.leaflet-control-attribution'); return c.classList.contains('plegada') && !c.textContent.includes('Leaflet') && c.textContent.includes('OpenStreetMap'); })()`)));
  ok("zoom máximo 18 (escala 50 m)", (await ev(`map.getMaxZoom()`)) === 18);
  ok("zoom mínimo 15 (escala 300 m) y la vista arranca ahí", (await ev(`map.getMinZoom()`)) === 15 && (await ev(`map.getZoom()`)) === 15, `zoom ${await ev(`map.getZoom()`)}`);
  ok("a zoom 15 ya se ven nombres de calles", (await ev(`document.querySelectorAll('.leaflet-etiquetas-pane .etiqueta').length`)) > 0,
    `${await ev(`document.querySelectorAll('.leaflet-etiquetas-pane .etiqueta').length`)} etiquetas`);
  // Límite: intentar llevar el mapa ~20 km lejos; tiene que quedar dentro del área de los datos + 5 km.
  await ev(`void map.panTo([-32.45, -60.0], { animate: false })`);
  await sleep(300);
  const limite = await ev(`(() => { const c = map.getCenter(); return map.options.maxBounds.contains(c) && map.getBounds().intersects(map.options.maxBounds); })()`);
  ok("no se puede salir del área (datos + 5 km)", limite === true, JSON.stringify(await ev(`map.getCenter()`)));
  await ev(`void encuadrar(estado.tramos.values(), { animate: false })`);
  await sleep(300);
  await captura("01-escritorio.png");

  // ---------- Selección y mover ----------
  await ev(`void map.setZoom(16, { animate: false })`);
  await sleep(500);
  let p = await elegir("asfalto");
  await clic(p.x, p.y);
  let sel = await ev(`[...estado.seleccion]`);
  ok("clic en una calle la selecciona", sel.length === 1, `clic en #${p.id}, seleccionado ${sel}`);
  const id = sel[0];
  const nombreSel = await ev(`estado.tramos.get('${id}').props.nombre ?? 'Calle sin nombre'`);
  ok("el panel muestra la calle", (await ev(`document.querySelector('#seleccion').textContent`)).includes(nombreSel), nombreSel);
  await captura("02-seleccion.png");

  await ev(`document.querySelector('[data-accion=mover][data-capa=tierra]').click()`);
  await sleep(200);
  c = await conteos();
  ok("mover a tierra actualiza los conteos", igual(c, espera(-1, +1)), JSON.stringify(c));
  ok("aparece la sección Cambios", !(await ev(`document.querySelector('#seccion-cambios').hidden`)));
  ok("el tramo cambia de grupo", await ev(`grupos.tierra.hasLayer(estado.tramos.get('${id}').layer) && !grupos.asfalto.hasLayer(estado.tramos.get('${id}').layer)`));
  ok("el cambio se guarda en localStorage", (await ev(`localStorage.getItem('victoriamap:cambios:v1')`)).includes(`"${id}":"tierra"`));
  await captura("03-movido.png");

  // ---------- Persistencia ----------
  await send("Page.reload");
  await esperar(cargado);
  c = await conteos();
  ok("el cambio sigue después de recargar", igual(c, espera(-1, +1)), JSON.stringify(c));

  // ---------- Selección múltiple ----------
  await ev(`void map.setZoom(16, { animate: false })`);
  await sleep(500);
  const p1 = await elegir("asfalto");
  await clic(p1.x, p1.y);
  const p2 = await elegir("tierra", [p1.id]);
  if (p2) {
    await clic(p2.x, p2.y, 8 /* Shift */);
    sel = await ev(`[...estado.seleccion]`);
    ok("Shift+clic suma a la selección", sel.length === 2, JSON.stringify(sel));
    await captura("04-multiple.png");
  } else {
    ok("Shift+clic: hay un tramo de tierra visible para probar", false);
  }

  await ev(`void encuadrar(estado.tramos.values(), { animate: false })`);
  await sleep(400);
  // Un punto de la pantalla (fuera del panel) a más de 40 px de cualquier calle.
  const vacio = await ev(`(() => {
    const panel = document.querySelector('#panel').getBoundingClientRect();
    const segs = [];
    for (const t of estado.tramos.values()) {
      if (!estado.visibles[t.capa]) continue;
      const ll = t.layer.getLatLngs(); const pts = L.LineUtil.isFlat(ll) ? ll : ll.flat();
      for (let i = 1; i < pts.length; i++) segs.push([map.latLngToContainerPoint(pts[i - 1]), map.latLngToContainerPoint(pts[i])]);
    }
    for (let y = 80; y < innerHeight - 80; y += 20) for (let x = Math.ceil(panel.right) + 40; x < innerWidth - 80; x += 20) {
      const p = L.point(x, y);
      if (segs.every(([a, b]) => L.LineUtil.pointToSegmentDistance(p, a, b) > 40)) return { x, y };
    }
  })()`);
  await clic(vacio.x, vacio.y);
  ok("clic en zona vacía limpia la selección", (await ev(`estado.seleccion.size`)) === 0);

  // ---------- Mostrar / ocultar ----------
  const tarjeta = await ev(`(() => { const r = document.querySelector('.capa[data-capa=tierra]').getBoundingClientRect(); return { x: r.left + 30, y: r.top + 20 }; })()`);
  await clic(tarjeta.x, tarjeta.y);
  ok("ocultar la capa de tierra", !(await ev(`map.hasLayer(grupos.tierra)`)));
  await clic(tarjeta.x, tarjeta.y);
  ok("mostrar la capa de tierra", await ev(`map.hasLayer(grupos.tierra)`));

  // ---------- Restablecer / deshacer ----------
  await ev(`void (window.confirm = () => true)`);
  await ev(`document.querySelector('[data-accion=restablecer]').click()`);
  c = await conteos();
  ok("restablecer vuelve a los datos publicados", igual(c, espera(0, 0)), JSON.stringify(c));

  // ---------- Sin clasificar: pintar una cuadra que falta ----------
  const baseSin = await leer("sin-clasificar");
  const conteoSin = () => ev(cuadras("sinclasificar"));
  ok("cuadras sin clasificar iguales al GeoJSON", (await conteoSin()) === baseSin, `${await conteoSin()} / ${baseSin}`);
  await ev(`(() => { const t = [...estado.tramos.values()].find((t) => t.capa === 'sinclasificar'); map.setView(t.layer.getCenter(), 17, { animate: false }); })()`);
  await sleep(600);
  ok("las calles se pintan más anchas al acercarse", (await ev(`anchoCalle()`)) > 8, `ancho a zoom 17: ${(await ev(`anchoCalle()`)).toFixed(1)} px`);
  ok("se escriben los nombres de las calles", (await ev(`document.querySelectorAll('.leaflet-etiquetas-pane .etiqueta').length`)) > 0,
    `${await ev(`document.querySelectorAll('.leaflet-etiquetas-pane .etiqueta').length`)} etiquetas`);
  await captura("05-nombres.png");
  await ev(`document.querySelector('#nombres').click()`);
  ok("ocultar nombres", (await ev(`document.querySelectorAll('.leaflet-etiquetas-pane .etiqueta').length`)) === 0);
  await ev(`document.querySelector('#nombres').click()`);

  const ps = await elegir("sinclasificar", [], 30);
  await clic(ps.x, ps.y);
  sel = await ev(`[...estado.seleccion]`);
  ok("clic en una calle sin clasificar la selecciona", sel.length === 1 && sel[0] === ps.id, JSON.stringify(sel));
  const textoBotones = await ev(`[...document.querySelectorAll('#seleccion [data-accion=mover]')].map((b) => b.textContent.trim()).join(' | ')`);
  ok("ofrece pintarla como asfalto o tierra", textoBotones.includes("Pintar como Asfalto") && textoBotones.includes("Pintar como Tierra"), textoBotones);
  await ev(`document.querySelector('[data-accion=mover][data-capa=asfalto]').click()`);
  await sleep(200);
  c = await conteos();
  ok("pintarla suma un tramo de asfalto", igual(c, espera(+1, 0)) && (await conteoSin()) === baseSin - 1, `${JSON.stringify(c)} sin: ${await conteoSin()}`);
  ok("se exporta con el asfalto", await ev(`[...estado.tramos.values()].some((t) => t.capa === 'asfalto' && t.id === '${ps.id}')`));
  await captura("06-pintada.png");
  await ev(`document.querySelector('[data-accion=deshacer]').click()`);
  c = await conteos();
  ok("deshacer la devuelve a sin clasificar", igual(c, espera(0, 0)) && (await conteoSin()) === baseSin, JSON.stringify(c));

  // "Toda la calle": desde una cuadra de Suipacha (pintada como asfalto) selecciona todas sus cuadras visibles.
  await ev(`limpiarSeleccion()`);
  await ev(`tocarTramo([...estado.tramos.values()].find((t) => t.props.nombre === 'Suipacha').id, false)`);
  const totalSuipacha = await ev(`cuadrasDeLaCalle('Suipacha').length`);
  await ev(`document.querySelector('[data-accion=calle]')?.click()`);
  ok("'Toda la calle' selecciona todas sus cuadras", (await ev(`estado.seleccion.size`)) === totalSuipacha && totalSuipacha > 1, `${totalSuipacha} cuadras`);
  await captura("06b-toda-la-calle.png");
  await ev(`limpiarSeleccion()`);

  await ev(`void map.setZoom(16, { animate: false })`);
  await sleep(500);
  p = await elegir("asfalto");
  await clic(p.x, p.y);
  await ev(`document.querySelector('[data-accion=mover]').click()`);
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await sleep(200);
  c = await conteos();
  ok("Ctrl+Z deshace el último movimiento", igual(c, espera(0, 0)), JSON.stringify(c));

  // ---------- Buscador ----------
  const resultado = () => ev(`document.querySelector('#resultado').innerText.split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean).join(' ')`);
  await ev(`document.querySelector('#busqueda').value = 'laprida 450'`);
  await ev(`document.querySelector('#buscador').requestSubmit()`);
  await esperar(`!document.querySelector('#resultado').hidden`, 8000);
  let r = await resultado();
  ok("buscar calle y altura ubica la dirección", r.includes("Laprida 450") && (r.includes("asfalto") || r.includes("tierra")) && (await ev(`document.querySelectorAll('.pin-punto').length`)) === 1, r);
  ok("la dirección queda en pantalla y de cerca", (await ev(`map.getZoom()`)) >= 17 && (await ev(`map.getBounds().contains(resaltado.getLayers().find((l) => l.getLatLng)?.getLatLng())`)));
  await captura("06c-busqueda.png");
  await ev(`document.querySelector('#busqueda').value = 'suipacha'`);
  await ev(`document.querySelector('#buscador').requestSubmit()`);
  await sleep(300);
  r = await resultado();
  ok("buscar solo la calle la resalta entera", r.includes("Suipacha") && (await ev(`resaltado.getLayers().length`)) === (await ev(`[...estado.tramos.values()].filter((t) => t.props.nombre === 'Suipacha').length`)), r);
  await ev(`document.querySelector('#busqueda').value = 'calle que no existe 123'`);
  await ev(`document.querySelector('#buscador').requestSubmit()`);
  await sleep(300);
  ok("una calle inexistente avisa", (await resultado()).includes("No encontramos"));
  await ev(`document.querySelector('#busqueda').value = ''`);
  await ev(`limpiarBusqueda()`);

  // ---------- Fondo a color ----------
  await ev(`document.querySelector('[data-fondo=color]').click()`);
  ok("fondo a color", (await ev(`capaFondo._url`)).includes("World_Street_Map"));
  await sleep(1500);
  await captura("06d-color.png");
  await ev(`document.querySelector('[data-accion=ver-todo]').click()`);
  await sleep(800);
  ok("volver a toda la ciudad conserva la vista general", (await ev(`map.getZoom()`)) === 15);
  await ev(`(() => {
    document.querySelector('[data-accion=limpiar-busqueda]').click();
    document.querySelector('#busqueda').value = 'Laprida 450';
    document.querySelector('#buscador').requestSubmit();
  })()`);
  await esperar(`!document.querySelector('#resultado').hidden`, 8000);
  ok("compartir y limpiar están disponibles en el resultado", await ev(`(() => {
    const r = document.querySelector('#resultado');
    return r.textContent.includes('Compartir') && Boolean(document.querySelector('[data-accion=limpiar-busqueda]'));
  })()`));
  ok("la búsqueda queda representada en la URL", (await ev(`new URL(location.href).searchParams.get('q')`)) === "Laprida 450");

  // ---------- Fondo satelital ----------
  await ev(`document.querySelector('[data-fondo=satelite]').click()`);
  await ev(`void encuadrar(estado.tramos.values(), { animate: false })`);
  await sleep(2500);
  await captura("07-satelite.png");
  await ev(`document.querySelector('[data-fondo=mapa]').click()`);

  // ---------- Expositor (sin ?editar): se selecciona pero no se mueve ----------
  await send("Page.navigate", { url: URL_APP });
  await esperar(cargado);
  await ev(`void map.setZoom(16, { animate: false })`);
  await sleep(500);
  const pe = await elegir("asfalto");
  await clic(pe.x, pe.y);
  ok("expositor: sin sección Selección", await ev(`document.querySelector('#seccion-seleccion').hidden`));
  ok("expositor: hacer clic en una calle no selecciona nada", (await ev(`estado.seleccion.size`)) === 0);
  ok("expositor: sin botones de mover ni pintar", (await ev(`document.querySelectorAll('[data-accion=mover]').length`)) === 0);
  ok("expositor: sin marca de modo edición", !(await ev(`document.body.classList.contains('modo-edicion')`)));
  await captura("07b-expositor.png");

  // ---------- Móvil ----------
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.reload");
  await esperar(cargado);
  await sleep(2000);
  await captura("08-movil.png");
  ok("sin scroll horizontal en móvil", await ev(`document.documentElement.scrollWidth <= innerWidth`));
  ok("el panel ocupa como máximo la mitad del alto móvil", await ev(`document.querySelector('#panel').getBoundingClientRect().height <= innerHeight * 0.51`));
  ok("el pie muestra el trabajo colaborativo y ambos alumnos", await ev(`(() => {
    const texto = document.querySelector('.credito-colaborativo')?.textContent ?? '';
    return texto.includes('Trabajo colaborativo') && texto.includes('Gabriel Benitez') && texto.includes('Alexis Artaza')
      && document.querySelectorAll('.credito-logos img').length === 2;
  })()`));
  ok("los créditos quedan siempre visibles fuera del scroll", await ev(`(() => {
    const credito = document.querySelector('.credito-colaborativo').getBoundingClientRect();
    return !document.querySelector('.panel-cuerpo').contains(document.querySelector('.credito-colaborativo'))
      && credito.top >= 0 && credito.bottom <= innerHeight;
  })()`));

  ok("consola sin errores", consola.length === 0, consola.join(" | "));
} catch (error) {
  fallas++;
  console.error("FALLA ", error.message);
} finally {
  ws?.close();
  chrome.kill();
  server.close();
  await sleep(300);
  try { rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : `\nTodo OK. Capturas en tests/output/`);
process.exit(fallas ? 1 : 0);
