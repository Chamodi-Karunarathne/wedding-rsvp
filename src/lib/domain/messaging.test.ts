import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PLAIN_TEXT_TEMPLATE, messagingConfigSchema } from './config.ts';
import { renderTemplate } from './template.ts';

describe('channel message templates', () => {
  it('preserves an existing WhatsApp template when the new plain template is absent', () => {
    const value = messagingConfigSchema.parse({ whatsappTemplate: '*Dear {{name}}* 💍\n{{url}}' });
    assert.equal(value.whatsappTemplate, '*Dear {{name}}* 💍\n{{url}}');
    assert.equal(value.plainTextTemplate, DEFAULT_PLAIN_TEXT_TEMPLATE);
  });

  it('keeps channel templates independent while filling the same personal details', () => {
    const value = messagingConfigSchema.parse({
      whatsappTemplate: '*Hello {{name}}* 💍\n{{url}}',
      plainTextTemplate: 'Hello {{name}} 💍\n{{url}}',
    });
    const variables = { name: 'Guest family', url: 'https://example.com/i/token' };
    assert.equal(renderTemplate(value.whatsappTemplate, variables), '*Hello Guest family* 💍\nhttps://example.com/i/token');
    assert.equal(renderTemplate(value.plainTextTemplate, variables), 'Hello Guest family 💍\nhttps://example.com/i/token');
    assert.equal(messagingConfigSchema.safeParse({ whatsappTemplate: 'Hello', plainTextTemplate: '' }).success, false);
  });
});
