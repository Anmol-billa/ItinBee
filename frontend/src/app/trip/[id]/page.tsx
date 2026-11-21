import React from 'react';
import { cookies } from 'next/headers';
import { EditorShell } from '@/features/editor/EditorShell';
import { fetchTripWorkspace } from '@/lib/api-client';

interface TripPageProps {
  params: Promise<{ id: string }>;
}

export default async function TripWorkspacePage({ params }: TripPageProps) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const workspace = await fetchTripWorkspace(id, {
    cookieHeader: cookieHeader || undefined,
  });

  // Pass workspace (or null for client-only IndexedDB / guest-cookie drafts) into EditorShell
  return <EditorShell initialWorkspace={workspace} requestedId={id} />;
}
