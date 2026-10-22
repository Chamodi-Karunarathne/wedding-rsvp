const ADMIN_PATH = '/admin';
const LOCAL_ORIGIN = 'https://wedding.invalid';

/** Keep login returns inside the admin console, using browser URL parsing. */
export function adminReturnPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/u.test(value)
  ) {
    return ADMIN_PATH;
  }

  try {
    const target = new URL(value, LOCAL_ORIGIN);
    if (
      target.origin !== LOCAL_ORIGIN ||
      (target.pathname !== ADMIN_PATH && !target.pathname.startsWith(ADMIN_PATH + '/')) ||
      target.pathname === '/admin/login'
    ) {
      return ADMIN_PATH;
    }
    return target.pathname + target.search + target.hash;
  } catch {
    return ADMIN_PATH;
  }
}
