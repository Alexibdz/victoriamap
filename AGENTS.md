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

# Calles de Victoria: instrucciones para agentes de IA

Las instrucciones completas del proyecto están en un único archivo, compartido por todos los agentes:
**[.github/copilot-instructions.md](.github/copilot-instructions.md)**. Leelo antes de hacer cualquier cambio.

Resumen de lo innegociable:

- Sitio estático (HTML + CSS + JS + Leaflet), sin base de datos, sin backend, sin frameworks ni dependencias.
- No publicar en Vercel ni hacer push sin pedido explícito del dueño: se entrega funcionando en `npm run dev`.
- No hay pruebas automáticas (el dueño las pidió fuera): revisá a mano en `npm run dev`.
- **Documentar cada cambio y cada decisión** en la bitácora de `docs/` y, si cambia algo de fondo, en
  `.github/copilot-instructions.md` y `README.md`. Y pedirle lo mismo a cualquier otro agente que trabaje acá.
