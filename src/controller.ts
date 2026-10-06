import { neutralControls, isNeutral, HOST_TIMEOUT_MS, type Controls, type Action, type ServerMessage, type Telemetry } from '../shared/protocol';
import { TrainerSocket } from './socket';
import { bindFullscreen } from './fullscreen';
import { STICK_AXES, STICK_MODES, parseStickMode, stickInput, stickReadout, type StickSide } from './stick-modes';

class TouchStick {
  private pointer: number | null = null;
  private value = { x: 0, y: 0 };
  constructor(private area: HTMLElement, private knob: HTMLElement, private onChange: (x: number, y: number) => void, private enabled: () => boolean) {
    area.addEventListener('pointerdown', (event) => {
      if (!enabled() || this.pointer !== null) return;
      event.preventDefault(); this.pointer = event.pointerId; area.setPointerCapture(event.pointerId); this.move(event);
    });
    area.addEventListener('pointermove', (event) => { if (event.pointerId === this.pointer) this.move(event); });
    const release = (event: PointerEvent) => { if (event.pointerId === this.pointer) this.clear(); };
    area.addEventListener('pointerup', release); area.addEventListener('pointercancel', release); area.addEventListener('lostpointercapture', release);
    area.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  private move(event: PointerEvent): void {
    const rect = this.area.getBoundingClientRect(), radius = Math.min(rect.width, rect.height) * 0.34;
    let x = (event.clientX - rect.left - rect.width / 2) / radius, y = (rect.top + rect.height / 2 - event.clientY) / radius;
    const distance = Math.hypot(x, y); if (distance > 1) { x /= distance; y /= distance; }
    this.knob.style.transform = `translate(${x * radius}px, ${-y * radius}px)`;
    const strength = Math.min(1, Math.max(0, (Math.min(distance, 1) - 0.07) / 0.93));
    const response = strength * strength;
    this.value = { x: distance === 0 ? 0 : x / Math.min(distance, 1) * response, y: distance === 0 ? 0 : y / Math.min(distance, 1) * response };
    this.onChange(this.value.x, this.value.y);
  }
  clear(): void {
    const pointer = this.pointer; this.pointer = null;
    if (pointer !== null && this.area.hasPointerCapture(pointer)) this.area.releasePointerCapture(pointer);
    this.knob.style.transform = 'translate(0, 0)'; this.value = { x: 0, y: 0 }; this.onChange(0, 0);
  }
}

export function mount(app: HTMLElement): void {
  document.body.classList.add('phone-page');
  const stickColumn = (side: StickSide) => `<div class="stick-column">
    <div class="stick-heading"><span class="stick-title">${side.toUpperCase()} CONTROL STICK</span><strong id="${side}-axes" class="stick-axes"></strong></div>
    <div id="${side}-stick" class="stick" role="group">
      <span class="axis up"></span><span class="axis down"></span><span class="axis left"></span><span class="axis right"></span>
      <div class="stick-ring"></div><div id="${side}-knob" class="stick-knob"></div>
    </div><span id="${side}-value" class="stick-value"></span>
  </div>`;
  app.innerHTML = `<main class="controller controls-disabled">
    <header class="controller-top"><div class="controller-title">Phone controller</div>
      <label class="stick-mode-choice">STICK MODE <select id="stick-mode" aria-label="Stick mode"><option value="1">Mode 1</option><option value="2" selected>Mode 2 · Default</option><option value="3">Mode 3</option></select></label>
      <span id="phone-connection" class="connection-pill">Connecting…</span><button id="fullscreen" class="button quiet" aria-pressed="false">Fullscreen</button>
    </header>
    <div class="controller-status"><span>ALT <strong id="phone-altitude">—</strong></span><span>SPD <strong id="phone-speed">—</strong></span><span>HDG <strong id="phone-heading">—</strong></span><span>GIMBAL <strong id="phone-gimbal">—</strong></span></div>
    <section class="stick-layout">${stickColumn('left')}
      <div class="controller-center"><span class="section-label">Camera</span><div class="gimbal-buttons"><button id="tilt-up" class="button" disabled aria-label="Tilt camera up">↑ Tilt</button><button id="tilt-down" class="button" disabled aria-label="Tilt camera down">↓ Tilt</button></div><button id="phone-capture" class="capture-circle" disabled aria-label="Capture photo"><span></span></button><span id="capture-state" class="capture-state">Capture photo</span><div class="phone-flight-buttons"><button id="phone-takeoff" class="button" disabled>↑ Take off</button><button id="phone-land" class="button" disabled>↓ Land</button></div>
        <div id="phone-pause-prompt" class="phone-pause-prompt" role="status" aria-live="polite" hidden><strong id="phone-pause-title">Game paused</strong><span id="phone-resume-hint"></span></div>
        <button id="phone-resume" class="button primary" disabled hidden>▶ Resume game</button>
        <button id="enable" class="button primary" disabled>Enable controls</button><span id="phone-message" role="status">Center the sticks before enabling.</span>
      </div>
      ${stickColumn('right')}
    </section>
    <footer class="controller-footer"><span id="phone-timing">60 Hz input · waiting for laptop</span><label>STICK SIZE <select id="stick-size" aria-label="Stick size"><option value="normal">Standard</option><option value="small">Small</option><option value="large">Large</option></select></label><span id="wake-status">Keep your screen awake</span></footer>
    <div class="rotate-hint"><span>↻</span><h2>Rotate to landscape</h2><p>Use landscape orientation for both sticks.</p></div>
  </main>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  let stickMode = parseStickMode(null);
  try { stickMode = parseStickMode(localStorage.getItem('trainer-stick-mode')); } catch { /* Storage may be unavailable. */ }
  const renderStickMode = () => {
    el<HTMLSelectElement>('stick-mode').value = stickMode;
    for (const side of ['left', 'right'] as const) {
      const axes = STICK_MODES[stickMode][side], horizontal = STICK_AXES[axes.horizontal], vertical = STICK_AXES[axes.vertical];
      const stick = el(`${side}-stick`);
      el(`${side}-axes`).textContent = `${vertical.label} · ${horizontal.label}`;
      stick.setAttribute('aria-label', `${side === 'left' ? 'Left' : 'Right'} control stick: ${vertical.label.toLowerCase()} up / down, ${horizontal.label.toLowerCase()} left / right`);
      stick.querySelector<HTMLElement>('.axis.up')!.textContent = `▲ ${vertical.positive.toUpperCase()}`;
      stick.querySelector<HTMLElement>('.axis.down')!.textContent = `▼ ${vertical.negative.toUpperCase()}`;
      stick.querySelector<HTMLElement>('.axis.left')!.textContent = axes.horizontal === 'yaw' ? '↶' : '◀';
      stick.querySelector<HTMLElement>('.axis.right')!.textContent = axes.horizontal === 'yaw' ? '↷' : '▶';
      el(`${side}-value`).textContent = stickReadout(stickMode, side);
    }
  };
  renderStickMode();
  let pauseForLayout = () => {};
  el<HTMLSelectElement>('stick-mode').onchange = (event) => {
    const next = parseStickMode((event.target as HTMLSelectElement).value);
    if (next === stickMode) return;
    pauseForLayout(); stickMode = next;
    try { localStorage.setItem('trainer-stick-mode', stickMode); } catch { /* Storage may be unavailable. */ }
    renderStickMode();
  };
  bindFullscreen(el<HTMLButtonElement>('fullscreen'), document.querySelector<HTMLElement>('.controller')!, { onError: (message) => el('phone-message').textContent = message });
  let clearForSize = () => {};
  el<HTMLSelectElement>('stick-size').onchange = (event) => { clearForSize(); document.querySelector('.controller')?.setAttribute('data-stick-size', (event.target as HTMLSelectElement).value); };
  const params = new URLSearchParams(location.hash.slice(1)), sessionId = params.get('session'), token = params.get('token');
  if (!sessionId || !token) { el('phone-connection').textContent = 'Pairing needed'; el('phone-message').textContent = 'Scan the QR code from Pair phone on the laptop.'; return; }
  let ready = false, generation = -1, seq = 0, welcomed = false, status: Telemetry | undefined;
  let controls: Controls = neutralControls(), lastStatus = -Infinity, pingAt = 0, pingId = 0, rtt = 0;
  let resumeError: string | undefined;
  let wakeLock: WakeLockSentinel | undefined;
  const pending = new Map<string, { generation: number; action: Action; at: number; tries: number }>();
  const holds = new Map<number, number>();
  const sendInput = () => {
    if (!ready || document.hidden) return;
    if (!socket.send({ type: 'input', generation, seq: ++seq, controls: { ...controls } })) deactivate('Connection unavailable. Enable controls after reconnecting.');
  };
  const left = new TouchStick(el('left-stick'), el('left-knob'), (x, y) => {
    Object.assign(controls, stickInput(stickMode, 'left', x, y)); el('left-value').textContent = stickReadout(stickMode, 'left', x, y); sendInput();
  }, () => ready);
  const right = new TouchStick(el('right-stick'), el('right-knob'), (x, y) => {
    Object.assign(controls, stickInput(stickMode, 'right', x, y)); el('right-value').textContent = stickReadout(stickMode, 'right', x, y); sendInput();
  }, () => ready);
  const clear = () => { holds.clear(); controls = neutralControls(); left.clear(); right.clear(); };
  const updateButtons = () => {
    el<HTMLButtonElement>('enable').disabled = !welcomed || document.hidden;
    el('enable').textContent = ready ? 'Pause controls' : 'Enable controls';
    const active = ready && status && !status.paused;
    el<HTMLButtonElement>('phone-takeoff').disabled = !ready || status?.mode !== 'grounded';
    el<HTMLButtonElement>('phone-land').disabled = !active || status?.mode !== 'flying';
    el<HTMLButtonElement>('phone-capture').disabled = !active || status?.mode === 'collided';
    el<HTMLButtonElement>('tilt-up').disabled = el<HTMLButtonElement>('tilt-down').disabled = !ready;
    const gamePaused = !!status?.paused && status.mode !== 'grounded', collided = status?.mode === 'collided';
    if (!gamePaused || !ready) resumeError = undefined;
    el('phone-pause-prompt').hidden = !gamePaused;
    el('phone-pause-title').textContent = collided ? 'Flight stopped' : 'Game paused';
    const hint = collided ? 'Reset the flight on the laptop to continue.' : !welcomed ? 'Reconnect your phone to resume.' : ready ? resumeError ?? 'Tap Resume game to continue.' : 'Center both sticks, enable controls, then tap Resume game.';
    if (el('phone-resume-hint').textContent !== hint) el('phone-resume-hint').textContent = hint;
    el<HTMLButtonElement>('phone-resume').hidden = !gamePaused || collided;
    el<HTMLButtonElement>('phone-resume').disabled = !ready || document.hidden || !gamePaused || collided || [...pending.values()].some(request => request.action === 'resume');
    document.querySelector('.controller')?.classList.toggle('game-paused', gamePaused);
    document.querySelector('.controller')?.classList.toggle('controls-disabled', !ready);
  };
  const deactivate = (message: string) => {
    ready = false; clear(); pending.clear(); el('phone-message').textContent = message; el('phone-connection').textContent = welcomed ? 'Controls paused' : 'Disconnected'; updateButtons();
  };
  const suspend = (message: string) => { clear(); socket.send({ type: 'suspend', reason: message }); deactivate(message); };
  pauseForLayout = () => suspend('Stick mode changed. Center both sticks and enable controls to resume.');
  clearForSize = clear;
  const receive = (message: ServerMessage) => {
    if (message.type === 'welcome') { welcomed = true; generation = message.generation; deactivate('Connected. Enable controls to take off.'); }
    if (message.type === 'connection') {
      ready = false; clear(); generation = message.generation; seq = 0; ready = message.ready; pending.clear();
      if (ready) { lastStatus = performance.now(); sendInput(); }
      el('phone-connection').textContent = ready ? 'Controls ready' : 'Controls paused'; el('phone-message').textContent = message.reason; updateButtons();
    }
    if (message.type === 'status') {
      status = message.status; lastStatus = performance.now();
      el('phone-altitude').textContent = `${status.altitude.toFixed(1)} m`; el('phone-speed').textContent = `${status.speed.toFixed(1)} m/s`;
      el('phone-heading').textContent = `${Math.round(status.heading)}°`; el('phone-gimbal').textContent = `${Math.round(status.gimbal)}°`;
      el('phone-timing').textContent = `RTT ${Math.round(rtt)} ms · receipt → frame ${Math.round(status.receiptToFrameMs)} ms`;
      if (ready) el('phone-message').textContent = status.paused && status.mode === 'grounded' ? 'Controls ready. Take off when ready.' : status.reason;
      updateButtons();
    }
    if (message.type === 'pong' && message.id === pingId) rtt = performance.now() - pingAt;
    if (message.type === 'ack' && message.generation === generation && pending.has(message.id)) {
      const request = pending.get(message.id)!;
      if (request.action === 'resume') resumeError = message.ok ? undefined : message.message;
      pending.delete(message.id); if (request.action === 'capture') el('capture-state').textContent = message.message; el('phone-message').textContent = message.message; updateButtons();
    }
  };
  const socket = new TrainerSocket({ role: 'controller', sessionId, token }, receive, (message) => { welcomed = false; deactivate(message); });
  const requestWake = async () => {
    if ('wakeLock' in navigator && isSecureContext) {
      try { wakeLock = await navigator.wakeLock.request('screen'); el('wake-status').textContent = 'Screen kept awake'; wakeLock.addEventListener('release', () => el('wake-status').textContent = 'Keep your screen awake'); } catch { el('wake-status').textContent = 'Set screen timeout manually'; }
    } else el('wake-status').textContent = 'Set screen timeout manually';
  };
  el('enable').onclick = () => {
    if (ready) { suspend('Phone controls paused. Enable controls to resume.'); return; }
    clear(); if (!isNeutral(controls)) return;
    socket.send({ type: 'resume', generation, controls }); void requestWake();
  };
  const action = (name: Action) => {
    if (!ready || !status || (status.paused && name !== 'resume' && !(name === 'takeoff' && status.mode === 'grounded'))) return;
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    pending.set(id, { generation, action: name, at: performance.now(), tries: 1 });
    socket.send({ type: 'action', generation, id, action: name });
    updateButtons();
  };
  el('phone-takeoff').onclick = () => action('takeoff'); el('phone-land').onclick = () => action('land'); el('phone-capture').onclick = () => action('capture');
  el('phone-resume').onclick = () => {
    if (!ready || !status?.paused || status.mode === 'collided') return;
    resumeError = undefined; clear(); action('resume');
  };
  for (const [id, value] of [['tilt-up', 1], ['tilt-down', -1]] as const) {
    const button = el(id);
    button.onpointerdown = (event) => { if (!ready) return; event.preventDefault(); button.setPointerCapture(event.pointerId); holds.set(event.pointerId, value); controls.gimbal = value; sendInput(); };
    const release = (event: PointerEvent) => { holds.delete(event.pointerId); controls.gimbal = ready ? [...holds.values()].at(-1) ?? 0 : 0; sendInput(); };
    button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { holds.clear(); suspend('Phone page hidden. Enable controls to resume.'); void wakeLock?.release(); } else updateButtons(); });
  window.addEventListener('pagehide', () => { holds.clear(); suspend('Phone page closed.'); });
  window.addEventListener('blur', () => { holds.clear(); suspend('Phone lost focus. Enable controls to resume.'); });
  const interval = setInterval(() => {
    const now = performance.now();
    if (ready && now - lastStatus > HOST_TIMEOUT_MS) suspend('Laptop stopped responding. Enable controls again.');
    sendInput();
    for (const [id, request] of pending) {
      if (now - request.at < 500) continue;
      if (request.tries >= 3) { pending.delete(id); el('phone-message').textContent = 'Action was not confirmed. Check the laptop.'; updateButtons(); continue; }
      request.at = now; request.tries++; socket.send({ type: 'action', generation: request.generation, id, action: request.action });
    }
    if (welcomed && now - pingAt > 1000) { pingAt = now; socket.send({ type: 'ping', id: ++pingId }); }
  }, 1000 / 60);
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
  updateButtons();
}
