type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function bindFullscreen(
  button: HTMLButtonElement,
  target: FullscreenElement,
  options: {
    onError: (message: string) => void;
    expandWithinPage?: boolean;
    onChange?: (active: boolean, expanded: boolean) => void;
  },
): void {
  const doc = document as FullscreenDocument;
  let expanded = false;
  const nativeActive = () => (doc.fullscreenElement ?? doc.webkitFullscreenElement) === target;
  const update = () => {
    const active = nativeActive() || expanded;
    target.classList.toggle('is-fullscreen', active);
    target.classList.toggle('is-expanded', expanded);
    if (options.onChange) options.onChange(active, expanded);
    else
      button.textContent = active
        ? expanded
          ? 'Exit expanded view'
          : 'Exit fullscreen'
        : 'Fullscreen';
    button.setAttribute('aria-pressed', String(active));
  };
  const expand = () => {
    if (options.expandWithinPage) {
      expanded = true;
      update();
      options.onError('Expanded view. Browser fullscreen is unavailable here.');
    } else options.onError('Fullscreen is unavailable in this browser.');
  };
  button.onclick = async () => {
    if (expanded) {
      expanded = false;
      update();
      return;
    }
    button.disabled = true;
    try {
      if (nativeActive()) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (target.requestFullscreen && doc.fullscreenEnabled) {
        await target.requestFullscreen();
      } else if (target.webkitRequestFullscreen && doc.webkitFullscreenEnabled !== false) {
        await target.webkitRequestFullscreen();
      } else expand();
      update();
    } catch {
      expand();
    } finally {
      button.disabled = false;
    }
  };
  doc.addEventListener('fullscreenchange', update);
  doc.addEventListener('webkitfullscreenchange', update);
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expanded) {
      expanded = false;
      update();
    }
  });
  update();
}
