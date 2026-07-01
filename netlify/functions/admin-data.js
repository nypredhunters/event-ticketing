// Admin dashboard data: event summary (sold/remaining/revenue/checked-in) + buyer list.
const { supabase } = require('./_lib/supabase');
const { json, requireAdmin } = require('./_lib/http');

exports.handler = async (event) => {
  const unauth = requireAdmin(event);
  if (unauth) return unauth;

  const slug = (event.queryStringParameters || {}).slug || process.env.DEFAULT_EVENT_SLUG;

  const { data: summary, error: sErr } = await supabase
    .from('event_summary').select('*').eq('slug', slug).single();
  if (sErr || !summary) return json(404, { error: 'Event not found' });

  const { data: orders } = await supabase
    .from('orders')
    .select('buyer_name,buyer_email,quantity,amount_cents,currency,payment_status,created_at')
    .eq('event_id', summary.id)
    .order('created_at', { ascending: false });

  return json(200, {
    event: {
      name: summary.name, slug: summary.slug, venue: summary.venue,
      event_date: summary.event_date, currency: summary.currency,
      price_cents: summary.price_cents,
      total_seats: summary.total_seats,
      seats_sold: summary.seats_sold,
      seats_remaining: summary.seats_remaining,
      revenue_cents: summary.revenue_cents,
      checked_in_count: summary.checked_in_count,
    },
    orders: orders || [],
  });
};
