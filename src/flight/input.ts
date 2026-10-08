import { neutralControls, type Controls, INPUT_TIMEOUT_MS } from '../../shared/protocol';

export class RemoteInput {
  generation = -1;
  sequence = -1;
  receivedAt = -Infinity;
  ready = false;
  controls = neutralControls();
  reset(generation: number, ready = false): void {
    this.generation = generation;
    this.ready = ready;
    this.sequence = -1;
    this.receivedAt = -Infinity;
    this.controls = neutralControls();
  }
  accept(generation: number, sequence: number, controls: Controls, now: number): boolean {
    if (!this.ready || generation !== this.generation || sequence <= this.sequence) return false;
    this.sequence = sequence;
    this.receivedAt = now;
    this.controls = { ...controls };
    return true;
  }
  fresh(now: number): boolean {
    return this.ready && now - this.receivedAt <= INPUT_TIMEOUT_MS;
  }
}

export class KeyboardInput {
  private keys = new Set<string>();
  constructor(private onAction: (action: 'takeoff' | 'land' | 'capture' | 'pause') => void) {
    const controlKeys = new Set([
      'KeyW',
      'KeyS',
      'KeyA',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyR',
      'KeyF',
      'KeyT',
      'KeyL',
      'KeyC',
      'Space',
    ]);
    window.addEventListener('keydown', (event) => {
      if (
        event.defaultPrevented ||
        (event.target instanceof HTMLElement &&
          (event.target.closest('input, select, textarea, dialog') ||
            (event.code === 'Space' && event.target.closest('button, [role=separator]'))))
      )
        return;
      if (!controlKeys.has(event.code)) return;
      event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat) {
        const action = (
          { KeyT: 'takeoff', KeyL: 'land', KeyC: 'capture', Space: 'pause' } as const
        )[event.code as 'KeyT'];
        if (action) this.onAction(action);
      }
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => this.clear());
  }
  clear(): void {
    this.keys.clear();
  }
  read(): Controls {
    const axis = (positive: string, negative: string) =>
      Number(this.keys.has(positive)) - Number(this.keys.has(negative));
    return {
      climb: axis('KeyW', 'KeyS'),
      yaw: axis('KeyD', 'KeyA'),
      forward: axis('ArrowUp', 'ArrowDown'),
      right: axis('ArrowRight', 'ArrowLeft'),
      gimbal: axis('KeyR', 'KeyF'),
    };
  }
}
