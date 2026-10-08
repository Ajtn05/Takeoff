import {
  beaconInFrame,
  gateZ,
  multiplier,
  nextRushGate,
  runPace,
  type RushRun,
} from '../game/engine';
import { icon } from './icons';
import { elementLookup } from './dom';

interface GameViewState {
  run: RushRun;
  best: number;
  newBest: boolean;
  paused: boolean;
  reason: string;
  source: 'keyboard' | 'phone';
  connectedPhone: boolean;
  controlsReady: boolean;
  startBlocked: boolean;
}

export function bindGameView(root: HTMLElement): (state: GameViewState) => void {
  const getElement = elementLookup(root);
  return ({
    run,
    best,
    newBest,
    paused,
    reason,
    source,
    connectedPhone,
    controlsReady,
    startBlocked,
  }: GameViewState) => {
    const over = run.phase === 'over';
    const ready = run.phase === 'ready';
    const gate = nextRushGate(run);
    const move = gate?.maneuver;
    getElement('game-stage').dataset.phase = over
      ? 'over'
      : paused && !ready
        ? 'paused'
        : run.phase;
    getElement('game-score').textContent = run.score.toLocaleString();
    getElement('game-best').textContent = Math.max(best, run.score).toLocaleString();
    getElement('game-combo').innerHTML = `${run.combo} <small>×${multiplier(run)}</small>`;
    getElement('game-shields').textContent = Array.from({ length: 3 }, (_, i) =>
      i < run.shields ? '●' : '○',
    ).join(' ');
    getElement('game-shields').setAttribute('aria-label', `${run.shields} shields remaining`);
    getElement('game-level').textContent = String(run.level).padStart(2, '0');
    getElement('game-altitude').textContent = Math.max(0, run.drone.y - 0.065).toFixed(1);
    getElement('game-speed').textContent = runPace(run).toFixed(1);
    getElement('game-heading').textContent = String(
      Math.round((run.drone.heading * 180) / Math.PI) % 360,
    ).padStart(3, '0');
    getElement('game-distance').textContent = Math.floor(run.distance).toLocaleString();
    getElement('game-tilt').textContent = `${Math.round(run.drone.gimbal)}°`;
    getElement('game-instrument-tilt').textContent = String(Math.round(run.drone.gimbal));
    getElement('game-position').textContent =
      `${Math.abs(run.drone.z) < 0.1 ? 'CENTER' : run.drone.z < 0 ? 'AHEAD' : 'BACK'} ${Math.abs(run.drone.z).toFixed(1)}`;
    const status = over
      ? run.endReason
      : paused
        ? reason
        : run.phase === 'takeoff'
          ? 'Taking off · course starts at hover'
          : 'Run in progress';
    if (getElement('game-status').textContent !== status)
      getElement('game-status').textContent = status;
    getElement('connection-status').textContent =
      source === 'keyboard'
        ? 'Keyboard · ready'
        : connectedPhone
          ? controlsReady
            ? 'Phone · ready'
            : 'Phone · enable controls'
          : 'Phone · pairing needed';
    getElement('game-beacon').hidden = !beaconInFrame(run);
    if (move && gate) {
      getElement('game-gate-number').textContent =
        `GATE ${String(gate.id + 1).padStart(2, '0')} / ${run.cleared} CLEARED`;
      getElement('game-move').textContent = move.label;
      getElement('game-move-symbol').textContent = move.symbol;
      getElement('game-key').textContent = source === 'phone' ? move.phone : move.key;
      getElement('game-hint').textContent = move.hint;
      const amount = move.photo
        ? Number(gate.captured)
        : Math.min(1, gate.evidence / (move.hover ? 1 : 0.25));
      getElement('game-move-progress').style.width = `${amount * 100}%`;
      getElement('game-requirement').textContent = gate.captured
        ? 'BEACON CAPTURED · CLEAR THE OPENING'
        : amount >= 1
          ? 'MOVE REGISTERED · CLEAR THE OPENING'
          : 'COMPLETE THE MOVE + CLEAR THE OPENING';
      getElement('game-gate-distance').textContent =
        `${Math.max(0, Math.round(run.drone.z - gateZ(run, gate)))} m`;
    }
    getElement('game-overlay').hidden = !paused && !over;
    getElement('game-results').hidden = !over;
    getElement('game-ready-rules').hidden = !ready;
    getElement('game-prompt-eyebrow').textContent = over
      ? newBest
        ? 'NEW PERSONAL BEST'
        : 'FLIGHT COMPLETE'
      : ready
        ? 'THE CITY IS YOUR FLIGHT PATH'
        : 'TAKE A BREATHER';
    getElement('game-title').innerHTML = over
      ? `${run.score.toLocaleString()}<br><em>points banked.</em>`
      : ready
        ? 'Ready for<br><em>the rush?</em>'
        : 'Flight<br><em>on hold.</em>';
    getElement('game-prompt-copy').textContent = over
      ? run.endReason
      : ready
        ? 'An endless course. Your usual drone controls. Make the move and clear the gate to build your score.'
        : reason;
    getElement('result-gates').textContent = String(run.cleared);
    getElement('result-distance').textContent = `${Math.floor(run.distance)} m`;
    getElement('result-combo').textContent = String(run.bestCombo);
    const startButton = getElement<HTMLButtonElement>('game-start');
    startButton.innerHTML = `${icon(over ? 'reset' : ready ? 'takeoff' : 'play')}<span>${over ? 'Fly again' : ready ? 'Launch run' : 'Resume run'}</span>`;
    startButton.disabled = !over && startBlocked;
    getElement('game-start-hint').textContent =
      source === 'phone'
        ? connectedPhone && controlsReady
          ? 'Take off or resume from your phone'
          : 'Pair phone → Enable controls → Take off'
        : ready
          ? 'T to launch · Space to pause'
          : over
            ? 'Try again. The next flight is yours.'
            : 'Space to resume';
    const pauseButton = getElement<HTMLButtonElement>('game-pause');
    pauseButton.disabled = ready || over;
    pauseButton.innerHTML = icon(paused ? 'play' : 'pause');
    pauseButton.setAttribute('aria-label', paused ? 'Resume run' : 'Pause run');
    pauseButton.setAttribute('aria-pressed', String(paused));
  };
}
