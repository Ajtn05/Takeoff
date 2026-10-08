import type { Controls } from '../../shared/protocol';

export type StickMode = '1' | '2' | '3';
export type StickSide = 'left' | 'right';
type FlightAxis = Exclude<keyof Controls, 'gimbal'>;

export const STICK_AXES: Record<FlightAxis, { label: string; positive: string; negative: string }> =
  {
    climb: { label: 'Throttle', positive: 'Climb', negative: 'Descend' },
    yaw: { label: 'Yaw', positive: 'Turn right', negative: 'Turn left' },
    forward: { label: 'Pitch', positive: 'Forward', negative: 'Backward' },
    right: { label: 'Roll', positive: 'Move right', negative: 'Move left' },
  };

// DJI's controller layouts. The simulator uses climb and velocity commands
// for throttle, pitch and roll; these are not motor or attitude commands.
export const STICK_MODES: Record<
  StickMode,
  Record<StickSide, { horizontal: FlightAxis; vertical: FlightAxis }>
> = {
  '1': {
    left: { horizontal: 'yaw', vertical: 'forward' },
    right: { horizontal: 'right', vertical: 'climb' },
  },
  '2': {
    left: { horizontal: 'yaw', vertical: 'climb' },
    right: { horizontal: 'right', vertical: 'forward' },
  },
  '3': {
    left: { horizontal: 'right', vertical: 'forward' },
    right: { horizontal: 'yaw', vertical: 'climb' },
  },
};

export const parseStickMode = (value: string | null): StickMode =>
  value === '1' || value === '3' ? value : '2';

export function stickInput(
  mode: StickMode,
  side: StickSide,
  x: number,
  y: number,
): Partial<Controls> {
  const axes = STICK_MODES[mode][side];
  return { [axes.horizontal]: x, [axes.vertical]: y };
}

export function stickReadout(mode: StickMode, side: StickSide, x = 0, y = 0): string {
  const axes = STICK_MODES[mode][side];
  return `${STICK_AXES[axes.horizontal].label.toUpperCase()} ${Math.round(x * 100)}% · ${STICK_AXES[axes.vertical].label.toUpperCase()} ${Math.round(y * 100)}%`;
}
