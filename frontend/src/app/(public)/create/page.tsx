import React from 'react';
import type { Metadata } from 'next';
import { CreateFlowClient } from '@/features/create/CreateFlowClient';
import { warmBackendQuietly } from '@/lib/backend-origin';

export const metadata: Metadata = {
  title: 'Create an itinerary',
  description:
    'Type a sentence, paste a WhatsApp chat or drop a ticket PDF. Itinbee maps your stops and builds an editable day-by-day itinerary.',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function CreatePage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === 'production') {
    void warmBackendQuietly();
  }
  const sp = await searchParams;
  const q = first(sp.q);
  const base = first(sp.base);
  const attach = first(sp.attach) === '1';
  const job = first(sp.job);

  return (
    <CreateFlowClient
      initialQuery={q}
      initialBaseSlug={base}
      initialAttach={attach}
      initialJobId={job}
    />
  );
}
