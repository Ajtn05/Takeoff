export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((markup, part, index) => markup + part + (values[index] ?? ''), '');
}
