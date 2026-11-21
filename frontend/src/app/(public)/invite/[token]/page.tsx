import React from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { InviteAcceptClient } from '@/features/group/InviteAcceptClient';
import { fetchInvitePreview } from '@/lib/api-client';

type Params = Promise<{ token: string }>;

export const metadata: Metadata = {
  title: 'Join Shared Trip',
  robots: { index: false, follow: false },
};

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const preview = await fetchInvitePreview(token, {
    cookieHeader: cookieHeader || undefined,
  });

  return (
    <div className="trunk-ground-flat min-h-[75vh]">
      <InviteAcceptClient token={token} initialInvite={preview} />
    </div>
  );
}
