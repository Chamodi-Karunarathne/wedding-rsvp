import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The entire site is private: guest pages, admin pages and API alike.
        // Applied here rather than in the proxy so it also covers responses
        // that the proxy does not run for.
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          // Guest URLs contain the invitation token. Without this, clicking the
          // venue map link would leak that token to a third party in Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        // Card artwork. Immutable is safe here ONLY because every reference
        // carries the content hash that assets:optimize stamps into
        // public/card/manifest.json - a re-export under the same filename
        // changes the version, and therefore the URL. Referencing a bare
        // /card/thing.svg would pin that file in caches for a year.
        source: '/card/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
