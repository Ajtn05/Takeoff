import type { IconName } from './icons';

export const VIEW_LAYOUTS = [
  {
    id: 'split',
    label: 'Side by side',
    icon: 'split',
    description:
      'Observer and camera next to each other. Drag the divider to resize; focus it and use arrow keys for small adjustments. Narrow screens stack the views.',
  },
  {
    id: 'stacked',
    label: 'Stacked',
    icon: 'stacked',
    description: 'Observer above the camera. Drag the horizontal divider to resize.',
  },
  {
    id: 'camera',
    label: 'Camera only',
    icon: 'camera',
    description:
      'Practice framing through the drone camera. Flight instruments stay at the bottom.',
  },
  {
    id: 'observer',
    label: 'Observer only',
    icon: 'observer',
    description:
      'Use the whole workspace to watch the drone. Photo capture still uses the drone camera.',
  },
  {
    id: 'classic',
    label: 'Classic',
    icon: 'classic',
    description: 'Observer beside a camera sidebar, with instruments below the camera.',
  },
] as const satisfies readonly { id: string; label: string; icon: IconName; description: string }[];

export type ViewLayout = (typeof VIEW_LAYOUTS)[number]['id'];
