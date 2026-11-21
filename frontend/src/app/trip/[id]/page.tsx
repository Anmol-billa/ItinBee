import React from 'react';
import { EditorShell } from '@/features/editor/EditorShell';
import { fetchTripWorkspace } from '@/lib/api-client';

interface TripPageProps {
  params: Promise<{ id: string }>;
}

export default async function TripWorkspacePage({ params }: TripPageProps) {
  const { id } = await params;
  const workspace = await fetchTripWorkspace(id);

  // Pass workspace (or null for client-only IndexedDB / guest-cookie drafts) into EditorShell
  return <EditorShell initialWorkspace={workspace} requestedId={id} />;
}
