import { elementLookup } from './dom';
import { bindGuide } from './guide';
import { bindDroneSettings, type DroneSettingsOptions } from './drone-settings';
import { guideDialog } from './templates/guide';
import { droneSettingsDialog } from './templates/drone-settings';

export const assistanceDialogs = (): string => guideDialog() + droneSettingsDialog();

export function bindAssistance(
  root: HTMLElement,
  options: DroneSettingsOptions & { pair: () => void },
): void {
  const getElement = elementLookup(root);
  bindGuide(root, options.pause, options.pair);
  bindDroneSettings(root, options);
  // Escape closes the topmost dialog without also leaving expanded fullscreen.
  for (const dialog of ['guide-dialog', 'drone-dialog', 'pair-dialog'].map((id) =>
    getElement<HTMLDialogElement>(id),
  )) {
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
  }
}
