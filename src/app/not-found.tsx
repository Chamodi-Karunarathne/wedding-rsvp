import { copyFor } from '@/lib/copy';

/*
 * Root not-found. Lives outside the (guest) route group so that deleting the
 * guest UI does not take it with it. Reached by an unknown invitation token.
 */

export default function NotFound() {
  const copy = copyFor('en');
  return (
    // Carries its own column: this page sits outside (guest), so it does not
    // get that route group's layout.
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">{copy.notFound.heading}</h1>
      <p className="mt-2">{copy.notFound.body}</p>
    </main>
  );
}
