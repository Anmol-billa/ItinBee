import React from 'react';
import type { Metadata } from 'next';
import { TrunkCorners } from '@/components/world/TrunkCorners';
import { LoginClient } from '@/features/auth/LoginClient';

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to Itinbee with a 6-digit email code or Google. Your guest drafts merge automatically into your account.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const nextPath = first(sp.next);
  const email = first(sp.email);
  const code = first(sp.code);

  return (
    <section className="trunk-ground trunk-frame relative isolate min-h-[calc(100dvh-64px)] overflow-x-hidden px-5 py-10 md:px-8 md:py-14">
      <TrunkCorners />
      <div className="relative z-10">
        <LoginClient nextPath={nextPath} initialEmail={email} initialCode={code} />
      </div>
    </section>
  );
}
