import type { StickSide } from '../../flight/stick-modes';
import { html } from '../markup';

export function controllerMarkup(): string {
  const stickColumn = (side: StickSide) =>
    html`<div class="stick-column">
      <div class="stick-heading">
        <span class="stick-title">${side.toUpperCase()} CONTROL STICK</span
        ><strong id="${side}-axes" class="stick-axes"></strong>
      </div>
      <div id="${side}-stick" class="stick" role="group">
        <span class="axis up"></span><span class="axis down"></span><span class="axis left"></span
        ><span class="axis right"></span>
        <div class="stick-ring"></div>
        <div id="${side}-knob" class="stick-knob"></div>
      </div>
      <span id="${side}-value" class="stick-value"></span>
    </div>`;
  return html`<main class="controller controls-disabled">
    <header class="controller-top">
      <div class="controller-title">Phone controller</div>
      <label class="stick-mode-choice"
        >STICK MODE
        <select id="stick-mode" aria-label="Stick mode">
          <option value="1">Mode 1</option>
          <option value="2" selected>Mode 2 · Default</option>
          <option value="3">Mode 3</option>
        </select></label
      >
      <span id="phone-connection" class="connection-pill">Connecting…</span
      ><button id="fullscreen" class="button quiet" aria-pressed="false">Fullscreen</button>
    </header>
    <div class="controller-status">
      <span>ALT <strong id="phone-altitude">—</strong></span
      ><span>SPD <strong id="phone-speed">—</strong></span
      ><span>HDG <strong id="phone-heading">—</strong></span
      ><span>GIMBAL <strong id="phone-gimbal">—</strong></span>
    </div>
    <section class="stick-layout">
      ${stickColumn('left')}
      <div class="controller-center">
        <span class="section-label">Camera</span>
        <div class="gimbal-buttons">
          <button id="tilt-up" class="button" disabled aria-label="Tilt camera up">↑ Tilt</button
          ><button id="tilt-down" class="button" disabled aria-label="Tilt camera down">
            ↓ Tilt
          </button>
        </div>
        <button id="phone-capture" class="capture-circle" disabled aria-label="Capture photo">
          <span></span></button
        ><span id="capture-state" class="capture-state">Capture photo</span>
        <div class="phone-flight-buttons">
          <button id="phone-takeoff" class="button" disabled>↑ Take off</button
          ><button id="phone-land" class="button" disabled>↓ Land</button>
        </div>
        <div
          id="phone-pause-prompt"
          class="phone-pause-prompt"
          role="status"
          aria-live="polite"
          hidden
        >
          <strong id="phone-pause-title">Game paused</strong><span id="phone-resume-hint"></span>
        </div>
        <button id="phone-resume" class="button primary" disabled hidden>▶ Resume game</button>
        <button id="enable" class="button primary" disabled>Enable controls</button
        ><span id="phone-message" role="status">Center the sticks before enabling.</span>
      </div>
      ${stickColumn('right')}
    </section>
    <footer class="controller-footer">
      <span id="phone-timing">60 Hz input · waiting for laptop</span
      ><label
        >STICK SIZE
        <select id="stick-size" aria-label="Stick size">
          <option value="normal">Standard</option>
          <option value="small">Small</option>
          <option value="large">Large</option>
        </select></label
      ><span id="wake-status">Keep your screen awake</span>
    </footer>
    <div class="rotate-hint">
      <span>↻</span>
      <h2>Rotate to landscape</h2>
      <p>Use landscape orientation for both sticks.</p>
    </div>
  </main>`;
}
