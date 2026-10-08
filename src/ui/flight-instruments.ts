import type { Telemetry } from '../../shared/protocol';
import { elementLookup } from './dom';
import { setIconButton } from './icons';

const COMPASS_HEADINGS = [
  'North',
  'North east',
  'East',
  'South east',
  'South',
  'South west',
  'West',
  'North west',
];

interface InstrumentReadings {
  status: Telemetry;
  verticalSpeed: number;
  ceiling: number;
  speedLimit: number;
  source: 'keyboard' | 'phone';
  blocked: boolean;
  framed: boolean;
  fps: number;
}

export function bindFlightInstruments(root: HTMLElement): (readings: InstrumentReadings) => void {
  const getElement = elementLookup(root);
  return ({ status, verticalSpeed, ceiling, speedLimit, source, blocked, framed, fps }) => {
    getElement('altitude').innerHTML = `${status.altitude.toFixed(1)} <small>m</small>`;
    getElement('speed').innerHTML = `${status.speed.toFixed(1)} <small>m/s</small>`;
    getElement('heading').innerHTML =
      `${Math.round(status.heading).toString().padStart(3, '0')} <small>°</small>`;
    getElement('gimbal-value').innerHTML = `${Math.round(status.gimbal)} <small>°</small>`;
    getElement('heading').title = COMPASS_HEADINGS[Math.round(status.heading / 45) % 8];
    getElement('altitude-scale').style.width =
      `${Math.min(100, (status.altitude / ceiling) * 100)}%`;
    getElement('speed-scale').style.width = `${Math.min(100, (status.speed / speedLimit) * 100)}%`;
    getElement('vertical-speed').textContent =
      `${verticalSpeed >= 0 ? '+' : ''}${verticalSpeed.toFixed(1)}`;
    getElement<HTMLInputElement>('gimbal').value = String(status.gimbal);
    getElement<HTMLInputElement>('gimbal').disabled = source === 'phone';
    setIconButton(
      getElement<HTMLButtonElement>('pause'),
      status.paused ? 'play' : 'pause',
      status.paused ? 'Start practice' : 'Pause practice',
      `${status.paused ? 'Start practice' : 'Pause practice'} · Space`,
    );
    getElement('pause').setAttribute('aria-pressed', String(!status.paused));

    getElement<HTMLButtonElement>('pause').disabled = status.paused && blocked;
    const flightLabel =
      status.mode === 'collided'
        ? 'Collision'
        : status.paused
          ? 'Paused'
          : {
              grounded: 'Grounded',
              'taking-off': 'Taking off',
              flying: 'Flying',
              landing: 'Landing',
            }[status.mode];
    const statusBadge = getElement('flight-status');
    statusBadge.dataset.paused = String(status.paused);
    statusBadge.dataset.mode = status.mode;
    statusBadge.dataset.tooltip = `${flightLabel} · ${status.reason}`;
    if (getElement('flight-state').textContent !== flightLabel)
      getElement('flight-state').textContent = flightLabel;
    if (getElement('pause-reason').textContent !== status.reason)
      getElement('pause-reason').textContent = status.reason;
    getElement<HTMLButtonElement>('takeoff').disabled = status.mode !== 'grounded' || blocked;
    getElement<HTMLButtonElement>('land').disabled = status.paused || status.mode !== 'flying';
    getElement<HTMLButtonElement>('capture').disabled = status.paused || status.mode === 'collided';
    getElement('framing').title = framed ? 'Subject in frame' : 'Subject not framed';
    getElement('framing').setAttribute('aria-label', getElement('framing').title);
    getElement('framing').classList.toggle('framed', framed);
    getElement('performance').textContent =
      `${fps} FPS · 60 Hz simulation${source === 'phone' ? ` · receipt → frame ${Math.round(status.receiptToFrameMs)} ms` : ''}`;
  };
}
