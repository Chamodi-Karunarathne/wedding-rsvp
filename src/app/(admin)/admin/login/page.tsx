import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ next?: string }> };

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  // Only ever redirect to a path on this site: an absolute URL here would be
  // an open redirect.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';

  return (
    <main>
      <h1 className="text-xl font-semibold">Admin sign in</h1>
      <p className="mt-1 mb-4 text-sm text-gray-600">
        One shared password. There is no account to recover.
      </p>
      <LoginForm next={target} />
    </main>
  );
}
