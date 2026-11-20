import type { ItineraryItem, TripDay, TripMeta } from '@/lib/types';

export async function exportItineraryWithLiveQrPdf(params: {
  trip: Pick<TripMeta, 'title' | 'destinationSummary' | 'shortId'>;
  days: TripDay[];
  items: ItineraryItem[];
  liveShareUrl: string;
}): Promise<void> {
  const [{ jsPDF }, QRCode] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const qrDataUrl = await QRCode.toDataURL(params.liveShareUrl, {
    margin: 1,
    width: 180,
    color: { dark: '#18181B', light: '#FFFFFF' },
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text(params.trip.title, 16, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(87, 83, 78);
  doc.text(params.trip.destinationSummary || 'Itinbee Offline Trip Sheet', 16, 26);
  doc.text(`Live updates & polls: ${params.liveShareUrl}`, 16, 31);

  doc.addImage(qrDataUrl, 'PNG', 168, 12, 26, 26);
  doc.setFontSize(7.5);
  doc.text('Scan for live trip', 170, 41);

  doc.setDrawColor(231, 229, 224);
  doc.line(16, 45, 194, 45);

  let y = 53;
  const activeDays = params.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  for (const day of activeDays) {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(
      `Day ${day.dayNumber}${day.date ? ` (${day.date})` : ''} — ${day.themeTitle}`,
      16,
      y
    );
    y += 6;

    const dayItems = params.items
      .filter((i) => i.dayId === day.id && !i.deletedAt)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    for (const stop of dayItems) {
      if (y > 272) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(24, 24, 27);
      const prefix = stop.startTime ? `${stop.startTime}  ` : '';
      doc.text(`${prefix}${stop.title}`, 20, y);
      y += 4.5;

      if (stop.notes || stop.accessibilityNotes) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(87, 83, 78);
        const detail = [stop.notes, stop.accessibilityNotes].filter(Boolean).join(' · ');
        const wrapped = doc.splitTextToSize(detail, 168) as string[];
        doc.text(wrapped.slice(0, 2), 20, y);
        y += wrapped.slice(0, 2).length * 4 + 2;
      } else {
        y += 2;
      }
    }
    y += 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 113, 108);
  doc.text('Organised on Itinbee · PNRs redacted for safe sharing · © OpenStreetMap contributors', 16, 287);

  doc.save(`itinbee-${params.trip.shortId}.pdf`);
}
