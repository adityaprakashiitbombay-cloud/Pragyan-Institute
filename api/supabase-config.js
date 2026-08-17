// Retired deliberately: browser clients use the authenticated server gateway.
export default function handler(_req, res) {
  return res.status(410).json({ error: 'This endpoint has been retired.' });
}
