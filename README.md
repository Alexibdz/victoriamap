<!--
  NOTA PARA AGENTES DE IA (Copilot, Claude, Codex, Cursor, etc.):
  - Antes de tocar el proyecto, leé .github/copilot-instructions.md (reglas, arquitectura, qué no romper)
    y la bitácora en docs/ (por qué se tomó cada decisión).
  - No cambies las restricciones (sitio estático, sin base de datos, sin frameworks) sin que lo pida el dueño.
  - No publiques (vercel --prod) ni hagas push por tu cuenta: el dueño revisa en localhost (npm run dev).
  - No hay pruebas automáticas (el dueño las pidió fuera): se revisa a mano en `npm run dev`.
  - OBLIGATORIO: documentá cada cambio y cada decisión en los .md (bitácora en docs/ e instrucciones),
    para que el dueño, cuando retome el proyecto, pueda ver qué se hizo y por qué.
-->

# Calles de Victoria

Mapa web (Leaflet) con las calles de **asfalto** y de **tierra** de Victoria, Entre Ríos.
Es un sitio estático: no hay base de datos ni backend.

**En línea:** https://victoriamap.vercel.app · **Código:** https://github.com/Alexibdz/victoriamap

## Créditos

Proyecto realizado con ayuda de inteligencia artificial.

- **Trabajo colaborativo**: alumnos ISGB Gabriel Benitez y Alexis Artaza (créditos en la portada).
- **Relevamiento de las calles** (asfalto y tierra): estudiantes de la Escuela de Educación Técnica N° 1
  "Dr. Pedro Radio" de Victoria.
- **Montaje web**: estudiantes del Instituto de Educación Superior "Gaspar Benavento" de Victoria.
- Nombres de calles, calles faltantes y numeración: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL).
  Mapas de fondo: © Esri.

## Qué hace

- **Portada** (`index.html`): presenta el proyecto, las cifras y el trabajo colaborativo, con el botón
  "Ver el mapa". El mapa está en `mapa.html`, que se abre como **`/mapa`** (URLs limpias: `cleanUrls` en Vercel y lo mismo en `npm run dev`).
- Tema claro u oscuro según el dispositivo, con opción de elegirlo a mano.
- Muestra u oculta la capa de asfalto y la de tierra.
- Cuenta las calles de cada capa (y también cuadras y kilómetros, con desglose verificada / satelital).
- Buscador de calle y altura ("Laprida 450"): ubica la dirección y dice si la cuadra es de asfalto o de tierra.
- Las búsquedas se pueden limpiar y compartir por URL; **Ver toda la ciudad** recupera el encuadre general.
- En modo edición (`?editar` en la URL) se pueden seleccionar calles y pasarlas a la otra capa.
  Con `Shift` + clic, o con el interruptor **Varias**, se seleccionan varias a la vez; **Toda la calle**
  selecciona todas las cuadras de esa calle.
- En modo edición muestra en gris punteado las calles que existen en OpenStreetMap pero no están en ninguna
  capa (**Sin clasificar**) y permite pintarlas como asfalto o tierra.
- Escribe el nombre de cada calle sobre la calle pintada.
- Fondo gris, a color o satelital.
- Panel resumido con detalles técnicos desplegables y fecha visible de actualización de los datos.
- Deshacer (`Ctrl` + `Z`), restablecer y descargar `asfalto.geojson` / `tierra.geojson` con los cambios.

Los cambios se guardan en el navegador de cada visitante (`localStorage`). Para que pasen a ser
los datos "oficiales" del sitio, hay que descargar los GeoJSON, reemplazar los de `public/data/`
y volver a publicar.

## Documentación

> **Si trabajás con un agente de IA** (Copilot, Claude, etc.): las reglas para no romper el proyecto están en
> `.github/copilot-instructions.md` (también enlazadas desde `AGENTS.md` y `CLAUDE.md`). Cada cambio y cada
> decisión se documenta en la bitácora de `docs/`, así quien retome el proyecto entiende qué se hizo y por qué.

- [`.github/copilot-instructions.md`](.github/copilot-instructions.md): arquitectura, modelo de datos, convenciones y
  precauciones. GitHub Copilot lo carga solo; Claude Code lo lee a través de `CLAUDE.md`.
- [`docs/sesion-2026-11-16.md`](docs/sesion-2026-11-16.md): cómo se armó la primera versión, decisiones y pendientes.
- [`docs/sesion-2026-11-20.md`](docs/sesion-2026-11-20.md): mejoras de claridad, búsqueda, compartir y móvil.
- [`docs/sesion-2026-11-21.md`](docs/sesion-2026-11-21.md): portada (landing) y mapa movido a `mapa.html`.

## Estructura

```
dataset/                     GeoJSON originales (exportados de uMap), por capa, fuente y zona
dataset/osm-calles.geojson   calles de OpenStreetMap del área (nombres y calles faltantes)
scripts/build-data.mjs       une dataset/ en las dos capas de public/data/
scripts/osm-calles.mjs       descarga las calles de OSM (Overpass)
scripts/sin-clasificar.mjs   calcula las cuadras de OSM que no están en ninguna capa
scripts/nombres.mjs          agrega el nombre de la calle a cada tramo
scripts/serve.mjs            servidor local sin dependencias
public/                      lo que se publica en Vercel
  index.html, styles.css, app.js
  data/asfalto.geojson       capa de asfalto (cada tramo con id, nombre, zona y fuente)
  data/tierra.geojson        capa de tierra
  data/sin-clasificar.geojson  cuadras para pintar
```

## Uso local

Requiere Node 22 o superior. No hay dependencias que instalar.

```bash
npm run dev            # sirve public/ en http://127.0.0.1:5173
npm run nombres        # recalcula los nombres de calle (no pisa cambios)
npm run sin-clasificar # recalcula las cuadras sin clasificar (no pisa cambios)
npm run osm            # vuelve a bajar las calles de OpenStreetMap (necesita internet)
npm run data           # regenera todo public/data/ desde dataset/ (solo si cambió dataset/)
```

En Windows, `iniciar-mapa.bat` permite abrir el mapa con doble clic: abre el navegador y
deja corriendo el servidor local. La ventana debe permanecer abierta; `Ctrl` + `C` lo detiene.

## Publicar en Vercel

Primero se revisa todo en `npm run dev`. Recién con el visto bueno:

```bash
vercel --prod
```

`vercel.json` indica que el sitio publicado es la carpeta `public/`; no hay paso de build.

Nombres y calles faltantes: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), licencia ODbL.

## Actualizar los datos publicados con los cambios hechos en el mapa

1. En el mapa, mover los tramos que hagan falta.
2. Descargar `asfalto.geojson` y `tierra.geojson` desde el panel.
3. Reemplazar `public/data/asfalto.geojson` y `public/data/tierra.geojson` por los descargados.
4. `npm run sin-clasificar && npm run nombres` (opcional: limpia de sin clasificar lo que ya se pintó).
5. Revisar en `npm run dev` y después `vercel --prod`.

No corras `npm run data` después de ese reemplazo: regeneraría las capas desde `dataset/`
y se perderían los cambios.
