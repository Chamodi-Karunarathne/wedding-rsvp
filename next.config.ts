import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The entire site is private: guest pages, admin pages and API alike.
        // Applied here rather than in middleware so it also covers responses
        // that middleware does not run for.
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          // Guest URLs contain the invitation token. Without this, clicking the
          // venue map link would leak that token to a third party in Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
