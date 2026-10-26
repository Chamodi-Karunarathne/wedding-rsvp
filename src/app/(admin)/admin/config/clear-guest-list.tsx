'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Feedback } from '../_components/ui';
import { postJson } from '../_components/api';

export function ClearGuestList({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function clear(event: React.FormEvent) {
    event.preventDefault();
    if (busy || confirmation !== 'DELETE ALL GUESTS') return;
    setBusy(true);
    setError(null);
    const result = await postJson('/api/admin/guests/clear', { confirmation, expectedCount: count });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      router.refresh();
      return;
    }
    setSuccess(`${Number(result.data.deleted)} households removed.`);
    setOpen(false);
    setConfirmation('');
    router.refresh();
  }

  return (
    <details className="admin-disclosure" id="data-maintenance">
      <summary>Advanced data maintenance</summary>
      <div className="admin-disclosure-body space-y-4">
        <p className="text-sm text-muted-foreground">Remove the complete guest list and its response and delivery records. Wedding details and message templates are kept.</p>
        <Feedback success={success} />
        <Dialog open={open} onOpenChange={next => {
          if (busy) return;
          setOpen(next);
          setError(null);
          setConfirmation('');
        }}>
          <DialogTrigger render={<Button variant="destructive" disabled={count === 0} />}>Clear all guests</DialogTrigger>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>Clear the entire guest list?</DialogTitle>
              <DialogDescription>This permanently removes {count} households and their invitations, responses, history, messages, link opens and sending records. Shared guest links will stop working.</DialogDescription>
            </DialogHeader>
            <form onSubmit={clear} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="clear-guests-confirmation">Type DELETE ALL GUESTS to confirm</Label>
                <Input id="clear-guests-confirmation" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
              </div>
              <Feedback error={error} />
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={busy || confirmation !== 'DELETE ALL GUESTS' || count === 0}>{busy ? 'Clearing guests…' : `Delete ${count} households`}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </details>
  );
}
