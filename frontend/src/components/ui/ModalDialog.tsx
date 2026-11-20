'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export function ModalDialog({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-md',
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    // Fallback for browsers without declarative <dialog closedby="any"> support (e.g. Safari)
    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      cleanupFallback = () => dialog.removeEventListener('click', handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${maxWidthClass} rounded-xl border border-line bg-canvas-elevated p-0 text-ink shadow-dialog`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id={titleId} className="text-body font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close dialog"
          className="icon-hit inline-flex items-center justify-center rounded-md p-1 text-ink-secondary transition-colors hover:bg-canvas-subtle hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
