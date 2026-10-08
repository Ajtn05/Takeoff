export const FLIGHT_STEP_SECONDS = 1 / 60;
export const MAX_FRAME_MS = 250;
export const STATUS_INTERVAL_MS = 100;

export class FlightClock {
  private accumulator = 0;

  advance(elapsedMs: number, paused: boolean, step: (seconds: number) => boolean): void {
    if (paused) {
      this.accumulator = 0;
      return;
    }
    this.accumulator = Math.min(this.accumulator + elapsedMs / 1000, MAX_FRAME_MS / 1000);
    while (this.accumulator >= FLIGHT_STEP_SECONDS) {
      this.accumulator -= FLIGHT_STEP_SECONDS;
      if (!step(FLIGHT_STEP_SECONDS)) {
        this.accumulator = 0;
        break;
      }
    }
  }
}
