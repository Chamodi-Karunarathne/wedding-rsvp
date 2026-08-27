import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<{ next?: string }> };

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  // Only ever redirect to a path on this site: an absolute URL here would be
  // an open redirect.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin';

  return (
    <div className="mx-auto max-w-sm pt-8">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Admin sign in</CardTitle>
          <CardDescription>One shared password. There is no account to recover.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={target} />
        </CardContent>
      </Card>
    </div>
  );
}
