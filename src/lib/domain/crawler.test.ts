import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCrawler } from './crawler.ts';

const androidBrowser = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const iosBrowser = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

describe('preview crawler detection', () => {
  it('allows real browser engines inside messaging apps', () => {
    for (const browser of [androidBrowser, iosBrowser]) {
      for (const suffix of ['', ' WhatsApp/2.24.20.0', ' Viber/23.0']) {
        assert.equal(isCrawler(browser + suffix), false);
      }
    }
  });

  it('continues to exclude preview clients and bot renderers even with browser engine markers', () => {
    for (const ua of [null, undefined, '', 'WhatsApp/2.24.20.0', 'Viber/23.0',
      'facebookexternalhit/1.1', 'TelegramBot (like TwitterBot)',
      androidBrowser + ' Googlebot/2.1', androidBrowser + ' HeadlessChrome/130.0.0.0',
      iosBrowser + ' WhatsApp/2.24 facebookexternalhit/1.1']) {
      assert.equal(isCrawler(ua), true);
    }
  });
});
