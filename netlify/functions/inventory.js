// Public: returns event info + how many seats are left, for the purchase page.
const { supabase } = require('./_lib/supabase');
const { json } = require('./_lib/http');

exports.handler = async (event) => {
  const slug = (event.queryStringParameters || {}).slug || process.env.DEFAULT_EVENT_SLUG;
  if (!slug) return json(400, { error: 'Missing event slug' });

  const { data, error } = await supabase
    .from('events')
    .select('slug,name,event_date,venue,price_cents,currency,total_seats,seats_sold')
    .eq('slug', slug)
    .single();

  if (error || !data) return json(404, { error: 'Event not found' });

  return json(200, {
    slug: data.slug,
    name: data.name,
    event_date: data.event_date,
    venue: data.venue,
    price_cents: data.price_cents,
    currency: data.currency,
    seats_remaining: data.total_seats - data.seats_sold,
    sold_out: data.seats_sold >= data.total_seats,
  });
};
