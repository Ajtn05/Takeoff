import QRCode from 'qrcode';
import { neutralControls, type Action, type ServerMessage, type SessionInfo, type Telemetry } from '../shared/protocol';
import { KeyboardInput, RemoteInput } from './input';
import { initialState, stepFlight, takeoff, land, GENERIC_PROFILE, GROUND_HEIGHT } from './simulation';
import { TrainerSocket } from './socket';
import { TrainingWorld } from './world';
import { bindFullscreen } from './fullscreen';
import { flightObstacles, loadCampus, PRACTICE_MAP, type TrainingMap } from './maps';
import { bindWorkspace } from './workspace';
import { icon, setIconButton, type IconName } from './icons';
import { advanceCourse, PRACTICE_COURSES } from './practice';
import './workspace.css';

const iconControl = (id: string, name: IconName, label: string, attributes = '', hint = label, classes = 'button quiet icon-control') =>
  `<button id="${id}" class="${classes}" aria-label="${label}" data-tooltip="${hint}" ${attributes}>${icon(name)}</button>`;
const layoutOptions = [['split', 'Side by side', 'split'], ['stacked', 'Stacked', 'stacked'], ['camera', 'Camera only', 'camera'], ['observer', 'Observer only', 'observer'], ['classic', 'Classic', 'classic']] as const;

export async function mount(app: HTMLElement): Promise<void> {
  app.innerHTML = `
    <main class="simulator">
      <header class="topbar">
        <div class="station-brand"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 10 22 22M22 10 10 22M12 12h8v8h-8z"/><circle cx="7" cy="7" r="5"/><circle cx="25" cy="7" r="5"/><circle cx="7" cy="25" r="5"/><circle cx="25" cy="25" r="5"/></svg><h1 class="app-title">TAKEOFF</h1></div>
        <div class="toolbar">
          <div id="transport-controls" class="control-module" role="group" aria-label="Flight playback">
          ${iconControl('reset', 'reset', 'Reset flight')}
          ${iconControl('pause', 'play', 'Start practice', 'aria-pressed="false"', 'Start practice · Space', 'button primary icon-control')}
          </div>
          <div id="utility-controls" class="control-module" role="group" aria-label="Station controls">
          ${iconControl('simulator-fullscreen', 'fullscreen', 'Fullscreen', 'aria-pressed="false"')}
          ${iconControl('pair', 'phone', 'Pair phone')}
          </div>
        </div>
      </header>
      <section class="map-strip" aria-label="Practice location">
        <label class="map-choice" title="Practice location">${icon('map')}<select id="map" aria-label="Choose a map"><option value="park">Practice park</option><option value="ateneo">Ateneo de Manila · Loyola Heights</option></select></label>
        <label id="spot-control" class="map-choice" title="Practice route">${icon('pin')}<select id="photo-spot" aria-label="Choose a practice route"></select></label>
        <label class="map-choice" title="Flight speed limit">${icon('speed')}<select id="flight-speed" aria-label="Flight speed limit"><option value="5">5 m/s</option><option value="10">10 m/s</option><option value="20" selected>20 m/s</option></select></label>
        ${iconControl('map-tip', 'info', 'Location information', '', 'Choose a practice route for hoops, wall gaps, or a tight covered corridor. 240 × 240 m · 60 m ceiling')}
        <span id="map-boundary" class="sr-only">240 × 240 m · 60 m ceiling</span>
      </section>
      <section class="workspace-bar" aria-label="Workspace layout">
        <div class="layout-presets control-module" role="group" aria-label="View layout">
          ${layoutOptions.map(([layout, label, name]) => `<button class="layout-option icon-control" data-layout-option="${layout}" aria-label="${label}" data-tooltip="${label}" aria-pressed="${layout === 'split'}">${icon(name)}</button>`).join('')}
        </div>
        <select id="view-layout" class="mobile-layout" aria-label="View layout"><option value="split">Side by side</option><option value="stacked">Stacked</option><option value="camera">Camera only</option><option value="observer">Observer only</option><option value="classic">Classic</option></select>
        <div id="split-controls" class="split-controls">${iconControl('split-reset', 'equalize', 'Equalize views', '', 'Give both views equal space')}<span id="split-value" class="sr-only">62 / 38</span></div>
        <div id="flight-status" class="flight-status" role="status" tabindex="0" data-paused="true" data-mode="grounded" aria-describedby="pause-reason" data-tooltip="Take off to begin."><i class="dot"></i><span id="flight-state">Paused</span><span id="pause-reason" class="sr-only">Take off to begin.</span></div>
        ${iconControl('workspace-reset', 'reset', 'Reset workspace', '', 'Restore the default layout and instrument panel')}
      </section>
      <section id="stage" class="viewport-stage" aria-label="Flight workspace" data-layout="split" tabindex="-1">
        <div id="course-progress" class="course-progress" role="status" aria-live="polite" aria-atomic="true" hidden><div><strong id="course-name"></strong><span id="course-count"></span></div><span id="course-next"></span></div>
        <div id="observer-view" class="observer-view view"><div class="view-heading"><span>Observer</span><select id="observer-mode" aria-label="Observer camera"><option value="fixed">Fixed view</option><option value="follow">Follow drone</option><option value="overview">Map overview</option></select></div></div>
        <div id="view-divider" class="view-divider" role="separator" tabindex="0" aria-label="Resize observer and camera views" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="75" aria-valuenow="62"><span></span></div>
        <aside id="camera-column" class="camera-column"><div class="camera-title"><span>Camera</span><span class="camera-spec" title="16:9 · 64° field of view · 1280 × 720 PNG captures" tabindex="0" aria-label="Camera specifications">${icon('info')}</span></div><div id="camera-view" class="camera-view view"><div id="thirds" class="thirds"><i></i><i></i><i></i><i></i></div><div class="camera-crosshair">+</div><div class="camera-caption"><span id="framing" tabindex="0" role="img" aria-label="Subject not framed" title="Subject not framed">${icon('frame')}</span></div></div></aside>
        <section id="flight-panel" class="flight-panel is-glass" aria-label="Flight parameters">
          <header class="instrument-header"><span class="instrument-title">Flight</span><button id="panel-glass" class="instrument-button" aria-label="Transparent instrument panel" aria-pressed="true" title="Glass panel · switch to solid">${icon('contrast')}</button><button id="panel-collapse" class="instrument-button collapse-button" aria-label="Collapse flight parameters" aria-expanded="true" aria-controls="flight-panel-body" title="Collapse flight parameters">${icon('collapse')}</button></header>
          <div class="telemetry" aria-label="Flight readings"><div><span title="Altitude above the ground directly below the drone">ALT</span><strong id="altitude">0.0 <small>m</small></strong><div class="instrument-scale"><i id="altitude-scale"></i></div></div><div><span title="Horizontal ground speed">SPD</span><strong id="speed">0.0 <small>m/s</small></strong><div class="instrument-scale"><i id="speed-scale"></i></div></div><div><span title="Heading">HDG</span><strong id="heading">000 <small>°</small></strong></div><div><span title="Camera gimbal tilt">GMB</span><strong id="gimbal-value">−12 <small>°</small></strong></div></div><div id="flight-panel-body"><div class="gimbal-control"><label for="gimbal" title="Camera tilt · R / F · −90° to +20°">Tilt</label><input id="gimbal" type="range" min="-90" max="20" value="-12" aria-label="Camera gimbal angle" title="Camera tilt · R / F · −90° to +20°"></div><div class="instrument-footer"><span title="Vertical speed · positive while climbing">V/S <strong id="vertical-speed">+0.0</strong> m/s</span></div></div>
        </section>
        <section id="collision-prompt" class="collision-prompt" role="alertdialog" aria-modal="false" aria-labelledby="collision-title" aria-describedby="collision-details" hidden><div class="collision-heading">${icon('warning')}<h2 id="collision-title">Collision</h2></div><p id="collision-details"></p><button id="collision-reset" class="button">${icon('reset')}<span>Reset flight</span></button></section>
      </section>
      <section id="flight-console" class="flight-strip"><div class="flight-actions control-module" role="group" aria-label="Flight actions">${iconControl('takeoff', 'takeoff', 'Take off', 'disabled', 'Take off · T')}${iconControl('land', 'land', 'Land', 'disabled', 'Land · L')}<span class="action-divider"></span>${iconControl('capture', 'camera', 'Capture photo', 'disabled', 'Capture photo · C', 'button shutter icon-control')}</div><div class="view-options control-module" role="group" aria-label="Display options">${iconControl('aids', 'aids', 'Observer aids', 'aria-pressed="true"')}${iconControl('grid', 'grid', 'Thirds grid', 'aria-pressed="true"')}${iconControl('trees', 'tree', 'Campus trees', 'aria-pressed="true" hidden', 'Show or hide campus trees')}${iconControl('quality', 'quality', 'Low graphics', 'aria-pressed="false"')}</div><label class="source-control control-module"><span class="sr-only">Controls</span><select id="source" aria-label="Control source"><option value="keyboard">Keyboard</option><option value="phone">Phone · Mode 2</option></select></label></section>
      <section class="photo-library" aria-label="Photo gallery"><span class="section-label">Photos <span id="photo-count">0</span></span><div id="photos"><span class="empty-photos">No photos.</span></div></section>
      <p id="map-credit" class="map-credit" hidden>1:1 meter scale · 30 m elevation data, smoothed · building details and satellite tree placement estimated. Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · <a href="/data/ateneo-campus.json" download>Campus data (ODbL)</a> · elevation courtesy of USGS via <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener noreferrer">Mapzen/AWS</a> · <a href="/data/ateneo-elevation.json" download>Elevation data</a> · <a href="https://commons.wikimedia.org/wiki/Category:Buildings_of_Ateneo_de_Manila_University" target="_blank" rel="noopener noreferrer">Building photo references</a></p>
      <footer><span id="connection-status"><i class="dot"></i> Starting session…</span><span id="performance">60 Hz simulation</span></footer>
      <div id="toast" class="toast" role="status"></div>
      <dialog id="pair-dialog"><div class="dialog-header"><div><h2>Pair phone</h2></div><button id="close-pair" class="icon-button" aria-label="Close pairing">×</button></div><p>One phone controls this station. Keep this laptop page open.</p><label class="connection-choice">Connection <select id="connection-path" aria-label="Connection path" disabled></select></label><div id="usb-setup" class="usb-setup" hidden><button id="connect-usb" class="button primary">Connect USB phone</button><p id="usb-status" role="status">Connect a data cable and allow USB debugging on your phone.</p></div><div class="qr-wrap"><canvas id="qr" aria-label="Phone pairing QR code" hidden></canvas></div><label class="url-label">Open on phone<input id="pair-url" readonly aria-label="Controller pairing URL"></label><button id="copy-pair-url" class="button quiet" disabled>Copy phone link</button><p id="pair-instructions" class="pair-instructions"></p><div class="pair-actions"><button id="revoke" class="button danger">Revoke phone & renew link</button><span id="pair-state">Waiting for a phone</span></div></dialog>
    </main>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('pair-dialog');
  const setMapTip = (tip: string) => {
    const hint = `${tip} ${el('map-boundary').textContent}`;
    el('map-tip').dataset.tooltip = hint; el('map-tip').setAttribute('aria-description', hint);
  };
  const workspace = bindWorkspace(document.querySelector<HTMLElement>('.simulator')!);
  const world = new TrainingWorld(el('stage'), el('observer-view'), el('camera-view'));
  let activeMap: TrainingMap = PRACTICE_MAP, spot = activeMap.spots[0], loadingMap = false;
  let treesVisible = true;
  try { treesVisible = localStorage.getItem('trainer-trees-visible') !== 'false'; } catch { /* Storage may be unavailable. */ }
  world.setTreesVisible(treesVisible);
  let obstacles = flightObstacles(activeMap, treesVisible);
  const profile = { ...GENERIC_PROFILE };
  let state = initialState(), paused = true, reason = 'Take off to begin.';
  let course = PRACTICE_COURSES.find(route => route.id === spot.courseId), nextGate = 0;
  const updateCourse = () => {
    const panel = el('course-progress'); panel.hidden = !course;
    panel.dataset.complete = String(Boolean(course && nextGate === course.gates.length));
    if (!course) return;
    el('course-name').textContent = course.name;
    el('course-count').textContent = `${nextGate} / ${course.gates.length}`;
    const gate = course.gates[nextGate];
    el('course-next').textContent = gate
      ? `Next: ${String(nextGate + 1).padStart(2, '0')} · ${(gate.center[1] - GROUND_HEIGHT).toFixed(1)} m AGL · ${gate.width.toFixed(1)} m opening`
      : 'Course complete · Reset to fly again';
    world.setCourseProgress(nextGate);
  };
  let source: 'keyboard' | 'phone' = 'keyboard', connectedPhone = false;
  let socket: TrainerSocket | undefined, session: SessionInfo | undefined;
  let captures = 0, receiptToFrameMs = 0, renderedSequence = -1;
  let toastTimer: ReturnType<typeof setTimeout>;
  const remote = new RemoteInput();
  const toast = (message: string) => { el('toast').textContent = message; el('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').classList.remove('visible'), 3500); };
  bindFullscreen(el<HTMLButtonElement>('simulator-fullscreen'), document.querySelector<HTMLElement>('.simulator')!, {
    onError: toast, expandWithinPage: true,
    onChange: (active, expanded) => {
      workspace.setFullscreen(active);
      setIconButton(el<HTMLButtonElement>('simulator-fullscreen'), active ? 'minimize' : 'fullscreen', active ? expanded ? 'Exit expanded view' : 'Exit fullscreen' : 'Fullscreen');
    },
  });
  const pause = (message: string, notify = true) => {
    paused = true; reason = message; keyboard.clear();
    if (notify && remote.ready) { remote.ready = false; socket?.send({ type: 'suspend', reason: message }); }
  };
  const startBlock = (): string | undefined => {
    if (loadingMap) return 'Wait for the location to finish loading.';
    if (document.hidden) return 'Return to the laptop page before starting.';
    if (dialog.open) return 'Close pairing on the laptop before starting.';
    if (state.mode === 'collided') return 'Reset the flight after a collision.';
    if (source === 'phone' && (!connectedPhone || !remote.fresh(performance.now()))) return 'Pair a phone and enable its controls before starting.';
  };
  const start = () => {
    const blocked = startBlock();
    if (blocked) return { ok: false, message: blocked };
    keyboard.clear(); paused = false; reason = 'Practice in progress.';
    return { ok: true, message: reason };
  };
  const photos: string[] = [];
  const perform = async (action: Action): Promise<{ ok: boolean; message: string }> => {
    if (action === 'takeoff' && state.mode === 'grounded' && paused) {
      const result = start();
      if (!result.ok) return result;
    }
    if (paused || state.mode === 'collided') return { ok: false, message: 'Start practice on the laptop first.' };
    if (action === 'takeoff') return { ok: takeoff(state), message: state.mode === 'taking-off' ? 'Taking off to 3 m.' : 'Takeoff is available on the ground.' };
    if (action === 'land') return { ok: land(state), message: state.mode === 'landing' ? 'Landing at the current position.' : 'Finish takeoff before landing.' };
    try {
      const blob = await world.capture(), url = URL.createObjectURL(blob);
      if (!captures) el('photos').replaceChildren();
      captures++;
      const link = document.createElement('a'); link.href = url; link.download = `flight-school-${String(captures).padStart(3, '0')}.png`;
      link.title = `Download photo ${captures}`; link.className = 'photo-thumb';
      const image = document.createElement('img'); image.src = url; image.alt = `Drone camera photo ${captures}`; link.append(image);
      el('photos').prepend(link); photos.push(url);
      if (photos.length > 6) { URL.revokeObjectURL(photos.shift()!); el('photos').lastElementChild?.remove(); }
      el('photo-count').textContent = String(captures); el('camera-view').classList.add('flash'); setTimeout(() => el('camera-view').classList.remove('flash'), 180);
      return { ok: true, message: `Photo ${captures} saved. Download it from the laptop gallery.` };
    } catch { return { ok: false, message: 'Photo could not be captured. Try again.' }; }
  };
  const togglePause = () => {
    if (!paused) { pause('Practice paused. Center the sticks before resuming.'); return; }
    const result = start(); if (!result.ok) toast(result.message);
  };
  const keyboard = new KeyboardInput((action) => {
    if (action === 'pause') togglePause(); else if (source === 'keyboard') void perform(action).then((result) => toast(result.message));
  });
  const localAction = (action: Action) => void perform(action).then((result) => toast(result.message));
  el('pause').onclick = togglePause;
  el('takeoff').onclick = () => localAction('takeoff'); el('land').onclick = () => localAction('land'); el('capture').onclick = () => localAction('capture');
  const resetFlight = (message: string) => {
    const collided = state.mode === 'collided';
    pause(message); state = initialState(spot.pad, spot.heading, activeMap.ground); world.resetTrail();
    nextGate = 0; updateCourse();
    el('collision-prompt').hidden = true;
    if (collided) el('stage').focus({ preventScroll: true });
  };
  const reset = () => resetFlight(source === 'phone' ? 'Flight reset. Enable phone controls to take off.' : 'Flight reset. Take off when ready.');
  el('reset').onclick = el('collision-reset').onclick = reset;
  el<HTMLSelectElement>('source').onchange = (event) => { pause('Control source changed. Start practice to resume.'); source = (event.target as HTMLSelectElement).value as typeof source; };
  el<HTMLSelectElement>('observer-mode').onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value; world.follow = value === 'follow'; world.overview = value === 'overview';
    el('stage').classList.toggle('map-overview', world.overview);
  };
  for (const [id, change] of [
    ['aids', (active: boolean) => world.aids = active],
    ['grid', (active: boolean) => el('thirds').hidden = !active],
    ['quality', (active: boolean) => world.setQuality(active)],
  ] as const) {
    el(id).onclick = () => { const active = el(id).getAttribute('aria-pressed') !== 'true'; el(id).setAttribute('aria-pressed', String(active)); change(active); };
  }
  el('trees').setAttribute('aria-pressed', String(treesVisible));
  el('trees').onclick = () => {
    treesVisible = !treesVisible; world.setTreesVisible(treesVisible);
    obstacles = flightObstacles(activeMap, treesVisible);
    el('trees').setAttribute('aria-pressed', String(treesVisible));
    try { localStorage.setItem('trainer-trees-visible', String(treesVisible)); } catch { /* Keep the preference for this session. */ }
  };
  el<HTMLSelectElement>('flight-speed').onchange = (event) => { profile.speed = Number((event.target as HTMLSelectElement).value); };
  el<HTMLInputElement>('gimbal').oninput = (event) => { if (source === 'keyboard') state.gimbal = Number((event.target as HTMLInputElement).value); };
  const applyMap = () => {
    course = PRACTICE_COURSES.find(route => route.id === spot.courseId);
    world.setMap(activeMap, spot); resetFlight('Location changed. Take off when ready.');
    obstacles = flightObstacles(activeMap, treesVisible);
    el('trees').hidden = activeMap.id !== 'ateneo';
    el('map-credit').hidden = activeMap.id !== 'ateneo';
    el('map-boundary').textContent = activeMap.id === 'ateneo' ? 'Loyola Heights campus · 80 m ceiling' : '240 × 240 m · 60 m ceiling';
    setMapTip(spot.tip);
    world.follow = activeMap.id === 'ateneo' || Boolean(course); world.overview = false;
    el('stage').classList.remove('map-overview');
    el<HTMLSelectElement>('observer-mode').value = world.follow ? 'follow' : 'fixed';
    populateSpots();
  };
  const populateSpots = () => {
    const select = el<HTMLSelectElement>('photo-spot'); select.replaceChildren();
    activeMap.spots.forEach(site => { const option = document.createElement('option'); option.value = site.id; option.textContent = site.name; select.append(option); });
    select.value = spot.id;
    select.setAttribute('aria-label', activeMap.id === 'park' ? 'Choose a practice route' : 'Choose a photo spot');
    el('spot-control').title = activeMap.id === 'park' ? 'Practice route' : 'Launch location';
  };
  populateSpots(); setMapTip(spot.tip); updateCourse();
  el<HTMLSelectElement>('map').onchange = async (event) => {
    const select = event.target as HTMLSelectElement; const previous = activeMap;
    loadingMap = true; select.disabled = true; el<HTMLSelectElement>('photo-spot').disabled = true;
    pause('Loading practice location…'); setMapTip('Loading campus geometry…');
    try { activeMap = select.value === 'ateneo' ? await loadCampus() : PRACTICE_MAP; spot = activeMap.spots[0]; applyMap(); }
    catch (error) { activeMap = previous; select.value = previous.id; setMapTip(spot.tip); pause('Map could not be loaded. Start practice to resume.'); toast(error instanceof Error ? error.message : 'Map could not be loaded.'); }
    finally { loadingMap = false; select.disabled = false; el<HTMLSelectElement>('photo-spot').disabled = false; }
  };
  el<HTMLSelectElement>('photo-spot').onchange = (event) => {
    spot = activeMap.spots.find((site) => site.id === (event.target as HTMLSelectElement).value)!; applyMap();
  };
  window.addEventListener('blur', () => { if (source === 'keyboard') pause('Laptop lost focus. Start practice to resume.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('Laptop page hidden. Start practice to resume.'); });
  window.addEventListener('pagehide', () => pause('Simulator page closed.'));
  window.addEventListener('trainer-context-lost', () => pause('Graphics context lost. Reload the simulator.'));
  const showPair = () => { pause('Pair your phone and enable controls to take off.'); dialog.showModal(); void updatePair(); };
  el('pair').onclick = showPair; el('close-pair').onclick = () => dialog.close();
  const path = el<HTMLSelectElement>('connection-path');
  const updatePair = async () => {
    if (!session) return;
    const url = path.value === 'wireless' ? session.publicUrl : path.value === 'usb' ? session.usbUrl : session.lanUrls[Number(path.value)];
    if (!url) return;
    el<HTMLInputElement>('pair-url').value = url;
    el('usb-setup').hidden = path.value !== 'usb';
    await QRCode.toCanvas(el<HTMLCanvasElement>('qr'), url, { width: 208, margin: 2, color: { dark: '#152c31', light: '#ffffff' } });
    el('qr').hidden = false;
    el<HTMLButtonElement>('copy-pair-url').disabled = false;
    el('pair-instructions').textContent = path.value === 'wireless'
      ? 'Scan the code with your phone camera, open the link, rotate to landscape, and tap Enable controls. Both devices need internet access; Wi-Fi or mobile data works. No phone app or laptop installation is needed. Close this dialog before taking off. Share this link only with the person controlling your flight.'
      : path.value === 'usb' ? 'Click Connect USB phone before scanning the code. Both the pairing page and controls travel through the cable. A connection-refused error on the phone usually means USB forwarding is missing or the trainer has stopped.' : 'Connect both devices to the same network. Scan this code. Allow the server through the Mac firewall if prompted. Keep the phone awake manually on HTTP Wi-Fi.';
  };
  el('copy-pair-url').onclick = async () => {
    const input = el<HTMLInputElement>('pair-url');
    try { await navigator.clipboard.writeText(input.value); toast('Phone link copied.'); }
    catch { input.focus(); input.select(); toast('Select and copy the phone link.'); }
  };
  el('connect-usb').onclick = async () => {
    if (!session) return;
    const button = el<HTMLButtonElement>('connect-usb'); button.disabled = true;
    el('usb-status').textContent = 'Checking the USB phone and setting up the cable connection…';
    try {
      const response = await fetch('/api/usb', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.hostToken}` }, body: JSON.stringify({ sessionId: session.sessionId }) });
      const result = await response.json() as { message?: string; error?: string };
      el('usb-status').textContent = result.message ?? result.error ?? 'USB setup failed. Try again.';
    } catch { el('usb-status').textContent = 'Trainer unavailable. Restart it on the Mac and reload this page.'; }
    finally { button.disabled = false; }
  };
  path.onchange = () => void updatePair();
  const onMessage = (message: ServerMessage) => {
    if (message.type === 'connection') {
      const newlyPaired = message.connected && !connectedPhone; connectedPhone = message.connected;
      remote.reset(message.generation, message.ready);
      if (newlyPaired) { source = 'phone'; el<HTMLSelectElement>('source').value = source; }
      if (source === 'phone' || newlyPaired) pause(message.reason, false);
      el<HTMLButtonElement>('pause').disabled = paused && source === 'phone';
      el('connection-status').textContent = message.connected ? message.ready ? 'Phone controls ready' : 'Phone paired' : 'Keyboard · ready';
      el('pair-state').textContent = message.connected ? message.ready ? 'Phone ready' : 'Phone paired' : 'Waiting for a phone';
    }
    if (message.type === 'input' && remote.accept(message.generation, message.seq, message.controls, performance.now())) {
      if (paused && source === 'phone') el<HTMLButtonElement>('pause').disabled = false;
    }
    if (message.type === 'action') {
      if (message.generation !== remote.generation) return;
      if (source !== 'phone' || !remote.fresh(performance.now())) { socket?.send({ type: 'ack', generation: message.generation, id: message.id, ok: false, message: 'Phone control is paused.' }); return; }
      void perform(message.action).then((result) => { toast(result.message); socket?.send({ type: 'ack', generation: message.generation, id: message.id, ...result }); });
    }
  };
  const newSession = async () => {
    socket?.send({ type: 'revoke' }); socket?.close(); socket = undefined;
    session = undefined; connectedPhone = false; remote.reset(-1);
    path.replaceChildren(); path.disabled = true;
    el('qr').hidden = true; el('usb-setup').hidden = true;
    el<HTMLInputElement>('pair-url').value = '';
    el<HTMLButtonElement>('copy-pair-url').disabled = true;
    const response = await fetch('/api/session', { method: 'POST' });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      throw new Error(result.error ?? 'Phone pairing is unavailable. Try again.');
    }
    session = await response.json() as SessionInfo;
    if (session.publicUrl) path.add(new Option('Wireless · Wi-Fi or mobile data', 'wireless'));
    if (session.usbUrl) path.add(new Option('USB cable · no Wi-Fi', 'usb'));
    session.lanUrls.forEach((url, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `Wi-Fi · ${new URL(url).hostname}`; path.append(option); });
    path.disabled = false;
    el('revoke').textContent = 'Revoke phone & renew link';
    socket = new TrainerSocket({ role: 'host', sessionId: session.sessionId, token: session.hostToken }, onMessage, (message) => {
      remote.reset(-1); pause(message, false); el('connection-status').textContent = message;
    });
    await updatePair();
  };
  const pairingError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Phone pairing is unavailable. Try again.';
    el('pair-state').textContent = 'Pairing unavailable'; el('pair-instructions').textContent = message;
    el('connection-status').textContent = 'Keyboard · phone pairing unavailable';
    el('revoke').textContent = 'Retry pairing';
    toast(message);
  };
  el('revoke').onclick = async () => {
    const button = el<HTMLButtonElement>('revoke'); button.disabled = true;
    pause('Phone revoked. Pair again with the new code.');
    try { await newSession(); } catch (error) { pairingError(error); }
    finally { button.disabled = false; }
  };
  try { await newSession(); } catch (error) { pairingError(error); }
  let previous = performance.now(), accumulator = 0, lastStatus = 0, frames = 0, fps = 0, fpsAt = previous;
  const altitude = () => Math.max(0, state.y - activeMap.ground(state.x, state.z) - GROUND_HEIGHT);
  const telemetry = (): Telemetry => ({ altitude: altitude(), heading: state.heading * 180 / Math.PI, speed: Math.hypot(state.vx, state.vz),
    gimbal: state.gimbal, mode: state.mode, paused, reason, captures, receiptToFrameMs, lastInputSeq: remote.sequence });
  const frame = (now: number) => {
    const elapsed = now - previous; previous = now;
    if (elapsed > 250 && !paused) pause('Display stalled. Start practice to resume.');
    if (!paused && source === 'phone' && !remote.fresh(now)) pause('Controller input expired. Enable controls again.');
    // Keep world meters per second consistent through slower frames; long stalls pause above.
    accumulator = paused ? 0 : Math.min(accumulator + elapsed / 1000, 0.25);
    while (accumulator >= 1 / 60) {
      const before = { x: state.x, y: state.y, z: state.z }, wasFlying = state.mode === 'flying';
      stepFlight(state, source === 'phone' ? remote.controls : keyboard.read(), 1 / 60, profile, obstacles, activeMap.bounds, activeMap.ground); accumulator -= 1 / 60;
      if (state.mode === 'collided') {
        pause(`Collision with ${state.collision}. Reset the flight to try again.`);
        el('collision-details').textContent = `Hit ${state.collision}. Reset to the launch point.`;
        el('collision-prompt').hidden = false;
        el('collision-reset').focus({ preventScroll: true });
        break;
      }
      if (course && wasFlying && state.mode === 'flying') {
        const advanced = advanceCourse(course, nextGate, before, state);
        if (advanced !== nextGate) { nextGate = advanced; updateCourse(); }
      }
    }
    world.update(state, paused ? 0 : now); world.render();
    if (remote.sequence !== renderedSequence && remote.receivedAt > 0) { receiptToFrameMs = Math.max(0, performance.now() - remote.receivedAt); renderedSequence = remote.sequence; }
    frames++; if (now - fpsAt >= 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
    if (now - lastStatus > 100) {
      lastStatus = now; const status = telemetry(); socket?.send({ type: 'status', status });
      el('altitude').innerHTML = `${status.altitude.toFixed(1)} <small>m</small>`;
      el('speed').innerHTML = `${status.speed.toFixed(1)} <small>m/s</small>`;
      el('heading').innerHTML = `${Math.round(status.heading).toString().padStart(3, '0')} <small>°</small>`;
      el('gimbal-value').innerHTML = `${Math.round(status.gimbal)} <small>°</small>`;
      el('heading').title = ['North', 'North east', 'East', 'South east', 'South', 'South west', 'West', 'North west'][Math.round(status.heading / 45) % 8];
      el('altitude-scale').style.width = `${Math.min(100, status.altitude / activeMap.bounds.ceiling * 100)}%`;
      el('speed-scale').style.width = `${Math.min(100, status.speed / profile.speed * 100)}%`;
      el('vertical-speed').textContent = `${state.vy >= 0 ? '+' : ''}${state.vy.toFixed(1)}`;
      el<HTMLInputElement>('gimbal').value = String(state.gimbal); el<HTMLInputElement>('gimbal').disabled = source === 'phone';
      setIconButton(el<HTMLButtonElement>('pause'), paused ? 'play' : 'pause', paused ? 'Start practice' : 'Pause practice', `${paused ? 'Start practice' : 'Pause practice'} · Space`);
      el('pause').setAttribute('aria-pressed', String(!paused));
      const blocked = Boolean(startBlock());
      el<HTMLButtonElement>('pause').disabled = paused && blocked;
      const flightLabel = state.mode === 'collided' ? 'Collision' : paused ? 'Paused' : ({ grounded: 'Grounded', 'taking-off': 'Taking off', flying: 'Flying', landing: 'Landing' })[state.mode];
      const statusBadge = el('flight-status');
      statusBadge.dataset.paused = String(paused); statusBadge.dataset.mode = state.mode;
      statusBadge.dataset.tooltip = `${flightLabel} · ${reason}`;
      if (el('flight-state').textContent !== flightLabel) el('flight-state').textContent = flightLabel;
      if (el('pause-reason').textContent !== reason) el('pause-reason').textContent = reason;
      el<HTMLButtonElement>('takeoff').disabled = state.mode !== 'grounded' || blocked;
      el<HTMLButtonElement>('land').disabled = paused || state.mode !== 'flying';
      el<HTMLButtonElement>('capture').disabled = paused || state.mode === 'collided';
      const framed = world.subjectInFrame();
      el('framing').title = framed ? 'Subject in frame' : 'Subject not framed'; el('framing').setAttribute('aria-label', el('framing').title);
      el('framing').classList.toggle('framed', framed);
      el('performance').textContent = `${fps} FPS · 60 Hz simulation${source === 'phone' ? ` · receipt → frame ${Math.round(receiptToFrameMs)} ms` : ''}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
