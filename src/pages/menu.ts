import { menuMarkup } from '../ui/templates/menu';
import { readBestScore } from '../game/scores';
import { HostSession } from '../network/host-session';
import { STATUS_INTERVAL_MS } from '../flight/clock';
import type { Telemetry } from '../../shared/protocol';
import '../styles/game.css';

export function mount(app: HTMLElement): void {
  document.title = 'Takeoff · Choose your flight';
  app.innerHTML = menuMarkup(readBestScore());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  const reason = 'Choose Game or Practice tool on the laptop. Your phone stays paired.';
  const host = new HostSession({
    receive: (message) => {
      if (message.type === 'welcome' || (message.type === 'connection' && message.ready))
        host.send({ type: 'suspend', reason });
    },
    changed: () => {},
    unavailable: () => {},
  });
  if (!host.session) return;
  void host.connect();
  const status: Telemetry = {
    altitude: 0,
    heading: 0,
    speed: 0,
    gimbal: 0,
    mode: 'grounded',
    paused: true,
    reason,
    captures: 0,
    receiptToFrameMs: 0,
    lastInputSeq: -1,
  };
  const interval = setInterval(() => host.send({ type: 'status', status }), STATUS_INTERVAL_MS);
  window.addEventListener('pagehide', () => {
    clearInterval(interval);
    host.close();
  });
}
