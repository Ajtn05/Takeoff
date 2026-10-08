import { DRONE_PRESETS, FLIGHT_PARAMETERS } from '../../flight/profiles';
import { html } from '../markup';

export const droneSettingsDialog = () =>
  html` <dialog id="drone-dialog" class="station-dialog drone-dialog" aria-labelledby="drone-title">
    <header class="dialog-header">
      <div>
        <span class="dialog-eyebrow">FLIGHT SETUP</span>
        <h2 id="drone-title">Drone parameters</h2>
      </div>
      <button id="close-drone" class="icon-button" aria-label="Close drone parameters">×</button>
    </header>
    <form id="drone-form">
      <div class="preset-choice">
        <label for="drone-preset">Drone preset</label
        ><select id="drone-preset">
          ${DRONE_PRESETS.map((preset) => `<option value="${preset.id}">${preset.name}</option>`).join('')}
          <option value="custom">Custom</option>
        </select>
      </div>
      <p id="preset-description"></p>
      <div class="parameter-grid">
        ${FLIGHT_PARAMETERS.map((field) => `<div class="parameter-field"><label for="parameter-${field.key}">${field.label}<span id="unit-${field.key}">${field.unit}</span></label><div class="parameter-inputs"><input id="range-${field.key}" type="range" aria-label="${field.label} slider" aria-describedby="unit-${field.key} hint-${field.key}" min="${field.min}" max="${field.max}" step="${field.step}"><input id="parameter-${field.key}" name="${field.key}" type="number" aria-label="${field.label}" aria-describedby="unit-${field.key} hint-${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" required></div><p id="hint-${field.key}">${field.hint}</p></div>`).join('')}
      </div>
      <p class="preset-note">
        DJI presets use published maximum flight speeds and the trainer aircraft size. The tracking
        helicopter has its own model and rotor clearance, with simulator speeds and handling for F1
        tracking. Turn rate, acceleration, and braking are estimates. Changing aircraft type returns
        you to the launch pad.
        <a id="preset-source" target="_blank" rel="noopener noreferrer" hidden
          >Manufacturer specifications</a
        >
      </p>
      <div class="drone-actions">
        <button id="drone-defaults" class="button quiet" type="button">
          Restore trainer defaults</button
        ><button id="cancel-drone" class="button quiet" type="button">Cancel</button
        ><button class="button primary" type="submit">Apply settings</button>
      </div>
      <p class="drone-pause-note">
        Changes apply when you resume. Flight stays paused after closing.
      </p>
    </form>
  </dialog>`;
