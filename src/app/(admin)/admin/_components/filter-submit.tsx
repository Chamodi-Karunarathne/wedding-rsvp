'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function FilterSubmit({ label = 'Show guests' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Updating…' : label}
    </Button>
  );
}
