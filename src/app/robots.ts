import type { MetadataRoute } from 'next';

/** The whole site is private. Nothing here should ever be indexed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
