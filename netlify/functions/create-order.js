// Public: creates a PayPal order for N tickets. Amount is computed SERVER-SIDE
// from the DB price so the browser can never set its own price.
const { supabase } = require('./_lib/supabase');
const { createOrder } = require('./_lib/paypal');
const { json } = require('./_lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const slug = body.slug || process.env.DEFAULT_EVENT_SLUG;
  const qty = parseInt(body.quantity, 10);
  if (!slug || !Number.isInteger(qty) || qty < 1 || qty > 10) {
    return json(400, { error: 'Invalid request (quantity must be 1-10)' });
  }

  const { data: ev, error } = await supabase
    .from('events')
    .select('id,name,price_cents,currency,total_seats,seats_sold')
    .eq('slug', slug)
    .single();
  if (error || !ev) return json(404, { error: 'Event not found' });

  // Soft availability check (final atomic check happens at capture).
  if (ev.seats_sold + qty > ev.total_seats) {
    return json(409, { error: 'Not enough seats remaining' });
  }

  const amount = (ev.price_cents * qty) / 100;
  const order = await createOrder({
    amount,
    currency: ev.currency,
    description: `${qty} x ${ev.name}`,
  });

  return json(200, { orderID: order.id });
};
