import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { invitationPreviewName, invitationPreviewNameSize } from './og-invitation.ts';

describe('personal invitation preview name', () => {
  it('uses the same addressed name as the invitation, including a shorter Latin card name', () => {
    assert.equal(invitationPreviewName({ cardName: 'Mr. & Mrs. Perera', displayName: 'Mr. & Mrs. Rathnayake Perera and family' }), 'Mr. & Mrs. Perera');
  });

  it('uses a truthful Latin display name when the card name needs an unsupported script', () => {
    assert.equal(invitationPreviewName({ cardName: 'නිමල් පෙරේරා', displayName: 'Nimal Perera' }), 'Nimal Perera');
    assert.equal(invitationPreviewName({ cardName: 'Nimal Perera', displayName: 'නිමල් පෙරේරා' }), 'Nimal Perera');
  });

  it('uses generic copy for unsupported scripts and invalid links instead of broken glyphs', () => {
    assert.equal(invitationPreviewName({ cardName: 'නිමල් පෙරේරා', displayName: 'නිමල් පෙරේරා' }), '');
    assert.equal(invitationPreviewName({ cardName: 'நிமல்', displayName: 'நிமல்' }), '');
    assert.equal(invitationPreviewName(null), '');
  });

  it('scales long addresses without truncating their content', () => {
    const name = 'Mr. & Mrs. '.padEnd(300, 'Perera ');
    assert.equal(invitationPreviewName({ cardName: name, displayName: name }), name.trim());
    assert.ok(invitationPreviewNameSize(name) < invitationPreviewNameSize('Nimal Perera'));
    assert.equal(invitationPreviewNameSize(name), 20);
  });
});
