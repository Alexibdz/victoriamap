'use strict';

/* Tema claro/oscuro y menús flotantes, compartido por la portada (index.html) y el mapa (mapa.html).
   Tema:
   - Preferencia: 'auto' (por defecto: sigue al dispositivo), 'claro' u 'oscuro'. Se guarda en este navegador.
   - Pone <html data-tema="claro|oscuro"> con el tema efectivo; los CSS usan [data-tema="oscuro"].
   - Avisa con el evento 'cambio-tema' en window (el mapa cambia el fondo, la portada redibuja las calles).
   Menús flotantes (.menu-flotante, estilos en tema.css): un botón redondo (.menu-boton) que despliega
   opciones (.menu-opciones con role="menuitemradio"). Lo usan el tema (.tema-boton, data-tema-opcion) y,
   en el mapa, el fondo (data-accion="fondo", lo atiende app.js). Al elegir una opción el menú se cierra.
   Se carga en el <head> (sin defer) para que la página no aparezca un instante con el tema equivocado. */
(function () {
  const CLAVE = 'victoriamap:tema';
  const OPCIONES = ['auto', 'claro', 'oscuro'];
  const ICONO = { auto: 'bi-circle-half', claro: 'bi-sun', oscuro: 'bi-moon-stars' };
  const NOMBRE = { auto: 'automático', claro: 'claro', oscuro: 'oscuro' };
  const oscuroDelDispositivo = window.matchMedia('(prefers-color-scheme: dark)');
  let preferencia = 'auto';
  try {
    const guardada = localStorage.getItem(CLAVE);
    if (OPCIONES.includes(guardada)) preferencia = guardada;
  } catch {
    /* sin almacenamiento: queda en automático */
  }

  const efectivo = () => (preferencia === 'auto' ? (oscuroDelDispositivo.matches ? 'oscuro' : 'claro') : preferencia);

  function aplicar() {
    const tema = efectivo();
    const raiz = document.documentElement;
    const cambio = raiz.dataset.tema !== tema;
    raiz.dataset.tema = tema;
    raiz.style.colorScheme = tema === 'oscuro' ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = tema === 'oscuro' ? '#10141c' : '#f6f7f9';
    document.querySelectorAll('[data-tema-opcion]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.temaOpcion === preferencia));
    });
    document.querySelectorAll('.tema-boton').forEach((b) => {
      const icono = b.querySelector('.bi');
      if (icono) icono.className = `bi ${ICONO[preferencia]}`;
      b.setAttribute('aria-label', `Tema: ${NOMBRE[preferencia]}. Cambiar`);
      b.title = `Tema: ${NOMBRE[preferencia]}`;
    });
    if (cambio) window.dispatchEvent(new CustomEvent('cambio-tema', { detail: { tema } }));
  }

  /* ---------- Menús flotantes ---------- */
  function abrirMenu(menu, abrir) {
    const opciones = menu.querySelector('.menu-opciones');
    opciones.hidden = !abrir;
    menu.classList.toggle('abierto', abrir);
    menu.querySelector('.menu-boton').setAttribute('aria-expanded', String(abrir));
    if (abrir) (opciones.querySelector('[aria-checked="true"]') ?? opciones.querySelector('button'))?.focus();
  }

  const cerrarTodos = (excepto) => document.querySelectorAll('.menu-flotante.abierto').forEach((m) => {
    if (m !== excepto) abrirMenu(m, false);
  });

  window.tema = {
    get preferencia() { return preferencia; },
    get actual() { return efectivo(); },
    elegir(opcion) {
      if (!OPCIONES.includes(opcion)) return;
      preferencia = opcion;
      try { localStorage.setItem(CLAVE, opcion); } catch { /* sin almacenamiento */ }
      aplicar();
    },
  };

  oscuroDelDispositivo.addEventListener?.('change', () => { if (preferencia === 'auto') aplicar(); });

  document.addEventListener('click', (e) => {
    const opcionTema = e.target.closest('[data-tema-opcion]');
    if (opcionTema) window.tema.elegir(opcionTema.dataset.temaOpcion);

    const opcion = e.target.closest('.menu-opciones [role="menuitemradio"]');
    if (opcion) {
      const menu = opcion.closest('.menu-flotante');
      abrirMenu(menu, false);
      menu.querySelector('.menu-boton').focus();
      return;
    }
    const boton = e.target.closest('.menu-boton');
    if (boton) {
      const menu = boton.closest('.menu-flotante');
      cerrarTodos(menu);
      abrirMenu(menu, !menu.classList.contains('abierto'));
      return;
    }
    if (!e.target.closest('.menu-opciones')) cerrarTodos(); // clic afuera
  });

  document.addEventListener('keydown', (e) => {
    const menu = e.target.closest?.('.menu-flotante.abierto');
    if (!menu) return;
    if (e.key === 'Escape') {
      abrirMenu(menu, false);
      menu.querySelector('.menu-boton').focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const botones = [...menu.querySelectorAll('[role="menuitemradio"]')];
      const i = botones.indexOf(document.activeElement);
      botones[(i + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) % botones.length].focus();
    }
  });

  document.addEventListener('DOMContentLoaded', aplicar); // marca la opción elegida cuando el menú ya existe
  aplicar();
})();
