import QRCode from 'qrcode';
import type { ClientMessage, ServerMessage, SessionInfo } from '../../shared/protocol';
import { HostSession } from './host-session';
import { elementLookup } from '../ui/dom';
import { html } from '../ui/markup';

type ConnectionPath = 'wireless' | 'usb' | 'lan';

export interface PairingCopy {
  description: string;
  openReason: string;
  renewReason: string;
  instructions: Record<ConnectionPath, string>;
}

interface PairingOptions {
  copy: PairingCopy;
  receive: (message: ServerMessage) => void;
  pause: (reason: string, notify?: boolean) => void;
  toast: (message: string) => void;
  unavailable?: (message: string) => void;
}

export function pairingDialog(copy: PairingCopy): string {
  return html`
    <dialog id="pair-dialog">
      <div class="dialog-header">
        <h2>Pair phone</h2>
        <button id="close-pair" class="icon-button" aria-label="Close pairing">×</button>
      </div>
      <p>${copy.description}</p>
      <label class="connection-choice">
        Connection
        <select id="connection-path" aria-label="Connection path" disabled></select>
      </label>
      <div id="usb-setup" class="usb-setup" hidden>
        <button id="connect-usb" class="button primary">Connect USB phone</button>
        <p id="usb-status" role="status">
          Connect a data cable and allow USB debugging on your phone.
        </p>
      </div>
      <div class="qr-wrap">
        <canvas id="qr" aria-label="Phone pairing QR code" hidden></canvas>
      </div>
      <label class="url-label">
        Open on phone
        <input id="pair-url" readonly aria-label="Controller pairing URL" />
      </label>
      <button id="copy-pair-url" class="button quiet" disabled>Copy phone link</button>
      <p id="pair-instructions" class="pair-instructions"></p>
      <div class="pair-actions">
        <button id="revoke" class="button danger">Revoke phone & renew link</button>
        <span id="pair-state">Waiting for a phone</span>
      </div>
    </dialog>
  `;
}

export class PhonePairing {
  private host: HostSession;
  private getElement: ReturnType<typeof elementLookup>;

  constructor(
    root: HTMLElement,
    private options: PairingOptions,
  ) {
    this.getElement = elementLookup(root);
    this.host = new HostSession({
      receive: (message) => this.receive(message),
      changed: (session) => this.updateSession(session),
      unavailable: (error) => this.showError(error),
    });
    this.getElement('pair').onclick = () => this.show();
    this.getElement('close-pair').onclick = () =>
      this.getElement<HTMLDialogElement>('pair-dialog').close();
    this.getElement<HTMLSelectElement>('connection-path').onchange = () => {
      this.host.selectPath(this.getElement<HTMLSelectElement>('connection-path').value);
      void this.updateLink().catch((error: unknown) => this.showError(error));
    };
    this.getElement('copy-pair-url').onclick = () => void this.copyLink();
    this.getElement('connect-usb').onclick = () => void this.connectUsb();
    this.getElement('revoke').onclick = async () => {
      const button = this.getElement<HTMLButtonElement>('revoke');
      button.disabled = true;
      this.options.pause(this.options.copy.renewReason);
      try {
        await this.host.connect(true);
      } finally {
        button.disabled = false;
      }
    };
  }

  show(): void {
    this.options.pause(this.options.copy.openReason);
    this.getElement<HTMLDialogElement>('pair-dialog').showModal();
  }

  send(message: ClientMessage): void {
    this.host.send(message);
  }

  close(): void {
    this.host.close();
  }

  connect(): Promise<void> {
    return this.host.connect();
  }

  private async copyLink(): Promise<void> {
    const input = this.getElement<HTMLInputElement>('pair-url');
    try {
      await navigator.clipboard.writeText(input.value);
      this.options.toast('Phone link copied.');
    } catch {
      input.focus();
      input.select();
      this.options.toast('Select and copy the phone link.');
    }
  }

  private async connectUsb(): Promise<void> {
    const session = this.host.session;
    if (!session) return;
    const button = this.getElement<HTMLButtonElement>('connect-usb');
    button.disabled = true;
    this.getElement('usb-status').textContent =
      'Checking the USB phone and setting up the cable connection…';
    try {
      const response = await fetch('/api/usb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.hostToken}`,
        },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      const result = (await response.json()) as { message?: string; error?: string };
      this.getElement('usb-status').textContent =
        result.message ?? result.error ?? 'USB setup failed. Try again.';
    } catch {
      this.getElement('usb-status').textContent =
        'Trainer unavailable. Restart it on the Mac and reload this page.';
    } finally {
      button.disabled = false;
    }
  }

  private async updateLink(): Promise<void> {
    const session = this.host.session;
    if (!session) return;
    const value = this.getElement<HTMLSelectElement>('connection-path').value;
    const path: ConnectionPath = value === 'wireless' || value === 'usb' ? value : 'lan';
    const url =
      path === 'wireless'
        ? session.publicUrl
        : path === 'usb'
          ? session.usbUrl
          : session.lanUrls[Number(value)];
    if (!url) return;

    this.getElement<HTMLInputElement>('pair-url').value = url;
    this.getElement('usb-setup').hidden = path !== 'usb';
    await QRCode.toCanvas(this.getElement<HTMLCanvasElement>('qr'), url, {
      width: 208,
      margin: 2,
      color: { dark: '#152c31', light: '#ffffff' },
    });
    this.getElement('qr').hidden = false;
    this.getElement<HTMLButtonElement>('copy-pair-url').disabled = false;
    this.getElement('pair-instructions').textContent = this.options.copy.instructions[path];
  }

  private receive(message: ServerMessage): void {
    if (message.type === 'connection') {
      this.getElement('pair-state').textContent = message.connected
        ? message.ready
          ? 'Phone ready'
          : 'Phone paired'
        : 'Waiting for a phone';
    }
    this.options.receive(message);
  }

  private async updateSession(session?: SessionInfo): Promise<void> {
    const path = this.getElement<HTMLSelectElement>('connection-path');
    path.replaceChildren();
    path.disabled = true;
    this.getElement('qr').hidden = true;
    this.getElement('usb-setup').hidden = true;
    this.getElement<HTMLInputElement>('pair-url').value = '';
    this.getElement<HTMLButtonElement>('copy-pair-url').disabled = true;

    if (!session) return;
    if (session.publicUrl) path.add(new Option('Wireless · Wi-Fi or mobile data', 'wireless'));
    if (session.usbUrl) path.add(new Option('USB cable · no Wi-Fi', 'usb'));
    session.lanUrls.forEach((url, index) => {
      path.add(new Option(`Wi-Fi · ${new URL(url).hostname}`, String(index)));
    });
    if (
      this.host.path &&
      Array.from(path.options).some((option) => option.value === this.host.path)
    )
      path.value = this.host.path;
    this.host.selectPath(path.value);
    path.disabled = false;
    this.getElement('revoke').textContent = 'Revoke phone & renew link';
    await this.updateLink();
  }

  private showError(error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'Phone pairing is unavailable. Try again.';
    this.getElement('pair-state').textContent = 'Pairing unavailable';
    this.getElement('revoke').textContent = 'Retry pairing';
    this.getElement('pair-instructions').textContent = message;
    this.options.unavailable?.(message);
    this.options.toast(message);
  }
}
