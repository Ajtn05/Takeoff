import { type Action, type ServerMessage, type Telemetry } from '../shared/protocol';
import { bindFullscreen } from './fullscreen';
import { GamePairing, gamePairingMarkup } from './game-pairing';
import { beaconInFrame, captureRush, createRushRun, finishRush, gateZ, launchRush, MANEUVERS, multiplier, nextRushGate, readBestScore, runSpeed, saveBestScore, stepRush } from './game-engine';
import { RushWorld } from './game-world';
import { icon } from './icons';
import { KeyboardInput, RemoteInput } from './input';
import './game.css';

export async function mount(app: HTMLElement): Promise<void> {
  document.title = 'Flight Rush · Takeoff';
  app.innerHTML = `<main class="rush-game">
    <header class="rush-header"><a class="takeoff-wordmark" href="/" aria-label="Takeoff main menu">${icon('aids')} TAKEOFF</a><span class="rush-mode-label">FLIGHT RUSH <i>ENDLESS</i></span><div class="rush-tools"><label><span class="sr-only">Controls</span><select id="source" aria-label="Control source"><option value="keyboard">Keyboard</option><option value="phone">Phone</option></select></label><button id="pair" class="button quiet">${icon('phone')}<span>Pair phone</span></button><button id="game-guide" class="button quiet" aria-label="Game guide">${icon('guide')}</button><button id="game-fullscreen" class="button quiet" aria-label="Fullscreen" aria-pressed="false">${icon('fullscreen')}</button></div></header>
    <section id="game-stage" class="rush-stage" aria-label="Flight Rush course" data-phase="ready" tabindex="-1">
      <div class="rush-hud"><div class="rush-score"><span>SCORE</span><strong id="game-score">0</strong><small>BEST <b id="game-best">0</b></small></div><div class="rush-run-stats"><div><span>STREAK</span><strong id="game-combo">0 <small>×1</small></strong></div><div><span>SHIELDS</span><strong id="game-shields" aria-label="3 shields remaining">● ● ●</strong></div><div><span>LEVEL</span><strong id="game-level">01</strong></div></div><div class="rush-playback"><button id="game-pause" class="button quiet" aria-label="Pause run">${icon('pause')}</button><button id="game-retry" class="button quiet" aria-label="Restart run">${icon('reset')}</button></div></div>
      <div id="game-feedback" class="rush-feedback" role="status" aria-live="polite"></div>
      <div class="rush-maneuver"><span class="eyebrow" id="game-gate-number">GATE 01</span><div class="maneuver-heading"><span id="game-move-symbol">↑</span><h2 id="game-move">Push forward</h2><kbd id="game-key">↑</kbd></div><p id="game-hint"></p><div class="maneuver-progress"><i id="game-move-progress"></i></div><div class="maneuver-meta"><span id="game-requirement">COMPLETE THE MOVE + CLEAR THE OPENING</span><span id="game-gate-distance">45 m</span></div></div>
      <div id="game-camera" class="rush-camera" aria-label="Drone camera preview"><div class="rush-camera-label">${icon('camera')} LIVE CAMERA <span id="game-tilt">−12°</span></div><div class="rush-camera-reticle"></div><span id="game-beacon" class="beacon-hint" hidden>BEACON IN FRAME</span></div>
      <div id="game-overlay" class="rush-overlay"><section class="rush-prompt" aria-labelledby="game-title"><span class="eyebrow" id="game-prompt-eyebrow">THE CITY IS YOUR FLIGHT PATH</span><h1 id="game-title">Ready for<br><em>the rush?</em></h1><p id="game-prompt-copy">An endless course. Your usual drone controls.<br>Make the move and clear the gate to build your score.</p><div id="game-results" class="rush-results" hidden><div><span>GATES</span><strong id="result-gates">0</strong></div><div><span>DISTANCE</span><strong id="result-distance">0 m</strong></div><div><span>BEST STREAK</span><strong id="result-combo">0</strong></div></div><div id="game-ready-rules" class="rush-rules"><span>3 shields</span><span>12 maneuvers</span><span>One endless run</span></div><button id="game-start" class="button primary rush-start">${icon('takeoff')}<span>Launch run</span></button><span id="game-start-hint" class="rush-start-hint">T to launch · Space to pause</span><a class="rush-menu-link" href="/">${icon('reset')} Back to menu</a></section></div>
    </section>
    <footer class="rush-instruments"><span id="game-status" role="status">Ready to launch</span><div><span>ALT <b id="game-altitude">0.0</b> m</span><span>COURSE <b id="game-speed">7.0</b> m/s</span><span>HDG <b id="game-heading">000</b>°</span><span>TILT <b id="game-instrument-tilt">−12</b>°</span><span title="Forward/backward position relative to the center of the flight corridor"><b id="game-position">CENTER 0.0</b> m</span><span>DIST <b id="game-distance">0</b> m</span></div><span id="connection-status">Keyboard · ready</span></footer>
    <div class="rush-controls-strip" aria-label="Keyboard controls"><span><kbd>↑ ↓</kbd> Forward / back</span><span><kbd>← →</kbd> Strafe</span><span><kbd>W S</kbd> Climb / descend</span><span><kbd>A D</kbd> Turn</span><span><kbd>R F</kbd> Camera tilt</span><span><kbd>C</kbd> Capture</span><span><kbd>L</kbd> Bank run</span></div>
    <dialog id="game-guide-dialog"><div class="dialog-header"><h2>How to play Flight Rush</h2><button id="game-guide-close" class="icon-button" aria-label="Close game guide">×</button></div><p>The course scrolls toward you automatically. Fly freely inside the corridor with the same controls as Practice. The large view follows your drone; the inset shows its camera.</p><p>Each gate asks for a move. Follow the cue, then pass through the opening. Forward gates need you ahead of the center line; backward gates need you behind it. Yaw gates also check your heading. Hover gates need one second with centered sticks.</p><div class="rush-guide-moves">${MANEUVERS.map(move => `<span><kbd>${move.key}</kbd> ${move.label}</span>`).join('')}</div><p>Camera gates check the tilt shown on the live preview. For the beacon, face forward and tilt to −12°; capture while “Beacon in frame” is visible.</p><p>Earn 2 points per meter, 100 per gate, and 50 extra for a centered pass. Every four consecutive gates increases the multiplier, up to ×5. Missing an opening or its maneuver costs one of three shields and resets the streak. Ground contact or leaving the corridor ends the run. Every eight gates, the course gets faster and openings get tighter.</p><p>Take off starts a run. Space pauses or resumes. L or the phone’s Land button banks your score and ends the run. Restart resets the course. Best scores stay in this browser.</p><p>On a phone, use your usual DJI stick mode. Select Pair phone, enable controls, close the pairing dialog, and take off. Pauses require enabling phone controls again before resuming.</p></dialog>
    ${gamePairingMarkup()}<div id="toast" class="toast" role="status"></div>
  </main>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => app.querySelector<T>(`#${id}`)!;
  const world = new RushWorld(el('game-stage'), el('game-camera'));
  let run = createRushRun(), best = readBestScore(), newBest = false, paused = true, reason = 'Ready to launch';
  let source: 'keyboard' | 'phone' = 'keyboard', connectedPhone = false, graphicsLost = false;
  let pairing: GamePairing | undefined, toastTimer: ReturnType<typeof setTimeout>, feedbackUntil = 0, captures = 0;
  const remote = new RemoteInput();
  const toast = (message: string) => {
    el('toast').textContent = message; el('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').classList.remove('visible'), 3500);
  };
  const pause = (message: string, notify = true) => {
    paused = true; reason = message; keyboard.clear();
    if (notify && remote.ready) { remote.ready = false; pairing?.send({ type: 'suspend', reason: message }); }
    updateUI();
  };
  const startBlock = (): string | undefined => {
    if (graphicsLost) return 'Reload the page to restore the graphics.';
    if (document.hidden) return 'Return to the laptop page before starting.';
    if (app.querySelector('dialog[open]')) return 'Close the open dialog on the laptop before starting.';
    if (source === 'phone' && (!connectedPhone || !remote.fresh(performance.now()))) return 'Pair your phone and enable its controls before starting.';
  };
  const start = () => {
    if (run.phase === 'over') return { ok: false, message: 'Restart the run on the laptop to fly again.' };
    const block = startBlock(); if (block) return { ok: false, message: block };
    keyboard.clear(); launchRush(run); paused = false; reason = run.phase === 'takeoff' ? 'Taking off. The course starts at 6 m.' : 'Run in progress';
    updateUI(); el('game-stage').focus({ preventScroll: true }); return { ok: true, message: reason };
  };
  const finish = (message: string) => {
    if (run.phase !== 'over') finishRush(run, message);
    newBest = run.score > best;
    best = saveBestScore(run.score); pause(message); el('game-start').focus({ preventScroll: true });
  };
  const reset = () => {
    best = saveBestScore(run.score); pause('Run reset. Launch when ready.');
    run = createRushRun(); captures = 0; newBest = false; world.resetCamera(); el('game-feedback').textContent = ''; updateUI();
  };
  const perform = (action: Action) => {
    if (action === 'resume') return start();
    if (action === 'takeoff') return run.phase === 'ready' ? start() : { ok: false, message: 'Restart on the laptop to launch a new run.' };
    if (paused || run.phase !== 'running') return { ok: false, message: 'Resume the run before using flight actions.' };
    if (action === 'land') { finish('Run banked. Your score is saved.'); return { ok: true, message: reason }; }
    if (captureRush(run)) { captures++; updateUI(); return { ok: true, message: 'Beacon captured. Clear the gate to collect the points.' }; }
    return { ok: false, message: 'Capture when the beacon gate is in frame at −12° camera tilt.' };
  };
  const togglePause = () => {
    if (run.phase === 'over') return;
    if (!paused) pause('Run paused. Center the sticks before resuming.');
    else { const result = start(); if (!result.ok) toast(result.message); }
  };
  const keyboard = new KeyboardInput(action => {
    if (action === 'pause') togglePause();
    else if (source === 'keyboard') { const result = perform(action); if (!result.ok || action === 'capture') toast(result.message); }
  });
  function updateUI(): void {
    const over = run.phase === 'over', ready = run.phase === 'ready', gate = nextRushGate(run), move = gate?.maneuver;
    el('game-stage').dataset.phase = over ? 'over' : paused && !ready ? 'paused' : run.phase;
    el('game-score').textContent = run.score.toLocaleString(); el('game-best').textContent = Math.max(best, run.score).toLocaleString();
    el('game-combo').innerHTML = `${run.combo} <small>×${multiplier(run)}</small>`;
    el('game-shields').textContent = Array.from({ length: 3 }, (_, i) => i < run.shields ? '●' : '○').join(' ');
    el('game-shields').setAttribute('aria-label', `${run.shields} shields remaining`);
    el('game-level').textContent = String(run.level).padStart(2, '0');
    el('game-altitude').textContent = Math.max(0, run.drone.y - 0.065).toFixed(1);
    el('game-speed').textContent = runSpeed(run).toFixed(1); el('game-heading').textContent = String(Math.round(run.drone.heading * 180 / Math.PI) % 360).padStart(3, '0');
    el('game-distance').textContent = Math.floor(run.distance).toLocaleString();
    el('game-tilt').textContent = `${Math.round(run.drone.gimbal)}°`;
    el('game-instrument-tilt').textContent = String(Math.round(run.drone.gimbal));
    el('game-position').textContent = `${Math.abs(run.drone.z) < 0.1 ? 'CENTER' : run.drone.z < 0 ? 'AHEAD' : 'BACK'} ${Math.abs(run.drone.z).toFixed(1)}`;
    const status = over ? run.endReason : paused ? reason : run.phase === 'takeoff' ? 'Taking off · course starts at hover' : 'Run in progress';
    if (el('game-status').textContent !== status) el('game-status').textContent = status;
    el('connection-status').textContent = source === 'keyboard' ? 'Keyboard · ready' : connectedPhone ? remote.ready ? 'Phone · ready' : 'Phone · enable controls' : 'Phone · pairing needed';
    el('game-beacon').hidden = !beaconInFrame(run);
    if (move && gate) {
      el('game-gate-number').textContent = `GATE ${String(gate.id + 1).padStart(2, '0')} / ${run.cleared} CLEARED`;
      el('game-move').textContent = move.label; el('game-move-symbol').textContent = move.symbol;
      el('game-key').textContent = source === 'phone' ? move.phone : move.key;
      el('game-hint').textContent = move.hint;
      const amount = move.photo ? Number(gate.captured) : Math.min(1, gate.evidence / (move.hover ? 1 : 0.25));
      el('game-move-progress').style.width = `${amount * 100}%`;
      el('game-requirement').textContent = gate.captured ? 'BEACON CAPTURED · CLEAR THE OPENING' : amount >= 1 ? 'MOVE REGISTERED · CLEAR THE OPENING' : 'COMPLETE THE MOVE + CLEAR THE OPENING';
      el('game-gate-distance').textContent = `${Math.max(0, Math.round(run.drone.z - gateZ(run, gate)))} m`;
    }
    el('game-overlay').hidden = !paused && !over;
    el('game-results').hidden = !over; el('game-ready-rules').hidden = !ready;
    el('game-prompt-eyebrow').textContent = over ? newBest ? 'NEW PERSONAL BEST' : 'FLIGHT COMPLETE' : ready ? 'THE CITY IS YOUR FLIGHT PATH' : 'TAKE A BREATHER';
    el('game-title').innerHTML = over ? `${run.score.toLocaleString()}<br><em>points banked.</em>` : ready ? 'Ready for<br><em>the rush?</em>' : 'Flight<br><em>on hold.</em>';
    el('game-prompt-copy').textContent = over ? run.endReason : ready ? 'An endless course. Your usual drone controls. Make the move and clear the gate to build your score.' : reason;
    el('result-gates').textContent = String(run.cleared); el('result-distance').textContent = `${Math.floor(run.distance)} m`; el('result-combo').textContent = String(run.bestCombo);
    const startButton = el<HTMLButtonElement>('game-start'); startButton.innerHTML = `${icon(over ? 'reset' : ready ? 'takeoff' : 'play')}<span>${over ? 'Fly again' : ready ? 'Launch run' : 'Resume run'}</span>`;
    startButton.disabled = !over && Boolean(startBlock());
    el('game-start-hint').textContent = source === 'phone' ? connectedPhone && remote.ready ? 'Take off or resume from your phone' : 'Pair phone → Enable controls → Take off' : ready ? 'T to launch · Space to pause' : over ? 'Try again. The next flight is yours.' : 'Space to resume';
    const pauseButton = el<HTMLButtonElement>('game-pause'); pauseButton.disabled = ready || over;
    pauseButton.innerHTML = icon(paused ? 'play' : 'pause'); pauseButton.setAttribute('aria-label', paused ? 'Resume run' : 'Pause run'); pauseButton.setAttribute('aria-pressed', String(paused));
  }
  el('game-start').onclick = () => { if (run.phase === 'over') reset(); const result = start(); if (!result.ok) toast(result.message); };
  el('game-pause').onclick = togglePause; el('game-retry').onclick = reset;
  el<HTMLSelectElement>('source').onchange = event => { pause('Control source changed. Resume when ready.'); source = (event.target as HTMLSelectElement).value as typeof source; updateUI(); };
  el('game-guide').onclick = () => { pause('Game guide open. Close it to resume.'); el<HTMLDialogElement>('game-guide-dialog').showModal(); };
  el('game-guide-close').onclick = () => el<HTMLDialogElement>('game-guide-dialog').close();
  for (const id of ['pair-dialog', 'game-guide-dialog']) el<HTMLDialogElement>(id).addEventListener('close', () => {
    if (run.phase !== 'over') reason = run.phase === 'ready' ? 'Ready to launch' : source === 'phone' ? 'Enable phone controls, then resume.' : 'Run paused. Resume when ready.';
    updateUI();
  });
  const receive = (message: ServerMessage) => {
    if (message.type === 'connection') {
      const newlyPaired = message.connected && !connectedPhone; connectedPhone = message.connected; remote.reset(message.generation, message.ready);
      if (newlyPaired) { source = 'phone'; el<HTMLSelectElement>('source').value = source; }
      if (source === 'phone') pause(message.reason, false); updateUI();
    }
    if (message.type === 'input' && remote.accept(message.generation, message.seq, message.controls, performance.now()) && paused) updateUI();
    if (message.type === 'action') {
      if (message.generation !== remote.generation) return;
      const result = source === 'phone' && remote.fresh(performance.now()) ? perform(message.action) : { ok: false, message: 'Phone controls are paused.' };
      pairing?.send({ type: 'ack', generation: message.generation, id: message.id, ...result });
      if (!result.ok || message.action === 'capture') toast(result.message);
    }
  };
  pairing = new GamePairing(app, receive, pause, toast);
  bindFullscreen(el<HTMLButtonElement>('game-fullscreen'), app.querySelector<HTMLElement>('.rush-game')!, {
    onError: toast, expandWithinPage: true,
    onChange: active => { app.querySelector('.rush-game')!.classList.toggle('rush-fullscreen', active); el('game-fullscreen').innerHTML = icon(active ? 'minimize' : 'fullscreen'); el('game-fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Fullscreen'); },
  });
  window.addEventListener('blur', () => { if (source === 'keyboard' && run.phase !== 'over') pause('Laptop lost focus. Resume when ready.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause('Laptop page hidden. Resume when ready.'); });
  window.addEventListener('pagehide', () => { saveBestScore(run.score); pause('Game page closed.'); pairing?.close(); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  window.addEventListener('rush-context-lost', () => { graphicsLost = true; pause('Graphics context lost. Reload the page.'); });
  updateUI();
  // Rendering and keyboard play do not wait for the pairing service.
  void pairing.connect();
  let previous = performance.now(), accumulator = 0, lastStatus = 0, animationTime = 0;
  const frame = (now: number) => {
    const elapsed = now - previous; previous = now;
    if (elapsed > 250 && !paused) pause('Display stalled. Resume when ready.');
    if (!paused && source === 'phone' && !remote.fresh(now)) pause('Phone input expired. Enable controls again.');
    accumulator = paused ? 0 : Math.min(0.25, accumulator + elapsed / 1000);
    while (accumulator >= 1 / 60 && !paused) {
      const input = source === 'phone' ? remote.controls : keyboard.read();
      const events = stepRush(run, input, 1 / 60); accumulator -= 1 / 60; animationTime += 1000 / 60;
      for (const event of events) {
        el('game-feedback').textContent = event.message; el('game-feedback').dataset.kind = event.kind; feedbackUntil = now + 2400;
        if (event.kind === 'over') finish(event.message);
      }
    }
    if (now > feedbackUntil && el('game-feedback').textContent) el('game-feedback').textContent = '';
    world.update(run, Math.min(elapsed / 1000, 0.05), animationTime); world.render();
    if (now - lastStatus > 100) {
      lastStatus = now; updateUI();
      if (!paused && run.phase === 'running') {
        const move = nextRushGate(run)?.maneuver;
        reason = move ? `${move.label} · ${move.phone}` : 'Run in progress';
      }
      const s = run.drone, status: Telemetry = { altitude: Math.max(0, s.y - 0.065), heading: s.heading * 180 / Math.PI,
        speed: Math.hypot(s.vx, s.vz), gimbal: s.gimbal, mode: s.mode, paused, reason, captures,
        receiptToFrameMs: remote.fresh(now) ? Math.max(0, now - remote.receivedAt) : 0, lastInputSeq: remote.sequence };
      pairing?.send({ type: 'status', status });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
