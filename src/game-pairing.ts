import QRCode from 'qrcode';
import type { ClientMessage, ServerMessage, SessionInfo } from '../shared/protocol';
import { TrainerSocket } from './socket';

export const gamePairingMarkup = () => `<dialog id="pair-dialog"><div class="dialog-header"><h2>Pair phone</h2><button id="close-pair" class="icon-button" aria-label="Close pairing">×</button></div><p>Use your usual stick mode for Flight Rush. Keep this laptop page open.</p><label class="connection-choice">Connection <select id="connection-path" aria-label="Connection path" disabled></select></label><div id="usb-setup" class="usb-setup" hidden><button id="connect-usb" class="button primary">Connect USB phone</button><p id="usb-status" role="status">Connect a data cable and allow USB debugging on your phone.</p></div><div class="qr-wrap"><canvas id="qr" aria-label="Phone pairing QR code" hidden></canvas></div><label class="url-label">Open on phone<input id="pair-url" readonly aria-label="Controller pairing URL"></label><button id="copy-pair-url" class="button quiet" disabled>Copy phone link</button><p id="pair-instructions" class="pair-instructions"></p><div class="pair-actions"><button id="revoke" class="button danger">Revoke phone & renew link</button><span id="pair-state">Waiting for a phone</span></div></dialog>`;

export class GamePairing {
  private socket?: TrainerSocket;
  private session?: SessionInfo;
  private el: <T extends HTMLElement = HTMLElement>(id: string) => T;
  constructor(root: HTMLElement, private receive: (message: ServerMessage) => void,
    private pause: (reason: string, notify?: boolean) => void, private toast: (message: string) => void) {
    this.el = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    this.el('pair').onclick = () => { pause('Pair your phone, then enable controls to fly.'); this.el<HTMLDialogElement>('pair-dialog').showModal(); };
    this.el('close-pair').onclick = () => this.el<HTMLDialogElement>('pair-dialog').close();
    this.el<HTMLSelectElement>('connection-path').onchange = () => void this.updateLink();
    this.el('copy-pair-url').onclick = async () => {
      const input = this.el<HTMLInputElement>('pair-url');
      try { await navigator.clipboard.writeText(input.value); toast('Phone link copied.'); }
      catch { input.focus(); input.select(); toast('Select and copy the phone link.'); }
    };
    this.el('revoke').onclick = async () => {
      const button = this.el<HTMLButtonElement>('revoke'); button.disabled = true;
      pause('Phone link renewed. Enable controls on the paired phone.');
      await this.connect(); button.disabled = false;
    };
    this.el('connect-usb').onclick = async () => {
      if (!this.session) return;
      const button = this.el<HTMLButtonElement>('connect-usb'); button.disabled = true;
      this.el('usb-status').textContent = 'Checking your USB phone…';
      try {
        const response = await fetch('/api/usb', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.session.hostToken}` }, body: JSON.stringify({ sessionId: this.session.sessionId }) });
        const result = await response.json() as { message?: string; error?: string };
        this.el('usb-status').textContent = result.message ?? result.error ?? 'USB setup failed. Try again.';
      } catch { this.el('usb-status').textContent = 'Server unavailable. Try again.'; }
      finally { button.disabled = false; }
    };
  }
  send(message: ClientMessage): void { this.socket?.send(message); }
  close(): void { this.socket?.close(); }
  private async updateLink(): Promise<void> {
    if (!this.session) return;
    const value = this.el<HTMLSelectElement>('connection-path').value, info = this.session;
    const url = value === 'wireless' ? info.publicUrl : value === 'usb' ? info.usbUrl : info.lanUrls[Number(value)];
    if (!url) return;
    this.el<HTMLInputElement>('pair-url').value = url; this.el('usb-setup').hidden = value !== 'usb';
    await QRCode.toCanvas(this.el<HTMLCanvasElement>('qr'), url, { width: 208, margin: 2, color: { dark: '#152c31', light: '#ffffff' } });
    this.el('qr').hidden = false; this.el<HTMLButtonElement>('copy-pair-url').disabled = false;
    this.el('pair-instructions').textContent = value === 'usb'
      ? 'Connect USB phone before opening the link. Rotate your phone to landscape, enable controls, and close this dialog. Take off starts the run.'
      : 'Open the link on your phone, rotate to landscape, and enable controls. Close this dialog. Take off starts the run. Keep both pages open.';
  }
  async connect(): Promise<void> {
    this.socket?.send({ type: 'revoke' }); this.socket?.close(); this.socket = undefined; this.session = undefined;
    this.receive({ type: 'connection', connected: false, ready: false, generation: -1, reason: 'Phone pairing reset.' });
    const path = this.el<HTMLSelectElement>('connection-path'); path.replaceChildren(); path.disabled = true;
    this.el('qr').hidden = this.el('usb-setup').hidden = true;
    this.el<HTMLInputElement>('pair-url').value = ''; this.el<HTMLButtonElement>('copy-pair-url').disabled = true;
    try {
      const response = await fetch('/api/session', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Phone pairing is unavailable.');
      const info = result as SessionInfo; this.session = info;
      if (info.publicUrl) path.add(new Option('Wireless · Wi-Fi or mobile data', 'wireless'));
      if (info.usbUrl) path.add(new Option('USB cable · no Wi-Fi', 'usb'));
      info.lanUrls.forEach((url, i) => path.add(new Option(`Wi-Fi · ${new URL(url).hostname}`, String(i))));
      path.disabled = false; this.el('revoke').textContent = 'Revoke phone & renew link';
      this.socket = new TrainerSocket({ role: 'host', sessionId: info.sessionId, token: info.hostToken }, message => {
        if (message.type === 'connection') this.el('pair-state').textContent = message.connected ? message.ready ? 'Phone ready' : 'Phone paired' : 'Waiting for a phone';
        this.receive(message);
      }, reason => {
        this.receive({ type: 'connection', connected: false, ready: false, generation: -1, reason });
        this.pause(reason, false);
      });
      await this.updateLink();
    } catch (error) {
      this.el('pair-state').textContent = 'Pairing unavailable'; this.el('revoke').textContent = 'Retry pairing';
      this.el('pair-instructions').textContent = error instanceof Error ? error.message : 'Phone pairing is unavailable. Try again.';
      this.toast('Phone pairing unavailable. Keyboard controls are ready.');
    }
  }
}
