export class TouchStick {
  private pointer: number | null = null;
  private value = { x: 0, y: 0 };
  constructor(
    private area: HTMLElement,
    private knob: HTMLElement,
    private onChange: (x: number, y: number) => void,
    enabled: () => boolean,
  ) {
    area.addEventListener('pointerdown', (event) => {
      if (!enabled() || this.pointer !== null) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      area.setPointerCapture(event.pointerId);
      this.move(event);
    });
    area.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.pointer) this.move(event);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId === this.pointer) this.clear();
    };
    area.addEventListener('pointerup', release);
    area.addEventListener('pointercancel', release);
    area.addEventListener('lostpointercapture', release);
    area.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  private move(event: PointerEvent): void {
    const rect = this.area.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) * 0.34;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (rect.top + rect.height / 2 - event.clientY) / radius;
    const distance = Math.hypot(x, y);
    if (distance > 1) {
      x /= distance;
      y /= distance;
    }
    this.knob.style.transform = `translate(${x * radius}px, ${-y * radius}px)`;
    const strength = Math.min(1, Math.max(0, (Math.min(distance, 1) - 0.07) / 0.93));
    const response = strength * strength;
    this.value = {
      x: distance === 0 ? 0 : (x / Math.min(distance, 1)) * response,
      y: distance === 0 ? 0 : (y / Math.min(distance, 1)) * response,
    };
    this.onChange(this.value.x, this.value.y);
  }
  clear(): void {
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer !== null && this.area.hasPointerCapture(pointer))
      this.area.releasePointerCapture(pointer);
    this.knob.style.transform = 'translate(0, 0)';
    this.value = { x: 0, y: 0 };
    this.onChange(0, 0);
  }
}
