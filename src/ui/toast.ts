export function bindToast(element: HTMLElement): (message: string) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (message) => {
    element.textContent = message;
    element.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove('visible'), 3500);
  };
}
