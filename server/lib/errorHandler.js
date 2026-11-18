// Last-resort Express error middleware. Anything that reaches it is a failure no
// route dealt with (a rejected query, a malformed or oversized JSON body).
// The client gets a generic message and never the stack or a Mongo error string.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.stack || err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : 'Bad request.' });
}
