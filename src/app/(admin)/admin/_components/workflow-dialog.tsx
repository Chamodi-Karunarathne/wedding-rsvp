'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

/** Load optional workflows when first opened, then preserve their drafts. */
export function WorkflowDialog({ title, description, label, children, wide = false, className }:
  { title: string; description: string; label: string; children: ReactNode; wide?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) setLoaded(true); }}>
      <DialogTrigger render={<Button type="button" variant="outline" className={className} />}>{label}</DialogTrigger>
      <DialogContent keepMounted className={wide ? 'admin-dialog-wide' : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {loaded && children}
      </DialogContent>
    </Dialog>
  );
}
