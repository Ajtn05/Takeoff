import { GENERIC_PROFILE, type AircraftType, type FlightProfile } from './simulation';

export const FLIGHT_PARAMETERS = [
  {
    key: 'speed',
    label: 'Horizontal speed',
    unit: 'm/s',
    min: 1,
    max: 100,
    step: 0.5,
    hint: 'Maximum speed with full movement input. The F1 car reaches 85 m/s.',
  },
  {
    key: 'climbRate',
    label: 'Climb speed',
    unit: 'm/s',
    min: 0.5,
    max: 15,
    step: 0.5,
    hint: 'Maximum climb speed after automatic takeoff.',
  },
  {
    key: 'descentRate',
    label: 'Descent speed',
    unit: 'm/s',
    min: 0.5,
    max: 15,
    step: 0.5,
    hint: 'Maximum manual descent speed. Automatic landing stays gentle.',
  },
  {
    key: 'yawRate',
    label: 'Turn speed',
    unit: '°/s',
    min: 15,
    max: 180,
    step: 5,
    hint: 'How fast the drone turns with full heading input.',
  },
  {
    key: 'acceleration',
    label: 'Acceleration',
    unit: 'm/s²',
    min: 0.5,
    max: 25,
    step: 0.5,
    hint: 'Lower values build speed more gradually.',
  },
  {
    key: 'braking',
    label: 'Braking',
    unit: 'm/s²',
    min: 0.5,
    max: 30,
    step: 0.5,
    hint: 'Higher values stop sooner when you release the controls.',
  },
  {
    key: 'gimbalRate',
    label: 'Camera tilt speed',
    unit: '°/s',
    min: 5,
    max: 100,
    step: 5,
    hint: 'How fast R / F or the phone tilt buttons move the camera.',
  },
  {
    key: 'fov',
    label: 'Camera field of view',
    unit: '° vertical',
    min: 30,
    max: 100,
    step: 1,
    hint: 'Wider angles show more of the scene.',
  },
] as const;
export type FlightParameter = (typeof FLIGHT_PARAMETERS)[number]['key'];

// DJI speeds are published limits; handling rates and the helicopter are simulator estimates.
export const DRONE_PRESETS = [
  {
    id: 'generic',
    name: 'Takeoff trainer',
    aircraftType: 'quadcopter',
    description: 'Balanced assisted flight for practice.',
    source: undefined,
    profile: { ...GENERIC_PROFILE },
  },
  {
    id: 'mini-4-pro',
    name: 'DJI Mini 4 Pro',
    aircraftType: 'quadcopter',
    description: 'Compact camera drone · published Sport speed limits.',
    source: 'https://www.dji.com/mini-4-pro/specs',
    profile: {
      ...GENERIC_PROFILE,
      speed: 16,
      climbRate: 5,
      descentRate: 5,
      yawRate: Math.PI / 2,
      acceleration: 4,
      braking: 6,
    },
  },
  {
    id: 'air-3',
    name: 'DJI Air 3',
    aircraftType: 'quadcopter',
    description: 'All-round camera drone · published maximum speed limits.',
    source: 'https://www.dji.com/air-3/specs',
    profile: {
      ...GENERIC_PROFILE,
      speed: 21,
      climbRate: 10,
      descentRate: 10,
      yawRate: Math.PI / 2,
      acceleration: 6,
      braking: 9,
    },
  },
  {
    id: 'mavic-3-classic',
    name: 'DJI Mavic 3 Classic',
    aircraftType: 'quadcopter',
    description: 'Larger camera drone · published maximum speed limits.',
    source: 'https://www.dji.com/mavic-3-classic/specs',
    profile: {
      ...GENERIC_PROFILE,
      speed: 21,
      climbRate: 8,
      descentRate: 6,
      yawRate: Math.PI / 3,
      acceleration: 5,
      braking: 8,
    },
  },
  {
    id: 'tracking-helicopter',
    name: 'Tracking helicopter',
    aircraftType: 'helicopter',
    source: undefined,
    description:
      '90 m/s (324 km/h) · fast assisted flight for following the F1 car. Larger rotor clearance; simulator handling.',
    profile: {
      ...GENERIC_PROFILE,
      speed: 90,
      climbRate: 15,
      descentRate: 10,
      yawRate: (Math.PI * 2) / 3,
      acceleration: 20,
      braking: 25,
    },
  },
] as const;

export type DroneSettings = {
  presetId: string;
  aircraftType: AircraftType;
  profile: FlightProfile;
};
export const PROFILE_STORAGE_KEY = 'trainer-drone-v1';
export const defaultDroneSettings = (): DroneSettings => ({
  presetId: 'generic',
  aircraftType: 'quadcopter',
  profile: { ...GENERIC_PROFILE },
});
export const displayParameter = (key: FlightParameter, value: number): number =>
  key === 'yawRate' ? (value * 180) / Math.PI : value;
export const storeParameter = (key: FlightParameter, value: number): number =>
  key === 'yawRate' ? (value * Math.PI) / 180 : value;
export function presetForProfile(profile: FlightProfile, aircraftType?: AircraftType): string {
  return (
    DRONE_PRESETS.find(
      (preset) =>
        (!aircraftType || preset.aircraftType === aircraftType) &&
        Object.keys(GENERIC_PROFILE).every(
          (key) =>
            Math.abs(
              profile[key as keyof FlightProfile] - preset.profile[key as keyof FlightProfile],
            ) < 1e-6,
        ),
    )?.id ?? 'custom'
  );
}
export function parseDroneSettings(raw: string | null): DroneSettings {
  try {
    const saved = JSON.parse(raw ?? 'null') as DroneSettings | null;
    if (!saved?.profile) return defaultDroneSettings();
    const profile = { ...GENERIC_PROFILE };
    for (const field of FLIGHT_PARAMETERS) {
      const value = saved.profile[field.key];
      const display = displayParameter(field.key, value);
      if (
        typeof value !== 'number' ||
        !Number.isFinite(display) ||
        display < field.min ||
        display > field.max
      )
        return defaultDroneSettings();
      profile[field.key] = value;
    }
    if (
      saved.aircraftType !== undefined &&
      saved.aircraftType !== 'quadcopter' &&
      saved.aircraftType !== 'helicopter'
    )
      return defaultDroneSettings();
    const aircraftType =
      saved.aircraftType ??
      DRONE_PRESETS.find((preset) => preset.id === presetForProfile(profile))?.aircraftType ??
      'quadcopter';
    return { presetId: presetForProfile(profile, aircraftType), aircraftType, profile };
  } catch {
    return defaultDroneSettings();
  }
}
