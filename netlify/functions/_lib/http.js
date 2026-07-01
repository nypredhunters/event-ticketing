// Shared helpers for JSON responses + simple admin auth.
function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

// Admin endpoints require a secret token in the x-admin-token header,
// compared against the ADMIN_TOKEN env var.
function requireAdmin(event) {
  const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return json(401, { error: 'Unauthorized' });
  }
  return null;
}

module.exports = { json, requireAdmin };
