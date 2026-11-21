'use client';

import React, { useEffect } from 'react';
import { reportClientErrorToSentry } from '@/lib/error-reporting';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientErrorToSentry(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          backgroundColor: '#08291F',
          color: '#14213D',
          fontFamily: 'Source Sans 3, system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#F6EBD3',
            border: '2px solid #14213D',
            borderRadius: '14px',
            padding: '32px',
            boxShadow: '0 18px 32px rgba(3, 18, 14, 0.5)',
          }}
        >
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: '36px',
              fontWeight: 900,
              lineHeight: 1.05,
              color: '#14213D',
            }}
          >
            Itinbee hit an unexpected error
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: '16px', lineHeight: 1.55, color: '#4F4533' }}>
            Reload this workspace or return to the home page. Offline drafts stored in your browser remain safe.
          </p>
          {error.digest ? (
            <p style={{ margin: '0 0 20px', fontFamily: 'monospace', fontSize: '12px', color: '#4F4533' }}>
              Ref: {error.digest}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: '48px',
                padding: '11px 24px',
                backgroundColor: '#C7361F',
                color: '#FFFDF8',
                border: '2px solid #14213D',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                minHeight: '48px',
                padding: '11px 20px',
                backgroundColor: 'transparent',
                color: '#14213D',
                border: '1.5px solid #14213D',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Go to Itinbee home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
