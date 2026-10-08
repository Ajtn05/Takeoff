import {
  MAX_QUEUE_BYTES,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '../../shared/protocol';

export class TrainerSocket {
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = false;
  connected = false;
  constructor(
    private hello: { role: 'host' | 'controller'; sessionId: string; token: string },
    private onMessage: (message: ServerMessage) => void,
    private onDisconnect: (reason: string) => void,
  ) {
    this.connect();
  }
  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
    );
    this.socket = ws;
    ws.addEventListener('open', () => {
      if (this.stopped) return;
      this.connected = true;
      this.send({ type: 'hello', ...this.hello, version: PROTOCOL_VERSION });
    });
    ws.addEventListener('message', (event) => {
      if (this.stopped) return;
      try {
        this.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        ws.close(4002, 'Invalid server response');
      }
    });
    ws.addEventListener('close', (event) => {
      if (this.stopped) return;
      this.connected = false;
      this.onDisconnect(event.reason || 'Connection lost. Reconnecting…');
      if (!this.stopped && event.code !== 4001 && event.code !== 4003)
        this.retry = setTimeout(() => this.connect(), 1000);
    });
  }
  send(message: ClientMessage): boolean {
    if (this.stopped) return false;
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > MAX_QUEUE_BYTES) {
      ws.close(4008, 'Connection stalled');
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  }
  close(): void {
    this.stopped = true;
    this.connected = false;
    clearTimeout(this.retry);
    this.socket?.close();
  }
}
