// Public: called after the buyer approves payment. This is the gate —
// a ticket is ONLY created/emailed once PayPal confirms the money was captured.
//
// Flow:
//   1. Capture the PayPal order (verify status COMPLETED).
//   2. Idempotency: if we already fulfilled this PayPal order, return it.
//   3. Atomically decrement inventory (record_sale). If sold out -> refund.
//   4. Create order + ticket rows, generate QR/PDF, email the buyer.
const crypto = require('crypto');
const { supabase } = require('./_lib/supabase');
const { captureOrder, refundCapture } = require('./_lib/paypal');
const { buildTicketPDF, emailTickets } = require('./_lib/ticket');
const { json } = require('./_lib/http');

function ticketCode() {
  return crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 hex chars
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const { orderID, buyer_name, buyer_email, slug: bodySlug } = body;
  const slug = bodySlug || process.env.DEFAULT_EVENT_SLUG;
  if (!orderID || !buyer_email) return json(400, { error: 'Missing orderID or buyer_email' });

  // Idempotency: don't fulfill the same PayPal order twice (e.g. double click).
  const { data: existing } = await supabase
    .from('orders').select('id').eq('paypal_order_id', orderID).maybeSingle();
  if (existing) return json(200, { ok: true, alreadyProcessed: true });

  const { data: ev } = await supabase
    .from('events')
    .select('id,slug,name,event_date,venue,price_cents,currency')
    .eq('slug', slug).single();
  if (!ev) return json(404, { error: 'Event not found' });

  // 1. Capture payment
  const capture = await captureOrder(orderID);
  if (capture.status !== 'COMPLETED') {
    return json(402, { error: 'Payment not completed', status: capture.status });
  }
  const pu = capture.purchase_units?.[0];
  const captureId = pu?.payments?.captures?.[0]?.id;
  const paidValue = parseFloat(pu?.payments?.captures?.[0]?.amount?.value || '0');
  const qty = Math.round((paidValue * 100) / ev.price_cents);
  if (!qty || qty < 1) return json(400, { error: 'Could not determine quantity from payment' });

  // 3. Atomic inventory decrement
  const { data: ok, error: saleErr } = await supabase
    .rpc('record_sale', { p_event_id: ev.id, p_qty: qty });
  if (saleErr) return json(500, { error: 'Inventory error', detail: saleErr.message });
  if (!ok) {
    // Sold out in the gap between checkout and capture — refund the buyer.
    if (captureId) await refundCapture(captureId);
    return json(409, { error: 'Sorry — the event sold out. Your payment was refunded.' });
  }

  // 4. Persist order + tickets
  const { data: orderRow, error: oErr } = await supabase.from('orders').insert({
    event_id: ev.id,
    paypal_order_id: orderID,
    buyer_name: buyer_name || capture.payer?.name?.given_name || null,
    buyer_email,
    quantity: qty,
    amount_cents: Math.round(paidValue * 100),
    currency: ev.currency,
    payment_status: 'paid',
  }).select().single();
  if (oErr) return json(500, { error: 'Could not save order', detail: oErr.message });

  const ticketRows = Array.from({ length: qty }, () => ({
    order_id: orderRow.id,
    event_id: ev.id,
    ticket_code: ticketCode(),
    holder_name: buyer_name || null,
  }));
  const { data: tickets, error: tErr } = await supabase
    .from('tickets').insert(ticketRows).select();
  if (tErr) return json(500, { error: 'Could not save tickets', detail: tErr.message });

  // Generate PDFs + email (best-effort; payment already succeeded so we don't fail the sale)
  try {
    const pdfs = [];
    for (const t of tickets) pdfs.push(await buildTicketPDF({ event: ev, order: orderRow, ticket: t }));
    await emailTickets({ event: ev, order: orderRow, tickets, pdfs });
  } catch (e) {
    return json(200, {
      ok: true,
      emailed: false,
      warning: 'Tickets created but email failed: ' + e.message,
      tickets: tickets.map((t) => t.ticket_code),
    });
  }

  return json(200, { ok: true, emailed: true, tickets: tickets.map((t) => t.ticket_code) });
};
