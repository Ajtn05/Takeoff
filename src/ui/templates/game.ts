import { MANEUVERS } from '../../game/engine';
import { pairingDialog } from '../../network/pairing';
import { GAME_PAIRING_COPY } from '../pairing-copy';
import { icon } from '../icons';
import { html } from '../markup';
import { takeoffWordmark, controlSourceSelector, toastMarkup } from './common';

export function gameMarkup(): string {
  return html`<main class="rush-game">
    <header class="rush-header">
      ${takeoffWordmark()}<span class="rush-mode-label">FLIGHT RUSH <i>ENDLESS</i></span>
      <div class="rush-tools">
        <label><span class="sr-only">Controls</span>${controlSourceSelector()}</label
        ><button id="pair" class="button quiet">${icon('phone')}<span>Pair phone</span></button
        ><button id="game-guide" class="button quiet" aria-label="Game guide">
          ${icon('guide')}</button
        ><button
          id="game-fullscreen"
          class="button quiet"
          aria-label="Fullscreen"
          aria-pressed="false"
        >
          ${icon('fullscreen')}
        </button>
      </div>
    </header>
    <section
      id="game-stage"
      class="rush-stage"
      aria-label="Flight Rush course"
      data-phase="ready"
      tabindex="-1"
    >
      <div class="rush-hud">
        <div class="rush-score">
          <span>SCORE</span><strong id="game-score">0</strong
          ><small>BEST <b id="game-best">0</b></small>
        </div>
        <div class="rush-run-stats">
          <div>
            <span>STREAK</span><strong id="game-combo">0 <small>×1</small></strong>
          </div>
          <div>
            <span>SHIELDS</span
            ><strong id="game-shields" aria-label="3 shields remaining">● ● ●</strong>
          </div>
          <div><span>LEVEL</span><strong id="game-level">01</strong></div>
        </div>
        <div class="rush-playback">
          <button id="game-pause" class="button quiet" aria-label="Pause run">
            ${icon('pause')}</button
          ><button id="game-retry" class="button quiet" aria-label="Restart run">
            ${icon('reset')}
          </button>
        </div>
      </div>
      <div id="game-feedback" class="rush-feedback" role="status" aria-live="polite"></div>
      <div class="rush-maneuver">
        <span class="eyebrow" id="game-gate-number">GATE 01</span>
        <div class="maneuver-heading">
          <span id="game-move-symbol">↑</span>
          <h2 id="game-move">Push forward</h2>
          <kbd id="game-key">↑</kbd>
        </div>
        <p id="game-hint"></p>
        <div class="maneuver-progress"><i id="game-move-progress"></i></div>
        <div class="maneuver-meta">
          <span id="game-requirement">COMPLETE THE MOVE + CLEAR THE OPENING</span
          ><span id="game-gate-distance">45 m</span>
        </div>
      </div>
      <div id="game-camera" class="rush-camera" aria-label="Drone camera preview">
        <div class="rush-camera-label">
          ${icon('camera')} LIVE CAMERA <span id="game-tilt">−12°</span>
        </div>
        <div class="rush-camera-reticle"></div>
        <span id="game-beacon" class="beacon-hint" hidden>BEACON IN FRAME</span>
      </div>
      <div id="game-overlay" class="rush-overlay">
        <section class="rush-prompt" aria-labelledby="game-title">
          <span class="eyebrow" id="game-prompt-eyebrow">THE CITY IS YOUR FLIGHT PATH</span>
          <h1 id="game-title">Ready for<br /><em>the rush?</em></h1>
          <p id="game-prompt-copy">
            An endless course. Your usual drone controls.<br />Make the move and clear the gate to
            build your score.
          </p>
          <div id="game-results" class="rush-results" hidden>
            <div><span>GATES</span><strong id="result-gates">0</strong></div>
            <div><span>DISTANCE</span><strong id="result-distance">0 m</strong></div>
            <div><span>BEST STREAK</span><strong id="result-combo">0</strong></div>
          </div>
          <div id="game-ready-rules" class="rush-rules">
            <span>3 shields</span><span>12 maneuvers</span><span>One endless run</span>
          </div>
          <button id="game-start" class="button primary rush-start">
            ${icon('takeoff')}<span>Launch run</span></button
          ><span id="game-start-hint" class="rush-start-hint">T to launch · Space to pause</span
          ><a class="rush-menu-link" href="/">${icon('reset')} Back to menu</a>
        </section>
      </div>
    </section>
    <footer class="rush-instruments">
      <span id="game-status" role="status">Ready to launch</span>
      <div>
        <span>ALT <b id="game-altitude">0.0</b> m</span
        ><span title="Forward pace through the course, including forward/backward input"
          >PACE <b id="game-speed">7.0</b> m/s</span
        ><span>HDG <b id="game-heading">000</b>°</span
        ><span>TILT <b id="game-instrument-tilt">−12</b>°</span
        ><span title="Forward/backward position relative to the center of the flight corridor"
          ><b id="game-position">CENTER 0.0</b> m</span
        ><span>DIST <b id="game-distance">0</b> m</span>
      </div>
      <span id="connection-status">Keyboard · ready</span>
    </footer>
    <div class="rush-controls-strip" aria-label="Keyboard controls">
      <span><kbd>↑ ↓</kbd> Forward / back</span><span><kbd>← →</kbd> Strafe</span
      ><span><kbd>W S</kbd> Climb / descend</span><span><kbd>A D</kbd> Turn</span
      ><span><kbd>R F</kbd> Camera tilt</span><span><kbd>C</kbd> Capture</span
      ><span><kbd>L</kbd> Bank run</span>
    </div>
    <dialog id="game-guide-dialog">
      <div class="dialog-header">
        <h2>How to play Flight Rush</h2>
        <button id="game-guide-close" class="icon-button" aria-label="Close game guide">×</button>
      </div>
      <p>
        The course scrolls toward you automatically. Fly freely inside the corridor with the same
        controls as Practice. Hold forward to go faster; the course follows your travel at the front
        of the view. Pull backward to slow down safely. The large view follows your drone; the inset
        shows its camera.
      </p>
      <p>
        Each gate asks for a move. Follow the cue, then pass through the opening. Forward gates need
        you ahead of the center line; backward gates need you behind it. Yaw gates also check your
        heading. Hover gates need one second with centered sticks.
      </p>
      <div class="rush-guide-moves">
        ${MANEUVERS.map((move) => `<span><kbd>${move.key}</kbd> ${move.label}</span>`).join('')}
      </div>
      <p>
        Camera gates check the tilt shown on the live preview. For the beacon, face forward and tilt
        to −12°; capture while “Beacon in frame” is visible.
      </p>
      <p>
        Earn 2 points per meter, 100 per gate, and 50 extra for a centered pass. Every four
        consecutive gates increases the multiplier, up to ×5. Missing an opening or its maneuver
        costs one of three shields and resets the streak. Ground contact or crossing the corridor’s
        sides or ceiling ends the run. Every eight gates, the course gets faster and openings get
        tighter.
      </p>
      <p>
        Take off starts a run. Space pauses or resumes. L or the phone’s Land button banks your
        score and ends the run. Restart resets the course. Best scores stay in this browser.
      </p>
      <p>
        On a phone, use your usual DJI stick mode. Select Pair phone, enable controls, close the
        pairing dialog, and take off. Pauses require enabling phone controls again before resuming.
      </p>
    </dialog>
    ${pairingDialog(GAME_PAIRING_COPY)}${toastMarkup()}
  </main>`;
}
