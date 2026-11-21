import { ImageResponse } from 'next/og';

export const alt = 'Itinbee — Collaborative Travel Itinerary, Open Route Map & UPI Split Workspace';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#08291F',
          padding: '54px 64px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top brand bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '22px',
                backgroundColor: '#F2A71B',
                border: '3px solid #F6EBD3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#14213D',
                fontSize: '24px',
                fontWeight: 900,
              }}
            >
              I
            </div>
            <span
              style={{
                color: '#F2A71B',
                fontSize: '36px',
                fontWeight: 900,
                letterSpacing: '0.02em',
              }}
            >
              ITINBEE
            </span>
          </div>
          <div
            style={{
              backgroundColor: '#F2A71B',
              color: '#14213D',
              padding: '8px 18px',
              borderRadius: '999px',
              fontSize: '18px',
              fontWeight: 800,
            }}
          >
            OFFLINE-FIRST · OPEN DATA · UPI SPLITS
          </div>
        </div>

        {/* Center Luggage Tag Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#F6EBD3',
            border: '4px solid #14213D',
            borderRadius: '20px',
            padding: '44px 52px',
            boxShadow: '0 22px 36px rgba(3, 18, 14, 0.55)',
          }}
        >
          <div
            style={{
              color: '#14213D',
              fontSize: '58px',
              fontWeight: 900,
              lineHeight: 1.04,
              marginBottom: '18px',
            }}
          >
            Paste tickets or WhatsApp notes. Get a mapped trip in seconds.
          </div>
          <div
            style={{
              color: '#4F4533',
              fontSize: '25px',
              lineHeight: 1.4,
            }}
          >
            Encrypted PNR vault · Bilingual English / हिन्दी Elder Cards · Verified UPI settlements
          </div>
        </div>

        {/* Bottom postmark strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#F6EBD3',
            fontSize: '18px',
          }}
        >
          <span>© OpenStreetMap contributors · Wikivoyage · Wikimedia Commons</span>
          <span
            style={{
              backgroundColor: '#C7361F',
              color: '#FFFDF8',
              padding: '8px 20px',
              borderRadius: '8px',
              border: '2px solid #F6EBD3',
              fontWeight: 800,
            }}
          >
            Plan a trip free
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
