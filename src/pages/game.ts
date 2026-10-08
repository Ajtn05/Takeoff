import { bindGameView } from '../ui/game-view';
import { readBestScore, saveBestScore } from '../game/scores';
import { FlightClock, MAX_FRAME_MS, STATUS_INTERVAL_MS } from '../flight/clock';
import { type Action, type ServerMessage, type Telemetry } from '../../shared/protocol';
import { bindFullscreen } from '../ui/fullscreen';
import { PhonePairing } from '../network/pairing';
import { GAME_PAIRING_COPY } from '../ui/pairing-copy';
import { gameMarkup } from '../ui/templates/game';
import { elementLookup, requiredElement } from '../ui/dom';
import { bindToast } from '../ui/toast';
import {
  captureRush,
  createRushRun,
  finishRush,
  launchRush,
  nextRushGate,
  stepRush,
} from '../game/engine';
import { RushWorld } from '../rendering/game-world';
import { icon } from '../ui/icons';
import { KeyboardInput, RemoteInput } from '../flight/input';
import '../styles/game.css';

export async function mount(app: HTMLElement): Promise<void> {
  document.title = 'Flight Rush · Takeoff';
  app.innerHTML = gameMarkup();
  const getElement = elementLookup(app);
  const station = requiredElement(app, '.rush-game');
  const renderView = bindGameView(app);
  const world = new RushWorld(getElement('game-stage'), getElement('game-camera'));
  let run = createRushRun();
  let best = readBestScore();
  let newBest = false;
  let paused = true;
  let reason = 'Ready to launch';
  let source: 'keyboard' | 'phone' = 'keyboard';
  let connectedPhone = false;
  let graphicsLost = false;
  let pairing: PhonePairing | undefined;
  let feedbackUntil = 0;
  let captures = 0;
  const remote = new RemoteInput();
  const toast = bindToast(getElement('toast'));
  const pause = (message: string, notify = true) => {
    paused = true;
    reason = message;
    keyboard.clear();
    if (notify && remote.ready) {
      remote.ready = false;
      pairing?.send({ type: 'suspend', reason: message });
    }
    updateUI();
  };
  const startBlock = (): string | undefined => {
    if (graphicsLost) return 'Reload the page to restore the graphics.';
    if (document.hidden) return 'Return to the laptop page before starting.';
    if (app.querySelector('dialog[open]'))
      return 'Close the open dialog on the laptop before starting.';
    if (source === 'phone' && (!connectedPhone || !remote.fresh(performance.now())))
      return 'Pair your phone and enable its controls before starting.';
  };
  const start = () => {
    if (run.phase === 'over')
      return { ok: false, message: 'Restart the run on the laptop to fly again.' };
    const block = startBlock();
    if (block) return { ok: false, message: block };
    keyboard.clear();
    launchRush(run);
    paused = false;
    reason = run.phase === 'takeoff' ? 'Taking off. The course starts at 6 m.' : 'Run in progress';
    updateUI();
    getElement('game-stage').focus({ preventScroll: true });
    return { ok: true, message: reason };
  };
  const finish = (message: string) => {
    if (run.phase !== 'over') finishRush(run, message);
    newBest = run.score > best;
    best = saveBestScore(run.score);
    pause(message);
    getElement('game-start').focus({ preventScroll: true });
  };
  const reset = () => {
    best = saveBestScore(run.score);
    pause('Run reset. Launch when ready.');
    run = createRushRun();
    captures = 0;
    newBest = false;
    world.resetCamera();
    getElement('game-feedback').textContent = '';
    updateUI();
  };
  const perform = (action: Action) => {
    if (action === 'resume') return start();
    if (action === 'takeoff')
      return run.phase === 'ready'
        ? start()
        : { ok: false, message: 'Restart on the laptop to launch a new run.' };
    if (paused || run.phase !== 'running')
      return { ok: false, message: 'Resume the run before using flight actions.' };
    if (action === 'land') {
      finish('Run banked. Your score is saved.');
      return { ok: true, message: reason };
    }
    if (captureRush(run)) {
      captures++;
      updateUI();
      return { ok: true, message: 'Beacon captured. Clear the gate to collect the points.' };
    }
    return { ok: false, message: 'Capture when the beacon gate is in frame at −12° camera tilt.' };
  };
  const togglePause = () => {
    if (run.phase === 'over') return;
    if (!paused) pause('Run paused. Center the sticks before resuming.');
    else {
      const result = start();
      if (!result.ok) toast(result.message);
    }
  };
  const keyboard = new KeyboardInput((action) => {
    if (action === 'pause') togglePause();
    else if (source === 'keyboard') {
      const result = perform(action);
      if (!result.ok || action === 'capture') toast(result.message);
    }
  });
  function updateUI(): void {
    renderView({
      run,
      best,
      newBest,
      paused,
      reason,
      source,
      connectedPhone,
      controlsReady: remote.ready,
      startBlocked: Boolean(startBlock()),
    });
  }
  getElement('game-start').onclick = () => {
    if (run.phase === 'over') reset();
    const result = start();
    if (!result.ok) toast(result.message);
  };
  getElement('game-pause').onclick = togglePause;
  getElement('game-retry').onclick = reset;
  getElement<HTMLSelectElement>('source').onchange = (event) => {
    pause('Control source changed. Resume when ready.');
    source = (event.target as HTMLSelectElement).value as typeof source;
    updateUI();
  };
  getElement('game-guide').onclick = () => {
    pause('Game guide open. Close it to resume.');
    getElement<HTMLDialogElement>('game-guide-dialog').showModal();
  };
  getElement('game-guide-close').onclick = () =>
    getElement<HTMLDialogElement>('game-guide-dialog').close();
  for (const id of ['pair-dialog', 'game-guide-dialog'])
    getElement<HTMLDialogElement>(id).addEventListener('close', () => {
      if (run.phase !== 'over')
        reason =
          run.phase === 'ready'
            ? 'Ready to launch'
            : source === 'phone'
              ? 'Enable phone controls, then resume.'
              : 'Run paused. Resume when ready.';
      updateUI();
    });
  const receive = (message: ServerMessage) => {
    if (message.type === 'connection') {
      const newlyPaired = message.connected && !connectedPhone;
      connectedPhone = message.connected;
      remote.reset(message.generation, message.ready);
      if (newlyPaired) {
        source = 'phone';
        getElement<HTMLSelectElement>('source').value = source;
      }
      if (source === 'phone') pause(message.reason, false);
      updateUI();
    }
    if (
      message.type === 'input' &&
      remote.accept(message.generation, message.seq, message.controls, performance.now()) &&
      paused
    )
      updateUI();
    if (message.type === 'action') {
      if (message.generation !== remote.generation) return;
      const result =
        source === 'phone' && remote.fresh(performance.now())
          ? perform(message.action)
          : { ok: false, message: 'Phone controls are paused.' };
      pairing?.send({ type: 'ack', generation: message.generation, id: message.id, ...result });
      if (!result.ok || message.action === 'capture') toast(result.message);
    }
  };
  pairing = new PhonePairing(app, { copy: GAME_PAIRING_COPY, receive, pause, toast });
  bindFullscreen(getElement<HTMLButtonElement>('game-fullscreen'), station, {
    onError: toast,
    expandWithinPage: true,
    onChange: (active) => {
      station.classList.toggle('rush-fullscreen', active);
      getElement('game-fullscreen').innerHTML = icon(active ? 'minimize' : 'fullscreen');
      getElement('game-fullscreen').setAttribute(
        'aria-label',
        active ? 'Exit fullscreen' : 'Fullscreen',
      );
    },
  });
  window.addEventListener('blur', () => {
    if (source === 'keyboard' && run.phase !== 'over')
      pause('Laptop lost focus. Resume when ready.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('Laptop page hidden. Resume when ready.');
  });
  window.addEventListener('pagehide', () => {
    saveBestScore(run.score);
    pause('Game page closed.');
    pairing?.close();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  window.addEventListener('rush-context-lost', () => {
    graphicsLost = true;
    pause('Graphics context lost. Reload the page.');
  });
  updateUI();
  // Rendering and keyboard play do not wait for the pairing service.
  void pairing.connect();
  let previous = performance.now();
  let lastStatus = 0;
  let animationTime = 0;
  const clock = new FlightClock();
  const frame = (now: number) => {
    const elapsed = now - previous;
    previous = now;
    if (elapsed > MAX_FRAME_MS && !paused) pause('Display stalled. Resume when ready.');
    if (!paused && source === 'phone' && !remote.available(now))
      pause('Waiting for phone input. Resume when the connection returns.', false);
    clock.advance(elapsed, paused, (seconds) => {
      const input = source === 'phone' ? remote.read(now) : keyboard.read();
      const events = stepRush(run, input, seconds);
      animationTime += seconds * 1000;
      for (const event of events) {
        getElement('game-feedback').textContent = event.message;
        getElement('game-feedback').dataset.kind = event.kind;
        feedbackUntil = now + 2400;
        if (event.kind === 'over') finish(event.message);
      }
      return !paused;
    });
    if (now > feedbackUntil && getElement('game-feedback').textContent)
      getElement('game-feedback').textContent = '';
    world.update(run, Math.min(elapsed / 1000, 0.05), animationTime);
    world.render();
    if (now - lastStatus > STATUS_INTERVAL_MS) {
      lastStatus = now;
      updateUI();
      if (!paused && run.phase === 'running') {
        const move = nextRushGate(run)?.maneuver;
        reason = move ? `${move.label} · ${move.phone}` : 'Run in progress';
      }
      const s = run.drone;
      const status: Telemetry = {
        altitude: Math.max(0, s.y - 0.065),
        heading: (s.heading * 180) / Math.PI,
        speed: Math.hypot(s.vx, s.vz),
        gimbal: s.gimbal,
        mode: s.mode,
        paused,
        reason,
        captures,
        receiptToFrameMs: remote.fresh(now) ? Math.max(0, now - remote.receivedAt) : 0,
        lastInputSeq: remote.sequence,
      };
      pairing?.send({ type: 'status', status });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
