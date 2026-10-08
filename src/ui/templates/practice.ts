import { controlSourceSelector, toastMarkup } from './common';
import { PRACTICE_MAP } from '../../maps/maps';
import { icon } from '../icons';
import { assistanceDialogs } from '../assistance';
import { pairingDialog } from '../../network/pairing';
import { PRACTICE_PAIRING_COPY } from '../pairing-copy';
import { VIEW_LAYOUTS } from '../layouts';
import { iconControl } from '../buttons';
import { html } from '../markup';

export function practiceMarkup(): string {
  return html` <main class="simulator">
    <header class="topbar">
      <a
        class="station-brand"
        href="/"
        aria-label="Takeoff main menu"
        style="color:inherit;text-decoration:none"
        ><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M10 10 22 22M22 10 10 22M12 12h8v8h-8z" />
          <circle cx="7" cy="7" r="5" />
          <circle cx="25" cy="7" r="5" />
          <circle cx="7" cy="25" r="5" />
          <circle cx="25" cy="25" r="5" />
        </svg>
        <h1 class="app-title">TAKEOFF</h1></a
      >
      <div class="toolbar">
        <div
          id="transport-controls"
          class="control-module"
          role="group"
          aria-label="Flight playback"
        >
          ${iconControl('reset', 'reset', 'Reset flight')}
          ${iconControl('pause', 'play', 'Start practice', 'aria-pressed="false"', 'Start practice · Space', 'button primary icon-control')}
        </div>
        <div
          id="utility-controls"
          class="control-module"
          role="group"
          aria-label="Station controls"
        >
          ${iconControl('simulator-fullscreen', 'fullscreen', 'Fullscreen', 'aria-pressed="false"')}
          ${iconControl('pair', 'phone', 'Pair phone')}
        </div>
        <div
          id="assistance-controls"
          class="control-module"
          role="group"
          aria-label="Help and drone setup"
        >
          ${iconControl('drone-parameters', 'tune', 'Drone parameters', 'aria-haspopup="dialog" aria-controls="drone-dialog"')}
          <button
            id="guide"
            class="button quiet guide-button"
            aria-haspopup="dialog"
            aria-controls="guide-dialog"
          >
            ${icon('guide')}<span>Guide</span>
          </button>
        </div>
      </div>
    </header>
    <section class="map-strip" aria-label="Practice location">
      <label class="map-choice" title="Practice location"
        >${icon('map')}<select id="map" aria-label="Choose a map">
          <option value="park">Practice park</option>
          <option value="rally">Rally circuit · Tracking</option>
          <option value="silverstone">Silverstone · Formula One</option>
          <option value="ateneo">Ateneo de Manila · Loyola Heights</option>
        </select></label
      >
      <label id="spot-control" class="map-choice" title="Practice route"
        >${icon('pin')}<select id="photo-spot" aria-label="Choose a practice route"></select
      ></label>
      <label class="map-choice" title="Flight speed limit"
        >${icon('speed')}<select id="flight-speed" aria-label="Flight speed limit">
          <option value="5">5 m/s</option>
          <option value="10">10 m/s</option>
          <option value="20" selected>20 m/s</option>
        </select></label
      >
      ${iconControl('map-tip', 'info', 'Location information', '', `Choose an obstacle route, Rally tracking, or Silverstone Formula One tracking. 240 × 240 m · ${PRACTICE_MAP.bounds.ceiling} m ceiling`)}
      <span id="map-boundary" class="sr-only"
        >240 × 240 m · ${PRACTICE_MAP.bounds.ceiling} m ceiling</span
      >
    </section>
    <section class="workspace-bar" aria-label="Workspace layout">
      <div class="layout-presets control-module" role="group" aria-label="View layout">
        ${VIEW_LAYOUTS.map(({ id: layout, label, icon: name }) => `<button class="layout-option icon-control" data-layout-option="${layout}" aria-label="${label}" data-tooltip="${label}" aria-pressed="${layout === 'split'}">${icon(name)}</button>`).join('')}
      </div>
      <select id="view-layout" class="mobile-layout" aria-label="View layout">
        ${VIEW_LAYOUTS.map((layout) => html`<option value="${layout.id}">${layout.label}</option>`).join('')}
      </select>
      <div id="split-controls" class="split-controls">
        ${iconControl('split-reset', 'equalize', 'Equalize views', '', 'Give both views equal space')}<span
          id="split-value"
          class="sr-only"
          >62 / 38</span
        >
      </div>
      <div
        id="flight-status"
        class="flight-status"
        role="status"
        tabindex="0"
        data-paused="true"
        data-mode="grounded"
        aria-describedby="pause-reason"
        data-tooltip="Take off to begin."
      >
        <i class="dot"></i><span id="flight-state">Paused</span
        ><span id="pause-reason" class="sr-only">Take off to begin.</span>
      </div>
      ${iconControl('workspace-reset', 'reset', 'Reset workspace', '', 'Restore the default layout and instrument panel')}
    </section>
    <section
      id="stage"
      class="viewport-stage"
      aria-label="Flight workspace"
      data-layout="split"
      tabindex="-1"
    >
      <div
        id="course-progress"
        class="course-progress"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        hidden
      >
        <div><strong id="course-name"></strong><span id="course-count"></span></div>
        <span id="course-next"></span>
      </div>
      <div
        id="observer-view"
        class="observer-view view"
        aria-label="Observer view"
        aria-describedby="fixed-view-hint"
      >
        <div class="view-heading">
          <span>Observer</span>
          <div class="observer-tools">
            <select id="observer-mode" aria-label="Observer camera">
              <option value="fixed">Fixed view</option>
              <option value="follow">Follow drone</option>
              <option value="overview">Map overview</option></select
            >${iconControl('observer-reset', 'reset', 'Reset fixed view', '', 'Restore the launch viewpoint')}
          </div>
        </div>
        <p id="fixed-view-hint" class="fixed-view-hint">
          Drag to orbit · Shift-drag to pan · Scroll to zoom
        </p>
      </div>
      <div
        id="view-divider"
        class="view-divider"
        role="separator"
        tabindex="0"
        aria-label="Resize observer and camera views"
        aria-orientation="vertical"
        aria-valuemin="25"
        aria-valuemax="75"
        aria-valuenow="62"
      >
        <span></span>
      </div>
      <aside id="camera-column" class="camera-column">
        <div class="camera-title">
          <span>Camera</span
          ><span
            class="camera-spec"
            title="16:9 · 64° field of view · 1280 × 720 PNG captures"
            tabindex="0"
            aria-label="Camera specifications"
            >${icon('info')}</span
          >
        </div>
        <div id="camera-view" class="camera-view view">
          <div id="thirds" class="thirds"><i></i><i></i><i></i><i></i></div>
          <div class="camera-crosshair">+</div>
          <div class="camera-caption">
            <span
              id="framing"
              tabindex="0"
              role="img"
              aria-label="Subject not framed"
              title="Subject not framed"
              >${icon('frame')}</span
            >
          </div>
        </div>
      </aside>
      <section id="flight-panel" class="flight-panel is-glass" aria-label="Flight parameters">
        <header class="instrument-header">
          <span class="instrument-title">Flight</span
          ><button
            id="panel-glass"
            class="instrument-button"
            aria-label="Transparent instrument panel"
            aria-pressed="true"
            title="Glass panel · switch to solid"
          >
            ${icon('contrast')}</button
          ><button
            id="panel-collapse"
            class="instrument-button collapse-button"
            aria-label="Collapse flight parameters"
            aria-expanded="true"
            aria-controls="flight-panel-body"
            title="Collapse flight parameters"
          >
            ${icon('collapse')}
          </button>
        </header>
        <div class="telemetry" aria-label="Flight readings">
          <div>
            <span title="Altitude above the ground directly below the drone">ALT</span
            ><strong id="altitude">0.0 <small>m</small></strong>
            <div class="instrument-scale"><i id="altitude-scale"></i></div>
          </div>
          <div>
            <span title="Horizontal ground speed">SPD</span
            ><strong id="speed">0.0 <small>m/s</small></strong>
            <div class="instrument-scale"><i id="speed-scale"></i></div>
          </div>
          <div>
            <span title="Heading">HDG</span><strong id="heading">000 <small>°</small></strong>
          </div>
          <div>
            <span title="Camera gimbal tilt">GMB</span
            ><strong id="gimbal-value">−12 <small>°</small></strong>
          </div>
        </div>
        <div id="flight-panel-body">
          <div class="gimbal-control">
            <label for="gimbal" title="Camera tilt · R / F · −90° to +20°">Tilt</label
            ><input
              id="gimbal"
              type="range"
              min="-90"
              max="20"
              value="-12"
              aria-label="Camera gimbal angle"
              title="Camera tilt · R / F · −90° to +20°"
            />
          </div>
          <div class="instrument-footer">
            <span title="Vertical speed · positive while climbing"
              >V/S <strong id="vertical-speed">+0.0</strong> m/s</span
            >
          </div>
        </div>
      </section>
      <section
        id="collision-prompt"
        class="collision-prompt"
        role="alertdialog"
        aria-modal="false"
        aria-labelledby="collision-title"
        aria-describedby="collision-details"
        hidden
      >
        <div class="collision-heading">
          ${icon('warning')}
          <h2 id="collision-title">Collision</h2>
        </div>
        <p id="collision-details"></p>
        <button id="collision-reset" class="button">
          ${icon('reset')}<span>Reset flight</span>
        </button>
      </section>
    </section>
    <section id="flight-console" class="flight-strip">
      <div class="flight-actions control-module" role="group" aria-label="Flight actions">
        ${iconControl('takeoff', 'takeoff', 'Take off', 'disabled', 'Take off · T')}${iconControl('land', 'land', 'Land', 'disabled', 'Land · L')}<span
          class="action-divider"
        ></span
        >${iconControl('capture', 'camera', 'Capture photo', 'disabled', 'Capture photo · C', 'button shutter icon-control')}
      </div>
      <div class="view-options control-module" role="group" aria-label="Display options">
        ${iconControl('aids', 'aids', 'Observer aids', 'aria-pressed="true"')}${iconControl('grid', 'grid', 'Thirds grid', 'aria-pressed="true"')}${iconControl('trees', 'tree', 'Campus trees', 'aria-pressed="true" hidden', 'Show or hide campus trees')}${iconControl('quality', 'quality', 'Low graphics', 'aria-pressed="false"')}
      </div>
      <label class="source-control control-module"
        ><span class="sr-only">Controls</span>${controlSourceSelector()}</label
      >
    </section>
    <section class="photo-library" aria-label="Photo gallery">
      <span class="section-label">Photos <span id="photo-count">0</span></span>
      <div id="photos"><span class="empty-photos">No photos.</span></div>
    </section>
    <p id="map-credit" class="map-credit" hidden>
      1:1 meter scale · 30 m elevation data, smoothed · building details and satellite tree
      placement estimated. Map ©
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
        >OpenStreetMap contributors</a
      >
      · <a href="/data/ateneo-campus.json" download>Campus data (ODbL)</a> · elevation courtesy of
      USGS via
      <a
        href="https://registry.opendata.aws/terrain-tiles/"
        target="_blank"
        rel="noopener noreferrer"
        >Mapzen/AWS</a
      >
      · <a href="/data/ateneo-elevation.json" download>Elevation data</a> ·
      <a
        href="https://commons.wikimedia.org/wiki/Category:Buildings_of_Ateneo_de_Manila_University"
        target="_blank"
        rel="noopener noreferrer"
        >Building photo references</a
      >
    </p>
    <p id="silverstone-credit" class="map-credit" hidden>
      Approximate GP layout · 5.891 km modeled lap · illustrative scenery and car speeds. Based on
      <a
        href="https://www.silverstone.co.uk/sites/default/files/pdf/British%20Grand%20Prix%202025%20Map.pdf"
        target="_blank"
        rel="noopener noreferrer"
        >Silverstone’s circuit map</a
      >
      and
      <a
        href="https://www.fia.com/system/files/decision-document/2025_silverstone_event_-_circuit_map_-_silverstone_2025.pdf"
        target="_blank"
        rel="noopener noreferrer"
        >FIA circuit length</a
      >.
    </p>
    <footer>
      <span id="connection-status"><i class="dot"></i> Starting session…</span
      ><span id="performance">60 Hz simulation</span>
    </footer>
    ${toastMarkup()} ${pairingDialog(PRACTICE_PAIRING_COPY)} ${assistanceDialogs()}
  </main>`;
}
