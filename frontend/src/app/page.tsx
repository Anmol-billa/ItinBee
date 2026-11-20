import React from 'react';
import { WorkbenchClient } from '@/components/workbench/WorkbenchClient';
import { SAMPLE_WORKSPACES } from '@/data/sample-trips';
import { fetchTripWorkspace } from '@/lib/api-client';

export default async function HomePage() {
  const initial =
    (await fetchTripWorkspace('rishi-lnd-4d')) ??
    SAMPLE_WORKSPACES['rishi-lnd-4d']!;

  return <WorkbenchClient initialWorkspace={initial} mode="sandbox-home" />;
}
