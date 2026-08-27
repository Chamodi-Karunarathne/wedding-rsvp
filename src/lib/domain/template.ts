/**
 * PERMANENT. Pure, dependency-free, and unit tested.
 *
 * Fills {{placeholders}}. Unknown ones are left alone, so a typo in an
 * admin-edited template shows up as literal {{nmae}} rather than a blank.
 *
 * It lives in its own module, with no imports, for one specific reason: both
 * the admin message template and the guest copy bundle need it, and the copy
 * bundle is passed into a Client Component. Anything it imports is dragged
 * into the client bundle with it - domain/config reads process.env at module
 * load, and has no business being there.
 */
export function renderTemplate(
  template: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
