'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { RiCloseLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, keepMounted = false, showCloseButton = true, ...props }:
  DialogPrimitive.Popup.Props & { keepMounted?: boolean; showCloseButton?: boolean }) {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => { setContainer(document.querySelector<HTMLElement>('.admin-shell') ?? document.body); }, []);
  if (!container) return null;
  return (
    <DialogPrimitive.Portal container={container} keepMounted={keepMounted}>
      <DialogPrimitive.Backdrop data-slot="dialog-overlay" className="admin-dialog-overlay" />
      <DialogPrimitive.Popup data-slot="dialog-content" className={cn('admin-dialog', className)} {...props}>
        <div className="admin-dialog-body">{children}</div>
        {showCloseButton && (
          <DialogPrimitive.Close className="admin-dialog-close" aria-label="Close dialog">
            <RiCloseLine size={20} aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('admin-dialog-header', className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('admin-dialog-footer', className)} {...props} />;
}
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('admin-dialog-title', className)} {...props} />;
}
function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('admin-dialog-description', className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose };
