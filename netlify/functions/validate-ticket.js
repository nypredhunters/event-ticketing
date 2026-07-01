// Admin (door scanner): validates a scanned ticket code and checks it in.
// Returns one of: valid (first scan), already_used, not_found.
const { supabase } = require('./_lib/supabase');
const { json, requireAdmin } = require('./_lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const unauth = requireAdmin(event);
  if (unauth) return unauth;

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const code = (body.code || '').trim().toUpperCase();
  if (!code) return json(400, { error: 'Missing code' });

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id,ticket_code,holder_name,checked_in,checked_in_at,event_id, events(name)')
    .eq('ticket_code', code)
    .maybeSingle();

  if (!ticket) return json(200, { result: 'not_found', code });
  if (ticket.checked_in) {
    return json(200, {
      result: 'already_used', code,
      holder: ticket.holder_name, at: ticket.checked_in_at,
      event: ticket.events?.name,
    });
  }

  const { error } = await supabase
    .from('tickets')
    .update({ checked_in: true, checked_in_at: new Date().toISOString() })
    .eq('id', ticket.id)
    .eq('checked_in', false); // guard against double-scan race
  if (error) return json(500, { error: 'Check-in failed', detail: error.message });

  return json(200, {
    result: 'valid', code,
    holder: ticket.holder_name, event: ticket.events?.name,
  });
};
