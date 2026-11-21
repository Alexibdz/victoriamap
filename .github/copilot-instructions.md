<!--
  NOTA PARA AGENTES DE IA (Copilot, Claude, Codex, Cursor, etc.):
  - Antes de tocar el proyecto, leé .github/copilot-instructions.md (reglas, arquitectura, qué no romper)
    y la bitácora en docs/ (por qué se tomó cada decisión).
  - No cambies las restricciones (sitio estático, sin base de datos, sin frameworks) sin que lo pida el dueño.
  - No publiques (vercel --prod) ni hagas push por tu cuenta: el dueño revisa en localhost (npm run dev).
  - Corré `npm test` antes de dar un cambio por terminado.
  - OBLIGATORIO: documentá cada cambio y cada decisión en los .md (bitácora en docs/ e instrucciones),
    para que el dueño, cuando retome el proyecto, pueda ver qué se hizo y por qué.
-->

# Instrucciones del proyecto: Calles de Victoria

Mapa web que muestra las calles de **asfalto** y de **tierra** de Victoria (Entre Ríos, Argentina)
sobre Leaflet. Funciona como expositor: sitio estático publicado en Vercel, **sin base de datos**.

- Producción: https://victoriamap.vercel.app
- Historia y decisiones del proyecto: [docs/sesion-2026-11-16.md](../docs/sesion-2026-11-16.md) y
  [docs/sesion-2026-11-20.md](../docs/sesion-2026-11-20.md)

## Si sos un agente de IA (leé esto primero)

1. Leé este archivo entero y la bitácora en `docs/` antes de cambiar nada: ahí está por qué el proyecto es así.
2. Respetá "Qué tiene que seguir funcionando" y "Restricciones". Si un pedido las contradice, avisá y preguntá.
3. Al terminar: `npm test` pasa, se probó a ancho de celular y queda corriendo en `npm run dev` para que lo revise
   el dueño. **No publiques ni hagas push** salvo que el dueño lo pida explícitamente para ese cambio.
4. **Documentá en los `.md` todo lo que hagas** (esto es obligatorio, no opcional):
   - En `docs/`, agregá una sección a la bitácora del día o creá `docs/sesion-AAAA-MM-DD.md`, con el pedido
     (citado), qué se hizo, qué se decidió y **por qué**, problemas encontrados y cómo verificaste.
   - Si cambia el comportamiento, la arquitectura o una regla, actualizá este archivo y el `README.md`.
   - Así el dueño (y cualquier otro agente) puede retomar el proyecto y entender las decisiones tomadas.
5. Pasale esta misma regla a cualquier otro agente o persona con la que trabajes en el proyecto.

## Qué tiene que seguir funcionando

1. Mostrar u ocultar la capa de asfalto (`public/data/asfalto.geojson`).
2. Mostrar u ocultar la capa de tierra (`public/data/tierra.geojson`).
3. Mostrar el conteo de **calles** de cada capa (nombres distintos; una calle con cuadras de los dos tipos
   cuenta en las dos), además de km, cuadras y desglose verificada/satelital. La barra de proporción va por km.
4. **Expositor (por defecto)**: no hay selección. Las calles no son clicables y no existe la sección Selección.
   Se consulta con el **buscador** (punto 7). **Modo edición**: la URL con `?editar`
   (p. ej. `http://127.0.0.1:5173/?editar`) muestra la sección Selección, mover/pintar, deshacer, Cambios y
   descargas. Sin `?editar` se ignoran los cambios guardados en el navegador: siempre se ven los datos publicados.
5. Capa **Sin clasificar** (`public/data/sin-clasificar.geojson`): cuadras de OpenStreetMap que no están en
   ningún archivo (p. ej. Suipacha). Se seleccionan y se **pintan** como asfalto o tierra; desde ese momento
   son tramos normales de esa capa, no un dibujo aparte.
6. **Nombres de calles** escritos sobre la calle pintada (desde zoom 15), con un interruptor para ocultarlos.
7. **Buscador** de calle y altura ("Laprida 450"): ubica la dirección con un pin, resalta la cuadra y dice si es de
   asfalto o de tierra. Con solo el nombre resalta la calle entera. La búsqueda se puede limpiar, compartir mediante
   URL y cargar con `?q=...`; el control **Ver toda la ciudad** vuelve al encuadre general. La numeración
   **no se dibuja en el mapa** (pedido explícito): solo la usa el buscador.
8. Fondo **Gris | Color | Satélite**, debajo del interruptor de nombres.
9. **Zoom entre 15 y 18** (escala de 300 m a 50 m) y el mapa **no se puede llevar a más de 5 km** del área de los datos.

Extras ya implementados: selección múltiple (Shift/Ctrl+clic o el interruptor **Varias**), botón **Toda la calle**
(selecciona todas las cuadras con el mismo nombre), deshacer (Ctrl+Z y botón en el aviso), restablecer,
"Ver en el mapa" de los cambios, descarga de los GeoJSON, persistencia en `localStorage`, fondo Mapa/Satélite,
ancho de calle según el zoom y diseño para móvil. La sección **Cambios** (deshacer, restablecer, descargas)
solo aparece cuando hay algo movido o pintado.

En la interfaz se habla de **calles** y **cuadras**, nunca de "tramos" ni de ids (el usuario los pidió fuera).

## Restricciones (no cambiarlas sin acordarlo con el equipo)

- **Sitio estático**: HTML + CSS + JavaScript sin framework, sin bundler y sin dependencias de npm.
  No agregar React, Vite, TypeScript, Tailwind, etc.
- **Sin backend ni base de datos**: no agregar funciones serverless, APIs ni almacenamiento externo.
  Los cambios viven en el navegador (`localStorage`) y se "oficializan" descargando los GeoJSON y
  reemplazando los de `public/data/`.
- **Nada se publica sin revisión en localhost.** No correr `vercel --prod` ni hacer push a la rama de
  producción por cuenta propia: se entrega el cambio funcionando en `npm run dev` y el dueño lo audita y publica.
- **Leaflet 1.9.4** desde unpkg con hash SRI (`integrity`) en `public/index.html`. Si cambia la versión,
  recalcular el hash: `curl -s URL | openssl dgst -sha256 -binary | openssl base64 -A`.
- **Vercel** publica solo `public/` (`vercel.json` → `outputDirectory`). No hay paso de build.
- Node ≥ 22 solo se usa para los scripts locales (`scripts/`, `tests/`).
- La app no consulta OpenStreetMap en vivo: los nombres y las calles faltantes se calculan con los scripts
  y quedan en los GeoJSON.

## Archivos

| Ruta | Qué es |
|---|---|
| `public/index.html` | Estructura del panel y carga de Leaflet |
| `public/app.js` | Toda la lógica: carga, mapa, selección, mover/pintar, deshacer, nombres, persistencia, panel |
| `public/styles.css` | Estilos; variables de color en `:root`, modo oscuro y móvil (≤ 720 px) |
| `public/data/asfalto.geojson`, `tierra.geojson` | Las dos capas publicadas (lo que ve la gente) |
| `public/data/sin-clasificar.geojson` | Cuadras de OSM sin capa, para pintar (generado) |
| `dataset/ASFALTO-*/`, `dataset/TIERRA-*/` | GeoJSON originales exportados de uMap: `CAPA-FUENTE/zona_x.geojson` |
| `dataset/osm-calles.geojson` | Extracto de calles de OpenStreetMap del área (nombre, tipo, nodos). © OSM, ODbL |
| `public/data/alturas.json` | Números de casa de OSM `[lon, lat, número, calle]`; lo usa el buscador (se baja en la primera búsqueda con número) |
| `scripts/build-data.mjs` | Une `dataset/` en asfalto/tierra (asigna `id`, `zona`, `fuente`; corrige longitudes) |
| `scripts/osm-calles.mjs` | Descarga `dataset/osm-calles.geojson` desde Overpass (necesita red) |
| `scripts/osm-alturas.mjs` | Descarga `public/data/alturas.json` (`--desde archivo.json` si Overpass está caído) |
| `scripts/overpass.mjs` | Consulta a Overpass con reintentos y espejos, compartida por los dos scripts de OSM |
| `scripts/sin-clasificar.mjs` | Genera `sin-clasificar.geojson`: cuadras de OSM que ningún tramo cubre |
| `scripts/nombres.mjs` | Agrega `nombre` a los tramos de los 3 archivos (en el lugar, no pisa cambios) |
| `scripts/geo.mjs` | Geometría compartida por los scripts |
| `scripts/serve.mjs` | Servidor estático local sin dependencias |
| `tests/e2e.mjs` | Prueba de punta a punta con Chrome/Edge headless (DevTools Protocol) |
| `vercel.json` | Configuración de Vercel |

## Modelo de datos

- Cada archivo es un `FeatureCollection` de `LineString` (y alguna `MultiLineString`). Cada feature es un
  **tramo**, casi siempre una cuadra (mediana ≈ 95 m).
- La **capa es el archivo** donde está el feature: no existe una propiedad `capa`.
- Propiedades de cada tramo:
  - `id`: **único entre los tres archivos**. Es la clave de todo (selección, `localStorage`, exportación).
    Los del dataset son números (1…1409); los de sin clasificar son textos estables `osm-<way>-<n>`
    (calle de OSM y número de cuadra) u `osm-<way>-<n>-<r>` si de esa cuadra falta solo una parte.
  - `nombre`: nombre de la calle según OSM (lo pone `nombres.mjs`; ~31 tramos no tienen porque en OSM tampoco).
  - `zona`: `"A"`–`"D"` (los de OSM no tienen zona).
  - `fuente`: `"verificada"` (línea continua), `"satelital"` (punteada) u `"osm"` (agregada desde OSM, continua).
  - `osm_id`: solo en tramos que vienen de OSM.
  - `_umap_options`: estilo heredado de uMap; la app lo ignora pero se conserva al exportar.
- Si un `id` de `sin-clasificar.geojson` ya está en asfalto o tierra (porque se pintó y se publicó), la app lo
  ignora en sin clasificar. Así no hace falta tocar `sin-clasificar.geojson` al publicar cambios.
- Los archivos de la zona D del dataset original traen la longitud desplazada −720° (p. ej. `-780.16` en vez
  de `-60.16`). `build-data.mjs` y `app.js` (`normalizarCoords`) la llevan a [−180, 180). Mantener ambas.

## Cómo está armado `app.js`

- `CAPAS = ['asfalto', 'tierra']` son las capas reales (conteos, porcentajes, descargas, destinos de mover).
  `SIN = 'sinclasificar'` es la tercera; `TODAS` las incluye a las tres, con `SIN` al final.
- Un único objeto `estado` (tramos, capas visibles, selección, historial, modo múltiple, nombres, fondo).
  Cada tramo: `{ id, props, geometry, capa, original, largo, layer }`, donde `original` es la capa en los
  datos publicados y `capa` la actual.
- Zoom entre `ZOOM_MIN = 15` (escala ~300 m, se ve toda la ciudad) y `ZOOM_MAX = 18` (escala ~50 m: más cerca, el
  satélite de Esri muestra "Map data not yet available"). `limitarArea()` fija `maxBounds` al área de los datos
  más `LIMITE_M = 5000` m, con `maxBoundsViscosity: 1` (no se puede salir).
- Las calles se dibujan en un renderer **canvas** con `tolerance: 8`. El ancho sale de `anchoCalle()`:
  10 m convertidos a píxeles según el zoom (mín. 3 px, máx. 36 px), para que a zoom alto la calle se vea
  "pintada" y no como una línea encima. Sin clasificar usa el mismo ancho, gris oscuro y punteado, para que se
  distinga bien. El punteado (satelital y sin clasificar) escala con ese ancho.
- Conteos en `resumen()`: por capa junta los nombres distintos (`calles`), cuadras, km y satelitales.
- Los halos de selección van en otro canvas en el pane `halos` (z-index 390), debajo de las calles.
  Los nombres son `L.divIcon` en el pane `etiquetas` (z-index 450). `calcularCorridas()` une las cuadras visibles
  del mismo nombre que están sobre la misma recta (una calle recta entera, aunque mezcle asfalto y tierra), para
  que a zoom 15 —donde una cuadra mide ~24 px— el nombre entre a lo largo de varias cuadras.
  `actualizarEtiquetas()` (en cada `moveend` y en `render()`) pone etiquetas en posiciones fijas a lo largo de
  cada corrida, primero en las calles más largas, y descarta las que se pisan o repiten nombre muy cerca.
- Buscador (`buscar()`): `encontrarCalle()` reconoce el nombre (exacto, "empieza con", "contiene"; sin tildes);
  `ubicarAltura()` busca en `alturas.json` los dos números del mismo lado (par/impar) que encierran la altura,
  a menos de 250 m entre sí (misma cuadra), e interpola; si no hay, usa el más cercano y lo avisa.
  El resaltado y el pin van en la capa `resaltado`, aparte de la selección.
- **Todo cambio de capa pasa por `asignarCapa()`**. `mover()` además apila en `estado.historial`,
  guarda y vuelve a pintar el panel. "Pintar" es `mover()` desde `SIN`. No mover capas de Leaflet por fuera.
- El panel se redibuja con `render()` (`renderCapas`, `renderSeleccion`, `renderCambios`, `actualizarEtiquetas`).
  Los datos técnicos de fuente van plegados en `<details>` para priorizar calles, kilómetros y porcentajes;
  la fecha pública se toma de `ACTUALIZACION_DATOS` y debe mantenerse junto con los datos publicados.
  Los botones usan `data-accion` y un único listener delegado en `conectarUI()`.
- `localStorage`:
  - `victoriamap:cambios:v1` → `{ "<id>": "asfalto" | "tierra" }`, solo los tramos que difieren de los datos publicados.
  - `victoriamap:prefs:v1` → `{ visibles, fondo, nombres }`.
  - Todo acceso va en `try/catch` (`leerJSON` / `escribirJSON`): la app tiene que andar sin almacenamiento.
- Colores: `PALETAS` en `app.js` y las variables `--c-asfalto`, `--c-tierra`, `--c-sinclasificar` y `--c-sel`
  en CSS (`aplicarFondo` las sincroniza). Si cambiás un color, cambialo en `PALETAS`.
- `tests/e2e.mjs` usa nombres de nivel superior de `app.js` (`estado`, `map`, `grupos`, `encuadrar`, `anchoCalle`,
  `limpiarSeleccion`, `cuadrasDeLaCalle`).
  Si los renombrás, actualizá la prueba.

## Convenciones

- Código, identificadores, textos de la interfaz y documentación **en español**. La interfaz usa voseo
  rioplatense ("Hacé clic", "Descargá").
- Números con `Intl.NumberFormat('es-AR')` (`1.112`, `137,1 km`).
- Todo texto que se interpole en `innerHTML` pasa por `esc()` (los nombres de calle vienen de OSM).
- Respetá el estilo del archivo que edites (2 espacios; comillas simples en `public/app.js`, dobles en `scripts/`).
- Nada de librerías nuevas para cosas que se resuelven con el DOM o con Leaflet.

## Comandos

```bash
npm run dev            # http://127.0.0.1:5173  ← acá se audita todo antes de publicar
npm test               # prueba E2E (necesita Chrome o Edge; CHROME_PATH si no lo encuentra)
npm run nombres        # recalcula `nombre` en public/data/ (seguro: no pisa cambios)
npm run sin-clasificar # recalcula las cuadras sin clasificar a partir de las capas actuales (seguro)
npm run osm            # vuelve a bajar las calles de OSM (red); después: sin-clasificar y nombres
npm run alturas        # vuelve a bajar la numeración de OSM (red)
npm run data           # regenera TODO public/data/ desde dataset/ — ver advertencia abajo
```

## Cuidado con

- **`npm run data` pisa `public/data/`**. Si los GeoJSON publicados ya incluyen cambios hechos en el mapa
  (descargados y reemplazados), regenerar desde `dataset/` los pierde. Usalo solo si cambió `dataset/`.
  Para refrescar nombres o calles faltantes usá `npm run nombres` / `npm run sin-clasificar`, que son seguros.
- **Los `id` del dataset son secuenciales** según el orden de `dataset/`. Si se agrega o quita un archivo en
  `dataset/` y se regenera, los `id` se corren y los cambios guardados en navegadores apuntarían a otros tramos.
  En ese caso, subir la clave a `victoriamap:cambios:v2` en `app.js` para descartar los cambios viejos.
- Los cambios de cada persona quedan **en su navegador**: dos personas no ven los cambios de la otra.
  Para combinar trabajo, uno exporta, se reemplazan los archivos en `public/data/`, se publica, y recién
  después sigue el otro.
- **Overpass** (la API de OSM) rechaza con HTTP 406 un User-Agent que contenga una URL, y suele estar saturado
  (504): `osm-calles.mjs` usa un User-Agent simple, reintenta y prueba servidores espejo.
- **Fondo "Mapa"**: Esri `Canvas/World_Light_Gray_Base`, gris y **sin textos ni números de casa** (los nombres los
  escribe la app). Esri lo sirve hasta zoom 16; más cerca se agranda. No volver a OpenStreetMap estándar ni a
  `World_Street_Map`: muestran números de casa y líneas de direcciones que se confunden con los datos.
  **CARTO** (`basemaps.cartocdn.com`) ahora pide API key y muestra "API KEY REQUIRED".
- **Fondo "Color"**: Esri `World_Street_Map` con `maxNativeZoom: 17`, porque a zoom 18 trae números de casa dibujados
  (la numeración tiene que depender solo del interruptor).
- **Satélite**: Esri World Imagery, con imagen hasta zoom 18 en Victoria (por eso `ZOOM_MAX`).
- Los nombres y calles de OSM son © colaboradores de OpenStreetMap (ODbL) y el fondo es de Esri: **los créditos no se
  pueden sacar**. Están plegados en una "i" abajo a la derecha (clase `plegada`, se despliegan al tocarla); el
  prefijo "Leaflet" sí se sacó (`setPrefix(false)`), porque su licencia no lo exige.
- Las URLs de cada deploy (`victoriamap-xxxx-….vercel.app`) piden login de Vercel. La pública es `victoriamap.vercel.app`.

## Antes de dar un cambio por terminado

1. `npm test` pasa (si agregás funcionalidad, agregá su verificación en `tests/e2e.mjs`).
2. Probalo a ancho de celular (≤ 720 px): sin scroll horizontal y con el panel usable.
3. Si cambia el comportamiento, actualizá este archivo, `README.md` y la bitácora en `docs/`.
4. Dejalo corriendo en `npm run dev` para que lo audite el dueño. No publiques.

La prueba E2E entra con `?editar` para probar mover/pintar, y al final verifica el expositor (sin `?editar`).
