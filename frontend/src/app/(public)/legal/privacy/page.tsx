import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Itinbee handles trip data, PII redaction, ticket vaults, and open-data services.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="trunk-ground-flat">
      <div className="mx-auto max-w-[860px] px-5 py-16 md:px-8">
        <h1 className="display text-[56px] text-saffron md:text-[72px]">Privacy policy</h1>
        <p className="mt-4 max-w-[66ch] text-[18px] text-paper/90">
          Itinbee is designed around privacy minimization and India’s Digital Personal Data Protection Act (DPDPA 2023)
          principles.
        </p>

        <div className="on-paper mt-8 space-y-6 rounded-[14px] border-2 border-navy bg-paper p-7 text-[17px] text-navy shadow-label md:p-9">
          <section>
            <h2 className="display text-[32px]">1. Automatic ID &amp; PNR redaction</h2>
            <p className="mt-2 text-paper-ink">
              When you paste booking text or upload a ticket, Itinbee’s local/server redactor masks 12-digit Aadhaar
              numbers before any AI fallback runs. Public WhatsApp share links (<code>/t/&lt;shortId&gt;</code>) mask
              PNRs to the last three characters by default.
            </p>
          </section>

          <section>
            <h2 className="display text-[32px]">2. Guest drafts &amp; accounts</h2>
            <p className="mt-2 text-paper-ink">
              You can create and edit trips without signing in using an anonymous session cookie and browser IndexedDB
              storage. If you later sign in via email or Google, your guest drafts merge into your account.
            </p>
          </section>

          <section>
            <h2 className="display text-[32px]">3. AI processing &amp; open map providers</h2>
            <p className="mt-2 text-paper-ink">
              When AI Smart Import is active, sanitized trip notes are sent to Google Gemini solely to extract trip
              intent and organize candidate stops. Map tiles and place data are served from OpenFreeMap, OpenStreetMap,
              Wikivoyage, Wikipedia and Wikimedia Commons without sharing your personal identity.
            </p>
          </section>

          <section>
            <h2 className="display text-[32px]">4. Encrypted ticket vault</h2>
            <p className="mt-2 text-paper-ink">
              Files stored in your local browser vault are encrypted client-side with WebCrypto AES-GCM using your
              passphrase. You can delete your local data or cloud trips at any time.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
