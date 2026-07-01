// Generates the QR code + PDF ticket and emails it to the buyer via Resend.
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

function money(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

// Build a one-page PDF ticket containing event details and a scannable QR code.
async function buildTicketPDF({ event, order, ticket }) {
  const qrDataUrl = await QRCode.toDataURL(ticket.ticket_code, { margin: 1, width: 360 });
  const qrPng = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).font('Helvetica-Bold').text(event.name, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').fillColor('#555');
    if (event.event_date) {
      doc.text(new Date(event.event_date).toLocaleString('en-US', {
        dateStyle: 'full', timeStyle: 'short',
      }), { align: 'center' });
    }
    if (event.venue) doc.text(event.venue, { align: 'center' });
    doc.moveDown(1);

    doc.image(qrPng, doc.page.width / 2 - 90, doc.y, { width: 180 });
    doc.moveDown(0.5);
    doc.y += 180;

    doc.fillColor('#000').fontSize(10).font('Helvetica-Bold')
      .text(`Ticket: ${ticket.ticket_code}`, { align: 'center' });
    doc.font('Helvetica').fillColor('#555')
      .text(`Holder: ${ticket.holder_name || order.buyer_name || order.buyer_email}`, { align: 'center' })
      .text(`Order: ${order.id}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#999')
      .text('Present this QR code at the door. Each ticket admits one and can be scanned once.',
        { align: 'center' });

    doc.end();
  });
}

// Send the confirmation email with all ticket PDFs attached, via Resend.
async function emailTickets({ event, order, tickets, pdfs }) {
  const attachments = tickets.map((t, i) => ({
    filename: `ticket-${t.ticket_code}.pdf`,
    content: pdfs[i].toString('base64'),
  }));

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
      <h2 style="margin-bottom:4px">You're in! 🎟️</h2>
      <p>Thanks for your purchase, ${order.buyer_name || ''}.</p>
      <table style="font-size:14px;color:#333">
        <tr><td><b>Event</b></td><td style="padding-left:12px">${event.name}</td></tr>
        ${event.event_date ? `<tr><td><b>When</b></td><td style="padding-left:12px">${new Date(event.event_date).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</td></tr>` : ''}
        ${event.venue ? `<tr><td><b>Where</b></td><td style="padding-left:12px">${event.venue}</td></tr>` : ''}
        <tr><td><b>Tickets</b></td><td style="padding-left:12px">${order.quantity}</td></tr>
        <tr><td><b>Total</b></td><td style="padding-left:12px">${money(order.amount_cents, order.currency)}</td></tr>
      </table>
      <p>Your ticket${tickets.length > 1 ? 's are' : ' is'} attached as a PDF. Show the QR code at the door.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,           // e.g. "Tickets <tickets@yourdomain.com>"
      to: [order.buyer_email],
      subject: `Your ticket${tickets.length > 1 ? 's' : ''} for ${event.name}`,
      html,
      attachments,
    }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

module.exports = { buildTicketPDF, emailTickets, money };
