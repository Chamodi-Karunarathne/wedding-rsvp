import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';
import { adminReturnPath } from '@/lib/domain/redirect';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ next?: string | string[] }> };

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const target = adminReturnPath(next);
  return (
    <div className="admin-login">
      <Card>
        <CardHeader>
          <p className="admin-eyebrow">Welcome, family</p>
          <CardTitle>
            <h1 className="text-2xl">Your wedding, together</h1>
          </CardTitle>
          <CardDescription>
            Sign in to send invitations, record replies and help with the guest list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <LoginForm next={target} />
          <p className="text-center text-xs text-muted-foreground">
            Use the family’s shared password. If you need it, ask the couple.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
