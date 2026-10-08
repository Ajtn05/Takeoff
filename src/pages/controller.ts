import '../styles/controller.css';
import { controllerMarkup } from '../ui/templates/controller';
import { TouchStick } from '../ui/touch-stick';
import { elementLookup, requiredElement } from '../ui/dom';
import { readPreference, savePreference } from '../ui/storage';
import {
  neutralControls,
  isNeutral,
  HOST_TIMEOUT_MS,
  type Controls,
  type Action,
  type ServerMessage,
  type Telemetry,
} from '../../shared/protocol';
import { TrainerSocket } from '../network/socket';
import { bindFullscreen } from '../ui/fullscreen';
import {
  STICK_AXES,
  STICK_MODES,
  parseStickMode,
  stickInput,
  stickReadout,
} from '../flight/stick-modes';

export function mount(app: HTMLElement): void {
  document.body.classList.add('phone-page');
  app.innerHTML = controllerMarkup();
  const getElement = elementLookup(app);
  const controller = requiredElement(app, '.controller');
  let stickMode = parseStickMode(readPreference('trainer-stick-mode'));
  const renderStickMode = () => {
    getElement<HTMLSelectElement>('stick-mode').value = stickMode;
    for (const side of ['left', 'right'] as const) {
      const axes = STICK_MODES[stickMode][side];
      const horizontal = STICK_AXES[axes.horizontal];
      const vertical = STICK_AXES[axes.vertical];
      const stick = getElement(`${side}-stick`);
      getElement(`${side}-axes`).textContent = `${vertical.label} · ${horizontal.label}`;
      stick.setAttribute(
        'aria-label',
        `${side === 'left' ? 'Left' : 'Right'} control stick: ${vertical.label.toLowerCase()} up / down, ${horizontal.label.toLowerCase()} left / right`,
      );
      stick.querySelector<HTMLElement>('.axis.up')!.textContent =
        `▲ ${vertical.positive.toUpperCase()}`;
      stick.querySelector<HTMLElement>('.axis.down')!.textContent =
        `▼ ${vertical.negative.toUpperCase()}`;
      stick.querySelector<HTMLElement>('.axis.left')!.textContent =
        axes.horizontal === 'yaw' ? '↶' : '◀';
      stick.querySelector<HTMLElement>('.axis.right')!.textContent =
        axes.horizontal === 'yaw' ? '↷' : '▶';
      getElement(`${side}-value`).textContent = stickReadout(stickMode, side);
    }
  };
  renderStickMode();
  let pauseForLayout = () => {};
  getElement<HTMLSelectElement>('stick-mode').onchange = (event) => {
    const next = parseStickMode((event.target as HTMLSelectElement).value);
    if (next === stickMode) return;
    pauseForLayout();
    stickMode = next;
    savePreference('trainer-stick-mode', stickMode);
    renderStickMode();
  };
  bindFullscreen(getElement<HTMLButtonElement>('fullscreen'), controller, {
    onError: (message) => (getElement('phone-message').textContent = message),
  });
  let clearForSize = () => {};
  getElement<HTMLSelectElement>('stick-size').onchange = (event) => {
    clearForSize();
    controller.setAttribute('data-stick-size', (event.target as HTMLSelectElement).value);
  };
  const params = new URLSearchParams(location.hash.slice(1));
  const sessionId = params.get('session');
  const token = params.get('token');
  if (!sessionId || !token) {
    getElement('phone-connection').textContent = 'Pairing needed';
    getElement('phone-message').textContent = 'Scan the QR code from Pair phone on the laptop.';
    return;
  }
  let ready = false;
  let generation = -1;
  let seq = 0;
  let welcomed = false;
  let status: Telemetry | undefined;
  let controls: Controls = neutralControls();
  let lastStatus = -Infinity;
  let pingAt = 0;
  let pingId = 0;
  let rtt = 0;
  let resumeError: string | undefined;
  let wakeLock: WakeLockSentinel | undefined;
  const pending = new Map<
    string,
    { generation: number; action: Action; at: number; tries: number }
  >();
  const holds = new Map<number, number>();
  const sendInput = () => {
    if (!ready || document.hidden) return;
    if (!socket.send({ type: 'input', generation, seq: ++seq, controls: { ...controls } }))
      deactivate('Connection unavailable. Enable controls after reconnecting.');
  };
  const left = new TouchStick(
    getElement('left-stick'),
    getElement('left-knob'),
    (x, y) => {
      Object.assign(controls, stickInput(stickMode, 'left', x, y));
      getElement('left-value').textContent = stickReadout(stickMode, 'left', x, y);
      sendInput();
    },
    () => ready,
  );
  const right = new TouchStick(
    getElement('right-stick'),
    getElement('right-knob'),
    (x, y) => {
      Object.assign(controls, stickInput(stickMode, 'right', x, y));
      getElement('right-value').textContent = stickReadout(stickMode, 'right', x, y);
      sendInput();
    },
    () => ready,
  );
  const clear = () => {
    holds.clear();
    controls = neutralControls();
    left.clear();
    right.clear();
  };
  const updateButtons = () => {
    getElement<HTMLButtonElement>('enable').disabled = !welcomed || document.hidden;
    getElement('enable').textContent = ready ? 'Pause controls' : 'Enable controls';
    const active = ready && status && !status.paused;
    getElement<HTMLButtonElement>('phone-takeoff').disabled = !ready || status?.mode !== 'grounded';
    getElement<HTMLButtonElement>('phone-land').disabled = !active || status?.mode !== 'flying';
    getElement<HTMLButtonElement>('phone-capture').disabled =
      !active || status?.mode === 'collided';
    getElement<HTMLButtonElement>('tilt-up').disabled = getElement<HTMLButtonElement>(
      'tilt-down',
    ).disabled = !ready;
    const gamePaused = !!status?.paused && status.mode !== 'grounded';
    const collided = status?.mode === 'collided';
    if (!gamePaused || !ready) resumeError = undefined;
    getElement('phone-pause-prompt').hidden = !gamePaused;
    getElement('phone-pause-title').textContent = collided ? 'Flight stopped' : 'Game paused';
    const hint = collided
      ? 'Reset the flight on the laptop to continue.'
      : !welcomed
        ? 'Reconnect your phone to resume.'
        : ready
          ? (resumeError ?? 'Tap Resume game to continue.')
          : 'Center both sticks, enable controls, then tap Resume game.';
    if (getElement('phone-resume-hint').textContent !== hint)
      getElement('phone-resume-hint').textContent = hint;
    getElement<HTMLButtonElement>('phone-resume').hidden = !gamePaused || collided;
    getElement<HTMLButtonElement>('phone-resume').disabled =
      !ready ||
      document.hidden ||
      !gamePaused ||
      collided ||
      [...pending.values()].some((request) => request.action === 'resume');
    controller.classList.toggle('game-paused', gamePaused);
    controller.classList.toggle('controls-disabled', !ready);
  };
  const deactivate = (message: string) => {
    ready = false;
    clear();
    pending.clear();
    getElement('phone-message').textContent = message;
    getElement('phone-connection').textContent = welcomed ? 'Controls paused' : 'Disconnected';
    updateButtons();
  };
  const suspend = (message: string) => {
    clear();
    socket.send({ type: 'suspend', reason: message });
    deactivate(message);
  };
  pauseForLayout = () =>
    suspend('Stick mode changed. Center both sticks and enable controls to resume.');
  clearForSize = clear;
  const receive = (message: ServerMessage) => {
    if (message.type === 'welcome') {
      welcomed = true;
      generation = message.generation;
      deactivate('Connected. Enable controls to take off.');
    }
    if (message.type === 'connection') {
      ready = false;
      clear();
      generation = message.generation;
      seq = 0;
      ready = message.ready;
      pending.clear();
      if (ready) {
        lastStatus = performance.now();
        sendInput();
      }
      getElement('phone-connection').textContent = ready ? 'Controls ready' : 'Controls paused';
      getElement('phone-message').textContent = message.reason;
      updateButtons();
    }
    if (message.type === 'status') {
      status = message.status;
      lastStatus = performance.now();
      getElement('phone-altitude').textContent = `${status.altitude.toFixed(1)} m`;
      getElement('phone-speed').textContent = `${status.speed.toFixed(1)} m/s`;
      getElement('phone-heading').textContent = `${Math.round(status.heading)}°`;
      getElement('phone-gimbal').textContent = `${Math.round(status.gimbal)}°`;
      getElement('phone-timing').textContent =
        `RTT ${Math.round(rtt)} ms · receipt → frame ${Math.round(status.receiptToFrameMs)} ms`;
      if (ready)
        getElement('phone-message').textContent =
          status.paused && status.mode === 'grounded'
            ? 'Controls ready. Take off when ready.'
            : status.reason;
      updateButtons();
    }
    if (message.type === 'pong' && message.id === pingId) rtt = performance.now() - pingAt;
    if (message.type === 'ack' && message.generation === generation && pending.has(message.id)) {
      const request = pending.get(message.id)!;
      if (request.action === 'resume') resumeError = message.ok ? undefined : message.message;
      pending.delete(message.id);
      if (request.action === 'capture') getElement('capture-state').textContent = message.message;
      getElement('phone-message').textContent = message.message;
      updateButtons();
    }
  };
  const socket = new TrainerSocket({ role: 'controller', sessionId, token }, receive, (message) => {
    welcomed = false;
    deactivate(message);
  });
  const requestWake = async () => {
    if ('wakeLock' in navigator && isSecureContext) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        getElement('wake-status').textContent = 'Screen kept awake';
        wakeLock.addEventListener(
          'release',
          () => (getElement('wake-status').textContent = 'Keep your screen awake'),
        );
      } catch {
        getElement('wake-status').textContent = 'Set screen timeout manually';
      }
    } else getElement('wake-status').textContent = 'Set screen timeout manually';
  };
  getElement('enable').onclick = () => {
    if (ready) {
      suspend('Phone controls paused. Enable controls to resume.');
      return;
    }
    clear();
    if (!isNeutral(controls)) return;
    socket.send({ type: 'resume', generation, controls });
    void requestWake();
  };
  const action = (name: Action) => {
    if (
      !ready ||
      !status ||
      (status.paused && name !== 'resume' && !(name === 'takeoff' && status.mode === 'grounded'))
    )
      return;
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    pending.set(id, { generation, action: name, at: performance.now(), tries: 1 });
    socket.send({ type: 'action', generation, id, action: name });
    updateButtons();
  };
  getElement('phone-takeoff').onclick = () => action('takeoff');
  getElement('phone-land').onclick = () => action('land');
  getElement('phone-capture').onclick = () => action('capture');
  getElement('phone-resume').onclick = () => {
    if (!ready || !status?.paused || status.mode === 'collided') return;
    resumeError = undefined;
    clear();
    action('resume');
  };
  for (const [id, value] of [
    ['tilt-up', 1],
    ['tilt-down', -1],
  ] as const) {
    const button = getElement(id);
    button.onpointerdown = (event) => {
      if (!ready) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      holds.set(event.pointerId, value);
      controls.gimbal = value;
      sendInput();
    };
    const release = (event: PointerEvent) => {
      holds.delete(event.pointerId);
      controls.gimbal = ready ? ([...holds.values()].at(-1) ?? 0) : 0;
      sendInput();
    };
    button.onpointerup = release;
    button.onpointercancel = release;
    button.onlostpointercapture = release;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      holds.clear();
      suspend('Phone page hidden. Enable controls to resume.');
      void wakeLock?.release();
    } else updateButtons();
  });
  window.addEventListener('pagehide', () => {
    holds.clear();
    suspend('Phone page closed.');
  });
  window.addEventListener('blur', () => {
    holds.clear();
    suspend('Phone lost focus. Enable controls to resume.');
  });
  const interval = setInterval(() => {
    const now = performance.now();
    if (ready && now - lastStatus > HOST_TIMEOUT_MS)
      suspend('Laptop stopped responding. Enable controls again.');
    sendInput();
    for (const [id, request] of pending) {
      if (now - request.at < 500) continue;
      if (request.tries >= 3) {
        pending.delete(id);
        getElement('phone-message').textContent = 'Action was not confirmed. Check the laptop.';
        updateButtons();
        continue;
      }
      request.at = now;
      request.tries++;
      socket.send({ type: 'action', generation: request.generation, id, action: request.action });
    }
    if (welcomed && now - pingAt > 1000) {
      pingAt = now;
      socket.send({ type: 'ping', id: ++pingId });
    }
  }, 1000 / 60);
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  updateButtons();
}
