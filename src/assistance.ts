import { icon } from './icons';
import { DRONE_PRESETS, FLIGHT_PARAMETERS, displayParameter, storeParameter, presetForProfile, type DroneSettings } from './profiles';

const layouts = [
  ['split', 'Side by side', 'Observer and camera next to each other. Drag the divider to resize; focus it and use arrow keys for small adjustments. Narrow screens stack the views.'],
  ['stacked', 'Stacked', 'Observer above the camera. Drag the horizontal divider to resize.'],
  ['camera', 'Camera only', 'Practice framing through the drone camera. Flight instruments stay at the bottom.'],
  ['observer', 'Observer only', 'Use the whole workspace to watch the drone. Photo capture still uses the drone camera.'],
  ['classic', 'Classic', 'Observer beside a camera sidebar, with instruments below the camera.'],
] as const;

export const assistanceDialogs = () => `
  <dialog id="guide-dialog" class="station-dialog guide-dialog" aria-labelledby="guide-title">
    <header class="dialog-header"><div><span class="dialog-eyebrow">TAKEOFF</span><h2 id="guide-title">Guide</h2></div><button id="close-guide" class="icon-button" aria-label="Close guide">×</button></header>
    <div class="guide-body">
      <div class="guide-tabs" role="tablist" aria-label="Guide topics">
        ${[['startup', 'Startup'], ['controls', 'Controls'], ['connection', 'Connection'], ['layout', 'Layout']].map(([id, label], index) => `<button id="guide-tab-${id}" role="tab" aria-controls="guide-${id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${label}</button>`).join('')}
      </div>
      <div id="guide-content" class="guide-content">
        <section id="guide-startup" role="tabpanel" aria-labelledby="guide-tab-startup" tabindex="0">
          <h3>Your first flight</h3><p>The laptop runs the flight and shows both views. You can fly immediately with the keyboard.</p>
          <ol class="guide-steps">
            <li><strong>Choose your location.</strong> Pick a map and a practice route or photo spot. For obstacle routes, start with the 5 m/s speed limit.</li>
            <li><strong>Choose your controls.</strong> Keep Keyboard selected, or pair a phone from the phone icon in the toolbar.</li>
            <li><strong>Take off.</strong> Close any open dialog and press <kbd>T</kbd> or ${icon('takeoff')}. The drone climbs automatically to a 3 m hover.</li>
            <li><strong>Move and frame a photo.</strong> Use the arrow keys to move, <kbd>W</kbd> / <kbd>S</kbd> for altitude, and <kbd>A</kbd> / <kbd>D</kbd> to turn. Tilt the camera with <kbd>R</kbd> / <kbd>F</kbd>, then press <kbd>C</kbd> to capture.</li>
            <li><strong>Finish your flight.</strong> Return over the pad and press <kbd>L</kbd> to land. Landing descends at your current position.</li>
          </ol>
          <p class="guide-note"><kbd>Space</kbd> pauses or resumes. Opening Guide, pairing, or drone parameters pauses the flight. After closing, press <kbd>Space</kbd> to resume, or <kbd>T</kbd> to take off from the ground. After a collision, use Reset flight.</p>
          <p><strong>Tracking practice:</strong> choose <strong>Rally circuit · Tracking</strong> from the map menu. Take off to start the car, then climb to 10–20 m and follow it through fast straights and hairpins. Turn with <kbd>A</kbd> / <kbd>D</kbd> and tilt with <kbd>R</kbd> / <kbd>F</kbd> to keep it in the camera frame. The panel shows the car’s lap and speed, time in frame, and your current and best tracking streak. Pause freezes the car; Reset flight restarts the lap and clears tracking statistics.</p>
          <p><strong>Formula One:</strong> choose <strong>Silverstone · Formula One</strong> for the approximate full-size Grand Prix circuit, with a moving open-wheel car. Use Map overview to learn the corners. The car travels faster than the drone, so climb for a wider view, anticipate its next pass, and turn and tilt to frame it. All maps have a 300 m simulator ceiling.</p>
          <details><summary>Starting a local server</summary><p>With Node.js 22.12 or newer installed, run these commands in the Takeoff project folder:</p><pre>npm ci\nnpm run build\nnpm start</pre><p>Open <a href="http://127.0.0.1:8080" target="_blank" rel="noopener noreferrer">127.0.0.1:8080</a>. Leave the terminal running. Future sessions only need <code>npm start</code> unless you change the app.</p></details>
        </section>
        <section id="guide-controls" role="tabpanel" aria-labelledby="guide-tab-controls" tabindex="0" hidden>
          <h3>Flight controls</h3><p>Movement follows the drone’s heading. When it faces you, its right appears to your left in the observer view. Release movement keys or center the sticks to brake into a hover. The phone table below uses the default Mode 2; follow the phone’s axis labels if you select another stick mode.</p>
          <div class="guide-table-wrap"><table class="guide-table"><thead><tr><th>Action</th><th>Keyboard</th><th>Phone · Mode 2</th></tr></thead><tbody>
            <tr><th>Climb / descend</th><td><kbd>W</kbd> / <kbd>S</kbd></td><td>Left stick up / down</td></tr>
            <tr><th>Turn left / right</th><td><kbd>A</kbd> / <kbd>D</kbd></td><td>Left stick left / right</td></tr>
            <tr><th>Forward / backward</th><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Right stick up / down</td></tr>
            <tr><th>Move left / right</th><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Right stick left / right</td></tr>
            <tr><th>Camera tilt up / down</th><td><kbd>R</kbd> / <kbd>F</kbd></td><td>Hold the Tilt buttons</td></tr>
            <tr><th>Take off / land</th><td><kbd>T</kbd> / <kbd>L</kbd></td><td>Take off / Land</td></tr>
            <tr><th>Capture photo</th><td><kbd>C</kbd></td><td>Shutter button</td></tr>
            <tr><th>Pause / resume</th><td><kbd>Space</kbd></td><td>Pause controls / Enable controls, then Resume game</td></tr>
          </tbody></table></div>
          <p>Mode 2 is the default phone layout: Throttle and Yaw on the left, Pitch and Roll on the right. Use Stick mode on the phone to practice Mode 1 (left: Pitch / Yaw; right: Throttle / Roll) or Mode 3 (left: Pitch / Roll; right: Throttle / Yaw). Changing mode pauses controls; enable them again, then tap Resume game on the phone.</p>
          <p>Keyboard flight works when focus is outside menus, sliders, and dialogs. Click the flight workspace to return focus. Select a photo thumbnail to download its 1280 × 720 PNG.</p>
          <div class="guide-tools"><span>${icon('reset')} Reset flight</span><span>${icon('play')} Start / resume</span><span>${icon('pause')} Pause</span><span>${icon('takeoff')} Take off</span><span>${icon('land')} Land</span><span>${icon('camera')} Capture photo</span><span>${icon('phone')} Pair phone</span><span>${icon('tune')} Drone parameters</span></div>
          <p>Drone parameters change speed, turn rate, acceleration, braking, and camera response. Choose a preset or tune your own settings; they are saved in this browser. The speed menu above the views adds a temporary horizontal speed cap.</p>
        </section>
        <section id="guide-connection" role="tabpanel" aria-labelledby="guide-tab-connection" tabindex="0" hidden>
          <h3>Connect a phone</h3><p>The phone becomes a two-stick controller with Mode 2 as the default. Keep both pages open; one phone controls a station at a time.</p>
          <ol class="guide-steps"><li>Open ${icon('phone')} <strong>Pair phone</strong> and choose an available connection.</li><li>Scan the QR code, or copy the complete phone link and open it in the phone browser.</li><li>Rotate the phone to landscape, choose your Stick mode, center both sticks, and tap <strong>Enable controls</strong>.</li><li>Close the pairing dialog on the laptop. Phone is selected automatically. Tap <strong>Take off</strong> on either device.</li></ol>
          <h4>Hosted wireless</h4><p>Both devices need internet access. The same Wi-Fi, different networks, or mobile data work. Choose Wireless in pairing. A hosted station offers wireless pairing; a USB cable can supply internet through tethering but does not enable direct USB controls.</p>
          <h4>Local Wi-Fi</h4><p>Put both devices on the same network. Start the local server with <code>npm run start:lan</code>, then choose a Wi-Fi address in pairing. Allow the local server through the laptop firewall. Guest networks may block connections between devices.</p>
          <h4>Local Android USB</h4><p>Install Android SDK Platform-Tools on the laptop. Enable USB debugging on the phone, connect a data cable, and accept the debugging prompt. In pairing, choose USB cable and select <strong>Connect USB phone</strong> before opening the link.</p>
          <p class="guide-note">If controls pause or the connection drops, center the sticks and tap Enable controls again. Then take off from the ground, or tap Resume game in the phone's Game paused prompt. Start practice on the laptop also resumes flight. Close open laptop dialogs and return to its page before resuming. A collision requires Reset flight. Revoke phone & renew link pairs a replacement phone. Reloading the laptop or restarting the server needs a new link.</p>
          <button id="guide-pair" class="button">${icon('phone')}<span>Open pairing</span></button>
        </section>
        <section id="guide-layout" role="tabpanel" aria-labelledby="guide-tab-layout" tabindex="0" hidden>
          <h3>Arrange your workspace</h3><p>The Observer shows the drone in the world. Camera shows the stabilized view used for your photos, always in a 16:9 frame.</p>
          <dl class="guide-layouts">${layouts.map(([name, label, description]) => `<div><dt>${icon(name)} ${label}</dt><dd>${description}</dd></div>`).join('')}</dl>
          <h4>Observer cameras</h4><p><strong>Fixed view:</strong> drag to orbit, Shift-drag or right-drag to pan, and scroll to zoom. On touch screens, drag with one finger to orbit; use two fingers to pan or pinch to zoom. The viewpoint stays where you leave it. Focus the observer and use Alt + arrow keys to pan, Alt + Shift + arrow keys to rotate, and Alt + <kbd>+</kbd> / <kbd>−</kbd> to zoom. The reset icon beside the camera menu restores the launch viewpoint.</p><p><strong>Follow drone:</strong> the observer tracks the drone. <strong>Map overview:</strong> see the map from above with north at the top. Switching back to Fixed view restores your chosen viewpoint; changing the location sets a new launch viewpoint.</p>
          <h4>Instruments and display tools</h4><div class="guide-tools"><span>${icon('equalize')} Equalize view sizes</span><span>${icon('reset')} Reset workspace</span><span>${icon('contrast')} Glass / solid instruments</span><span>${icon('collapse')} Collapse instruments</span><span>${icon('aids')} Observer aids</span><span>${icon('grid')} Thirds grid</span><span>${icon('tree')} Campus trees</span><span>${icon('quality')} Low graphics</span><span>${icon('fullscreen')} Fullscreen</span></div>
          <p>ALT is height above the local ground, SPD is horizontal speed, HDG is heading, GMB is camera tilt, and V/S is vertical speed. Layout, divider size, and instrument preferences are saved in this browser. Fullscreen keeps flight controls, Guide, and drone parameters accessible. Exit with the fullscreen button or Escape.</p>
        </section>
      </div>
    </div>
    <footer class="dialog-footer">Flight stays paused while you read. Close Guide to return to practice.</footer>
  </dialog>
  <dialog id="drone-dialog" class="station-dialog drone-dialog" aria-labelledby="drone-title">
    <header class="dialog-header"><div><span class="dialog-eyebrow">FLIGHT SETUP</span><h2 id="drone-title">Drone parameters</h2></div><button id="close-drone" class="icon-button" aria-label="Close drone parameters">×</button></header>
    <form id="drone-form">
      <div class="preset-choice"><label for="drone-preset">Drone preset</label><select id="drone-preset">${DRONE_PRESETS.map(preset => `<option value="${preset.id}">${preset.name}</option>`).join('')}<option value="custom">Custom</option></select></div>
      <p id="preset-description"></p>
      <div class="parameter-grid">${FLIGHT_PARAMETERS.map(field => `<div class="parameter-field"><label for="parameter-${field.key}">${field.label}<span id="unit-${field.key}">${field.unit}</span></label><div class="parameter-inputs"><input id="range-${field.key}" type="range" aria-label="${field.label} slider" aria-describedby="unit-${field.key} hint-${field.key}" min="${field.min}" max="${field.max}" step="${field.step}"><input id="parameter-${field.key}" name="${field.key}" type="number" aria-label="${field.label}" aria-describedby="unit-${field.key} hint-${field.key}" min="${field.min}" max="${field.max}" step="${field.step}" required></div><p id="hint-${field.key}">${field.hint}</p></div>`).join('')}</div>
      <p class="preset-note">Commercial presets use published maximum flight speeds. Turn rate, acceleration, and braking are estimates for this assisted-flight simulator. Camera settings and aircraft size use the trainer defaults. <a id="preset-source" target="_blank" rel="noopener noreferrer" hidden>Manufacturer specifications</a></p>
      <div class="drone-actions"><button id="drone-defaults" class="button quiet" type="button">Restore trainer defaults</button><button id="cancel-drone" class="button quiet" type="button">Cancel</button><button class="button primary" type="submit">Apply settings</button></div>
      <p class="drone-pause-note">Changes apply when you resume. Flight stays paused after closing.</p>
    </form>
  </dialog>`;

export function bindAssistance(root: HTMLElement, options: {
  settings: () => DroneSettings;
  pause: (reason: string) => void;
  apply: (settings: DroneSettings) => void;
  pair: () => void;
}): void {
  const el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const guide = el<HTMLDialogElement>('guide-dialog'), drone = el<HTMLDialogElement>('drone-dialog');
  el('guide').onclick = () => { options.pause('Guide open. Close it, then start practice to resume.'); guide.showModal(); };
  el('close-guide').onclick = () => guide.close();
  el('guide-pair').onclick = () => { guide.close(); options.pair(); };
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.guide-tabs [role=tab]')];
  const activate = (tab: HTMLButtonElement) => {
    tabs.forEach(item => {
      const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
      el(item.getAttribute('aria-controls')!).hidden = !selected;
    });
    el('guide-content').scrollTo(0, 0);
  };
  tabs.forEach((tab, index) => {
    tab.onclick = () => activate(tab);
    tab.onkeydown = (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[next]); tabs[next].focus();
    };
  });
  // Escape closes the topmost dialog without also leaving expanded fullscreen.
  for (const dialog of [guide, drone, el<HTMLDialogElement>('pair-dialog')]) {
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  }
  let draft = { ...options.settings().profile };
  const presetSelect = el<HTMLSelectElement>('drone-preset');
  const describe = () => {
    const preset = DRONE_PRESETS.find(item => item.id === presetSelect.value);
    el('preset-description').textContent = preset?.description ?? 'Your own flight and camera response settings.';
    const source = el<HTMLAnchorElement>('preset-source'); source.hidden = !preset?.source;
    if (preset?.source) source.href = preset.source; else source.removeAttribute('href');
  };
  const render = () => {
    for (const field of FLIGHT_PARAMETERS) {
      const value = String(Number(displayParameter(field.key, draft[field.key]).toFixed(2)));
      el<HTMLInputElement>(`parameter-${field.key}`).value = value;
      el<HTMLInputElement>(`range-${field.key}`).value = value;
    }
    presetSelect.value = presetForProfile(draft); describe();
  };
  el('drone-parameters').onclick = () => {
    options.pause('Drone parameters open. Apply or cancel, then start practice to resume.');
    draft = { ...options.settings().profile }; render(); drone.showModal();
  };
  el('close-drone').onclick = el('cancel-drone').onclick = () => drone.close();
  presetSelect.onchange = () => {
    const preset = DRONE_PRESETS.find(item => item.id === presetSelect.value);
    if (preset) { draft = { ...preset.profile }; render(); } else describe();
  };
  const readDraft = () => {
    for (const field of FLIGHT_PARAMETERS) draft[field.key] = storeParameter(field.key, el<HTMLInputElement>(`parameter-${field.key}`).valueAsNumber);
    presetSelect.value = presetForProfile(draft); describe();
  };
  for (const field of FLIGHT_PARAMETERS) {
    const range = el<HTMLInputElement>(`range-${field.key}`), number = el<HTMLInputElement>(`parameter-${field.key}`);
    range.oninput = () => { number.value = range.value; readDraft(); };
    number.oninput = () => { if (number.validity.valid) range.value = number.value; readDraft(); };
  }
  el('drone-defaults').onclick = () => { draft = { ...DRONE_PRESETS[0].profile }; render(); };
  el<HTMLFormElement>('drone-form').onsubmit = (event) => {
    event.preventDefault();
    if (!el<HTMLFormElement>('drone-form').reportValidity()) return;
    readDraft(); options.apply({ presetId: presetForProfile(draft), profile: { ...draft } }); drone.close();
  };
}
