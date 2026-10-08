import { elementLookup } from './dom';
import {
  DRONE_PRESETS,
  FLIGHT_PARAMETERS,
  displayParameter,
  storeParameter,
  presetForProfile,
  type DroneSettings,
} from '../flight/profiles';

export interface DroneSettingsOptions {
  settings: () => DroneSettings;
  pause: (reason: string) => void;
  apply: (settings: DroneSettings) => void;
}

export function bindDroneSettings(root: HTMLElement, options: DroneSettingsOptions): void {
  const getElement = elementLookup(root);
  const drone = getElement<HTMLDialogElement>('drone-dialog');
  let draft = { ...options.settings().profile };
  let draftType = options.settings().aircraftType;
  const presetSelect = getElement<HTMLSelectElement>('drone-preset');
  const describe = () => {
    const preset = DRONE_PRESETS.find((item) => item.id === presetSelect.value);
    getElement('preset-description').textContent =
      preset?.description ??
      `Your own ${draftType === 'helicopter' ? 'helicopter' : 'drone'} flight and camera response settings.`;
    presetSelect.querySelector<HTMLOptionElement>('option[value="custom"]')!.textContent =
      draftType === 'helicopter' ? 'Custom helicopter' : 'Custom';
    const source = getElement<HTMLAnchorElement>('preset-source');
    source.hidden = !preset?.source;
    if (preset?.source) source.href = preset.source;
    else source.removeAttribute('href');
  };
  const render = () => {
    for (const field of FLIGHT_PARAMETERS) {
      const value = String(Number(displayParameter(field.key, draft[field.key]).toFixed(2)));
      getElement<HTMLInputElement>(`parameter-${field.key}`).value = value;
      getElement<HTMLInputElement>(`range-${field.key}`).value = value;
    }
    presetSelect.value = presetForProfile(draft, draftType);
    describe();
  };
  getElement('drone-parameters').onclick = () => {
    options.pause('Drone parameters open. Apply or cancel, then start practice to resume.');
    draft = { ...options.settings().profile };
    draftType = options.settings().aircraftType;
    render();
    drone.showModal();
  };
  getElement('close-drone').onclick = getElement('cancel-drone').onclick = () => drone.close();
  presetSelect.onchange = () => {
    const preset = DRONE_PRESETS.find((item) => item.id === presetSelect.value);
    if (preset) {
      draft = { ...preset.profile };
      draftType = preset.aircraftType;
      render();
    } else describe();
  };
  const readDraft = () => {
    for (const field of FLIGHT_PARAMETERS)
      draft[field.key] = storeParameter(
        field.key,
        getElement<HTMLInputElement>(`parameter-${field.key}`).valueAsNumber,
      );
    presetSelect.value = presetForProfile(draft, draftType);
    describe();
  };
  for (const field of FLIGHT_PARAMETERS) {
    const range = getElement<HTMLInputElement>(`range-${field.key}`);
    const number = getElement<HTMLInputElement>(`parameter-${field.key}`);
    range.oninput = () => {
      number.value = range.value;
      readDraft();
    };
    number.oninput = () => {
      if (number.validity.valid) range.value = number.value;
      readDraft();
    };
  }
  getElement('drone-defaults').onclick = () => {
    draft = { ...DRONE_PRESETS[0].profile };
    draftType = 'quadcopter';
    render();
  };
  getElement<HTMLFormElement>('drone-form').onsubmit = (event) => {
    event.preventDefault();
    if (!getElement<HTMLFormElement>('drone-form').reportValidity()) return;
    readDraft();
    options.apply({
      presetId: presetForProfile(draft, draftType),
      aircraftType: draftType,
      profile: { ...draft },
    });
    drone.close();
  };
}
