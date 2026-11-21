'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCheck } from 'lucide-react';
import {
  AUTH_CHANGE_EVENT,
  fetchCurrentSession,
  readCachedUser,
  type AuthUser,
} from '@/lib/auth-client';

export function AuthNavLink({ mobile = false }: { mobile?: boolean }) {
  const [signedInUser, setSignedInUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const sync = () => {
      const cached = readCachedUser();
      if (cached && !cached.guest) {
        setSignedInUser(cached);
      } else {
        setSignedInUser(null);
      }
    };

    sync();
    void fetchCurrentSession().then((session) => {
      if (session.user && !session.guest) {
        setSignedInUser(session.user);
      } else {
        setSignedInUser(null);
      }
    });

    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (signedInUser) {
    const label = signedInUser.displayName.split(/\s+/)[0] || 'Account';
    return (
      <Link
        href="/account"
        className={
          mobile
            ? 'inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 py-3 text-base font-semibold text-paper hover:bg-paper/10'
            : 'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-3.5 py-2 text-[15px] font-semibold text-paper/90 transition-colors hover:bg-paper/10 hover:text-paper'
        }
      >
        <UserCheck size={16} strokeWidth={2.25} aria-hidden="true" className="text-saffron" />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={
        mobile
          ? 'rounded-md px-3 py-3 text-base font-semibold text-paper hover:bg-paper/10'
          : 'inline-flex min-h-[44px] items-center rounded-md px-3.5 py-2 text-[15px] font-semibold text-paper/90 transition-colors hover:bg-paper/10 hover:text-paper'
      }
    >
      Sign in
    </Link>
  );
}
