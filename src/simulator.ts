import QRCode from 'qrcode';
import { neutralControls, type Action, type ServerMessage, type SessionInfo, type Telemetry } from '../shared/protocol';
import { KeyboardInput, RemoteInput } from './input';
import { initialState, stepFlight, takeoff, land, PAD } from './simulation';
import { TrainerSocket } from './socket';
import { TrainingWorld } from './world';
import { bindFullscreen } from './fullscreen';

const lessons = [
  { title: 'Takeoff and hover', prompt: 'Take off, climb to 4 m, then release both sticks. Hold a steady hover for two seconds.', hint: 'Centered sticks brake the drone into a hover.', short: 'Hover', number: '01' },
  { title: 'Translation', prompt: 'Fly through the amber marker, 8 m to the right of the pad. Maintain the starting heading.', hint: 'Use the right stick to translate. Leave the left stick centered.', short: 'Translate', number: '02' },
  { title: 'Heading and orientation', prompt: 'Turn to 180°. Move sideways and compare stick direction with movement in the fixed observer view.', hint: 'Movement follows the drone’s heading.', short: 'Orientation', number: '03' },
  { title: 'Photo composition', prompt: 'Point the camera at the orange sculpture. Adjust the gimbal, frame the subject, and capture a photo.', hint: 'Gimbal tilt is independent of the drone’s banking.', short: 'Composition', number: '04' },
  { title: 'Sideways reveal', prompt: 'Move slowly sideways while keeping the sculpture in view. Turn gradually to follow the subject.', hint: 'Use small stick movements and watch the camera view.', short: 'Reveal', number: '05' },
  { title: 'Return and land', prompt: 'Return to the landing pad, center the sticks, and land.', hint: 'Landing descends at the current position. Align with the pad first.', short: 'Land', number: '06' },
];

export async function mount(app: HTMLElement): Promise<void> {
  app.innerHTML = `
    <main class="simulator">
      <header class="topbar">
        <h1 class="app-title">Drone simulator</h1>
        <span class="session-label">Practice park · Mode 2</span>
        <div class="toolbar">
          <button id="reset" class="button quiet">Reset</button>
          <button id="pause" class="button primary">Start practice</button>
          <button id="simulator-fullscreen" class="button quiet" aria-pressed="false">Fullscreen</button>
          <button id="pair" class="button quiet">Pair phone</button>
        </div>
      </header>
      <section id="stage" class="viewport-stage">
        <div id="observer-view" class="observer-view view"><div class="view-heading"><span>Observer</span><select id="observer-mode" aria-label="Observer camera"><option value="fixed">Fixed view</option><option value="follow">Follow drone</option></select></div><div class="view-bottom"><span id="flight-state">ON THE PAD</span><span>80 × 80 m practice boundary</span></div><div id="pause-overlay" class="pause-overlay"><strong id="pause-title">Paused</strong><span id="pause-reason">Start practice, then take off.</span></div></div>
        <aside class="camera-column"><div class="camera-title"><span>Drone camera</span><span class="camera-spec">16:9 · 64° FOV</span></div><div id="camera-view" class="camera-view view"><div id="thirds" class="thirds"><i></i><i></i><i></i><i></i></div><div class="camera-crosshair">+</div><div class="camera-caption"><span id="framing">Subject not framed</span></div></div><div class="camera-tools"><label><input id="grid" type="checkbox" checked> Thirds grid</label><button id="capture" class="button shutter" disabled>Capture photo <kbd>C</kbd></button></div><div class="telemetry"><div><span>Altitude</span><strong id="altitude">0.0 <small>m</small></strong></div><div><span>Ground speed</span><strong id="speed">0.0 <small>m/s</small></strong></div><div><span>Heading</span><strong id="heading">000 <small>°</small></strong></div><div><span>Gimbal tilt</span><strong id="gimbal-value">−12 <small>°</small></strong></div></div><div class="gimbal-control"><label for="gimbal">Camera tilt <span>−90° to +20°</span></label><input id="gimbal" type="range" min="-90" max="20" value="-12" aria-label="Camera gimbal angle"></div></aside>
      </section>
      <section class="flight-strip"><div class="flight-actions"><button id="takeoff" class="button" disabled>Take off <kbd>T</kbd></button><button id="land" class="button" disabled>Land <kbd>L</kbd></button></div><div class="view-options"><label><input id="aids" type="checkbox" checked> Observer aids</label><label><input id="camera-only" type="checkbox"> Camera only</label><label><input id="quality" type="checkbox"> Low graphics</label></div><label class="source-control">Controls <select id="source" aria-label="Control source"><option value="keyboard">Keyboard</option><option value="phone">Phone · Mode 2</option></select></label></section>
      <section class="lesson-card"><div class="lesson-content"><span id="lesson-number" class="lesson-number">Lesson 01</span><h2 id="lesson-title"></h2><p id="lesson-prompt"></p><span id="lesson-feedback" class="lesson-feedback"></span></div><select id="lesson" aria-label="Choose a lesson">${lessons.map((lesson, i) => `<option value="${i}">${lesson.number} · ${lesson.short}</option>`).join('')}</select></section>
      <section class="lower-row"><div class="keyboard-help"><span class="section-label">Keyboard controls · Mode 2</span><div><span><kbd>W</kbd><kbd>S</kbd> Climb / descend</span><span><kbd>A</kbd><kbd>D</kbd> Turn</span><span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> Move</span><span><kbd>R</kbd><kbd>F</kbd> Tilt camera</span><span><kbd>Space</kbd> Pause</span></div></div><div class="photo-library"><span class="section-label">Photos <span id="photo-count">0</span></span><div id="photos"><span class="empty-photos">No photos.</span></div></div></section>
      <footer><span id="connection-status"><i class="dot"></i> Starting local session…</span><span id="performance">60 Hz simulation</span></footer>
      <div id="toast" class="toast" role="status"></div>
      <dialog id="pair-dialog"><div class="dialog-header"><div><h2>Pair phone</h2></div><button id="close-pair" class="icon-button" aria-label="Close pairing">×</button></div><p>One phone controls this station. Keep this laptop page open.</p><label class="connection-choice">Connection <select id="connection-path" aria-label="Connection path"><option value="usb">USB cable · no Wi-Fi</option></select></label><div id="usb-setup" class="usb-setup"><button id="connect-usb" class="button primary">Connect USB phone</button><p id="usb-status" role="status">Connect a data cable and allow USB debugging on your phone.</p></div><div class="qr-wrap"><canvas id="qr" aria-label="Phone pairing QR code"></canvas></div><label class="url-label">Open on phone<input id="pair-url" readonly aria-label="Controller pairing URL"></label><p id="pair-instructions" class="pair-instructions"></p><div class="pair-actions"><button id="revoke" class="button danger">Revoke phone & renew link</button><span id="pair-state">Waiting for a phone</span></div></dialog>
    </main>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const world = new TrainingWorld(el('stage'), el('observer-view'), el('camera-view'));
  let state = initialState(), paused = true, reason = 'Start practice, then take off.';
  let source: 'keyboard' | 'phone' = 'keyboard', connectedPhone = false;
  let socket: TrainerSocket | undefined, session: SessionInfo | undefined;
  let captures = 0, lessonIndex = 0, hoverTime = 0, framedCapture = false, receiptToFrameMs = 0, renderedSequence = -1;
  let toastTimer: ReturnType<typeof setTimeout>;
  const remote = new RemoteInput();
  const toast = (message: string) => { el('toast').textContent = message; el('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').classList.remove('visible'), 3500); };
  bindFullscreen(el<HTMLButtonElement>('simulator-fullscreen'), document.querySelector<HTMLElement>('.simulator')!, { onError: toast, expandWithinPage: true });
  const pause = (message: string, notify = true) => {
    paused = true; reason = message; keyboard.clear();
    if (notify && remote.ready) { remote.ready = false; socket?.send({ type: 'suspend', reason: message }); }
  };
  const photos: string[] = [];
  const perform = async (action: Action): Promise<{ ok: boolean; message: string }> => {
    if (paused || state.mode === 'collided') return { ok: false, message: 'Start practice on the laptop first.' };
    if (action === 'takeoff') return { ok: takeoff(state), message: state.mode === 'taking-off' ? 'Taking off to 3 m.' : 'Takeoff is available on the ground.' };
    if (action === 'land') return { ok: land(state), message: state.mode === 'landing' ? 'Landing at the current position.' : 'Finish takeoff before landing.' };
    try {
      const inFrame = world.subjectInFrame();
      const blob = await world.capture(), url = URL.createObjectURL(blob);
      if (!captures) el('photos').replaceChildren();
      captures++; framedCapture ||= inFrame;
      const link = document.createElement('a'); link.href = url; link.download = `flight-school-${String(captures).padStart(3, '0')}.png`;
      link.title = `Download photo ${captures}`; link.className = 'photo-thumb';
      const image = document.createElement('img'); image.src = url; image.alt = `Drone camera photo ${captures}`; link.append(image);
      el('photos').prepend(link); photos.push(url);
      if (photos.length > 6) { URL.revokeObjectURL(photos.shift()!); el('photos').lastElementChild?.remove(); }
      el('photo-count').textContent = String(captures); el('camera-view').classList.add('flash'); setTimeout(() => el('camera-view').classList.remove('flash'), 180);
      return { ok: true, message: `Photo ${captures} saved. Download it from the laptop gallery.` };
    } catch { return { ok: false, message: 'Photo could not be captured. Try again.' }; }
  };
  const start = () => {
    if (state.mode === 'collided') { toast('Reset the flight after a collision.'); return; }
    if (source === 'phone' && (!connectedPhone || !remote.fresh(performance.now()))) { toast('Pair a phone and enable its controls before starting.'); return; }
    keyboard.clear(); paused = false; reason = 'Practice in progress.';
  };
  const togglePause = () => paused ? start() : pause('Practice paused. Center the sticks before resuming.');
  const keyboard = new KeyboardInput((action) => {
    if (action === 'pause') togglePause(); else if (source === 'keyboard') void perform(action).then((result) => toast(result.message));
  });
  const localAction = (action: Action) => void perform(action).then((result) => toast(result.message));
  el('pause').onclick = togglePause;
  el('takeoff').onclick = () => localAction('takeoff'); el('land').onclick = () => localAction('land'); el('capture').onclick = () => localAction('capture');
  el('reset').onclick = () => { pause('Flight reset. Start practice to resume.'); state = initialState(); hoverTime = 0; framedCapture = false; world.resetTrail(); };
  el<HTMLSelectElement>('source').onchange = (event) => { pause('Control source changed. Start practice to resume.'); source = (event.target as HTMLSelectElement).value as typeof source; };
  el<HTMLSelectElement>('observer-mode').onchange = (event) => world.follow = (event.target as HTMLSelectElement).value === 'follow';
  el<HTMLInputElement>('aids').onchange = (event) => world.aids = (event.target as HTMLInputElement).checked;
  el<HTMLInputElement>('grid').onchange = (event) => el('thirds').hidden = !(event.target as HTMLInputElement).checked;
  el<HTMLInputElement>('camera-only').onchange = (event) => el('stage').classList.toggle('camera-only', (event.target as HTMLInputElement).checked);
  el<HTMLInputElement>('quality').onchange = (event) => world.setQuality((event.target as HTMLInputElement).checked);
  el<HTMLInputElement>('gimbal').oninput = (event) => { if (source === 'keyboard') state.gimbal = Number((event.target as HTMLInputElement).value); };
  const chooseLesson = () => {
    const lesson = lessons[lessonIndex]; el('lesson-number').textContent = `Lesson ${lesson.number}`;
    el('lesson-title').textContent = lesson.title; el('lesson-prompt').textContent = lesson.prompt;
    hoverTime = 0;
  };
  el<HTMLSelectElement>('lesson').onchange = (event) => { lessonIndex = Number((event.target as HTMLSelectElement).value); chooseLesson(); }; chooseLesson();
  window.addEventListener('blur', () => { if (source === 'keyboard') pause('Laptop lost focus. Start practice to resume.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('Laptop page hidden. Start practice to resume.'); });
  window.addEventListener('pagehide', () => pause('Simulator page closed.'));
  window.addEventListener('trainer-context-lost', () => pause('Graphics context lost. Reload the simulator.'));
  const dialog = el<HTMLDialogElement>('pair-dialog');
  const showPair = () => { pause('Pair your phone, then start practice.'); dialog.showModal(); void updatePair(); };
  el('pair').onclick = showPair; el('close-pair').onclick = () => dialog.close();
  const path = el<HTMLSelectElement>('connection-path');
  const updatePair = async () => {
    if (!session) return;
    const url = path.value === 'usb' ? session.usbUrl : session.lanUrls[Number(path.value)];
    el<HTMLInputElement>('pair-url').value = url;
    el('usb-setup').hidden = path.value !== 'usb';
    await QRCode.toCanvas(el<HTMLCanvasElement>('qr'), url, { width: 208, margin: 2, color: { dark: '#152c31', light: '#ffffff' } });
    el('pair-instructions').textContent = path.value === 'usb' ? 'Click Connect USB phone before scanning the code. Both the pairing page and controls travel through the cable. A connection-refused error on the phone usually means USB forwarding is missing or the trainer has stopped.' : 'Connect both devices to the same network. Scan this code. Allow the server through the Mac firewall if prompted. Keep the phone awake manually on HTTP Wi-Fi.';
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
      el('connection-status').textContent = message.connected ? message.ready ? 'Phone controls ready' : 'Phone paired · controls paused' : 'Keyboard · local station';
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
    const response = await fetch('/api/session', { method: 'POST' });
    if (!response.ok) throw new Error('Local session could not be created.');
    session = await response.json() as SessionInfo;
    path.innerHTML = '<option value="usb">USB cable · no Wi-Fi</option>';
    session.lanUrls.forEach((url, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `Wi-Fi · ${new URL(url).hostname}`; path.append(option); });
    socket = new TrainerSocket({ role: 'host', sessionId: session.sessionId, token: session.hostToken }, onMessage, (message) => {
      remote.reset(-1); pause(message, false); el('connection-status').textContent = message;
    });
    await updatePair();
  };
  el('revoke').onclick = () => { pause('Phone revoked. Pair again with the new code.'); void newSession().catch((error) => toast(String(error))); };
  await newSession();
  let previous = performance.now(), accumulator = 0, lastStatus = 0, frames = 0, fps = 0, fpsAt = previous;
  const telemetry = (): Telemetry => ({ altitude: Math.max(0, state.y - 0.45), heading: state.heading * 180 / Math.PI, speed: Math.hypot(state.vx, state.vz),
    gimbal: state.gimbal, mode: state.mode, paused, reason, captures, receiptToFrameMs, lastInputSeq: remote.sequence });
  const frame = (now: number) => {
    const elapsed = now - previous; previous = now;
    if (elapsed > 250 && !paused) pause('Display stalled. Start practice to resume.');
    if (!paused && source === 'phone' && !remote.fresh(now)) pause('Controller input expired. Enable controls again.');
    accumulator = paused ? 0 : Math.min(accumulator + elapsed / 1000, 0.1);
    while (accumulator >= 1 / 60) {
      stepFlight(state, source === 'phone' ? remote.controls : keyboard.read(), 1 / 60); accumulator -= 1 / 60;
      if (state.mode === 'collided') { pause(`Collision with ${state.collision}. Reset the flight to try again.`); break; }
      if (state.y >= 4.4 && Math.hypot(state.vx, state.vy, state.vz) < 0.2) hoverTime += 1 / 60; else hoverTime = 0;
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
      el<HTMLInputElement>('gimbal').value = String(state.gimbal); el<HTMLInputElement>('gimbal').disabled = source === 'phone';
      el('pause').textContent = paused ? 'Start practice' : 'Pause';
      el<HTMLButtonElement>('pause').disabled = paused && source === 'phone' && !remote.fresh(now);
      el('pause-overlay').hidden = !paused;
      el('pause-title').textContent = state.mode === 'collided' ? 'Collision' : 'Paused'; el('pause-reason').textContent = reason;
      el('flight-state').textContent = state.mode.toUpperCase().replace('-', ' ');
      el<HTMLButtonElement>('takeoff').disabled = paused || state.mode !== 'grounded';
      el<HTMLButtonElement>('land').disabled = paused || state.mode !== 'flying';
      el<HTMLButtonElement>('capture').disabled = paused || state.mode === 'collided';
      const framed = world.subjectInFrame(); el('framing').textContent = framed ? 'Subject in frame' : 'Subject not framed';
      el('framing').classList.toggle('framed', framed);
      const success = [hoverTime >= 2, Math.hypot(state.x - 8, state.y - 4, state.z - 3) < 1.5 && Math.min(status.heading, 360 - status.heading) < 15, Math.abs(status.heading - 180) < 15, framedCapture, false, state.mode === 'grounded' && Math.hypot(state.x - PAD.x, state.z - PAD.z) < 1.8 && captures > 0][lessonIndex];
      el('lesson-feedback').textContent = success ? 'Lesson complete. Select another lesson.' : lessons[lessonIndex].hint;
      el('lesson-feedback').classList.toggle('complete', success);
      el('performance').textContent = `${fps} FPS · 60 Hz simulation${source === 'phone' ? ` · receipt → frame ${Math.round(receiptToFrameMs)} ms` : ''}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
