import { copyFor } from '@/lib/copy';

/*
 * Root not-found. Lives outside the (guest) route group so that deleting the
 * guest UI does not take it with it. Reached by an unknown invitation token.
 */

export default function NotFound() {
  const copy = copyFor('en');
  return (
    <main>
      <h1 className="text-xl font-semibold">{copy.notFound.heading}</h1>
      <p className="mt-2">{copy.notFound.body}</p>
    </main>
  );
}
