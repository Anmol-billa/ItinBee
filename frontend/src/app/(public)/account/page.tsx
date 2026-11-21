import React from 'react';
import type { Metadata } from 'next';
import { TrunkCorners } from '@/components/world/TrunkCorners';
import { AccountClient } from '@/features/auth/AccountClient';

export const metadata: Metadata = {
  title: 'Account settings',
  description: 'Manage your Itinbee display name, preferred language (English / हिन्दी) and default UPI ID.',
};

export default function AccountPage() {
  return (
    <section className="trunk-ground trunk-frame relative isolate min-h-[calc(100dvh-64px)] overflow-x-hidden">
      <TrunkCorners />
      <div className="relative z-10">
        <AccountClient />
      </div>
    </section>
  );
}
