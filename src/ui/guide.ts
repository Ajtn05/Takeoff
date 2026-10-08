import { elementLookup } from './dom';

export function bindGuide(
  root: HTMLElement,
  pause: (reason: string) => void,
  pair: () => void,
): void {
  const getElement = elementLookup(root);
  const guide = getElement<HTMLDialogElement>('guide-dialog');
  getElement('guide').onclick = () => {
    pause('Guide open. Close it, then start practice to resume.');
    guide.showModal();
  };
  getElement('close-guide').onclick = () => guide.close();
  getElement('guide-pair').onclick = () => {
    guide.close();
    pair();
  };
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('.guide-tabs [role=tab]')];
  const activate = (tab: HTMLButtonElement) => {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      getElement(item.getAttribute('aria-controls')!).hidden = !selected;
    });
    getElement('guide-content').scrollTo(0, 0);
  };
  tabs.forEach((tab, index) => {
    tab.onclick = () => activate(tab);
    tab.onkeydown = (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) %
              tabs.length;
      activate(tabs[next]);
      tabs[next].focus();
    };
  });
}
