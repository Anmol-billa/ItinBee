import React from 'react';
import { notFound } from 'next/navigation';
import { WorkbenchClient } from '@/components/workbench/WorkbenchClient';
import { fetchTripWorkspace } from '@/lib/api-client';

interface TripPageProps {
  params: Promise<{ id: string }>;
}

export default async function TripWorkspacePage({ params }: TripPageProps) {
  const { id } = await params;
  const workspace = await fetchTripWorkspace(id);
  if (!workspace) {
    notFound();
  }

  return <WorkbenchClient initialWorkspace={workspace} mode="cloud-trip" />;
}
