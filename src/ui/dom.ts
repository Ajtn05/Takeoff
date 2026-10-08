export function requiredElement<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element is missing: ${selector}`);
  return element;
}

export function elementLookup(root: ParentNode) {
  const elements = new Map<string, HTMLElement>();
  return <T extends HTMLElement = HTMLElement>(id: string): T => {
    let element = elements.get(id);
    if (!element) {
      element = requiredElement(root, `#${id}`);
      elements.set(id, element);
    }
    return element as T;
  };
}
