import { scriptOf } from './script.ts';

/** Static image identity changes when the shared invitation artwork changes. */
export const INVITATION_IMAGE_ID = 'invitation-v2';

/** Satori's vendored static font covers Latin; do not render missing glyphs. */
export function invitationPreviewName(
  guest: { cardName: string; displayName: string } | null,
): string {
  if (!guest) return '';
  for (const name of [guest.cardName, guest.displayName]) {
    const trimmed = name.trim();
    if (trimmed !== '' && scriptOf(trimmed) === 'latin') return trimmed;
  }
  return '';
}

/** Leave enough room for the full address, including unusually long names. */
export function invitationPreviewNameSize(name: string): number {
  const length = Array.from(name).length;
  if (length > 200) return 20;
  if (length > 110) return 25;
  if (length > 65) return 31;
  if (length > 38) return 37;
  return 45;
}
