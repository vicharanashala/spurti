// Express 4 does not catch a rejected promise from an async handler: the request
// hangs until the client gives up and, on Node 15+, an unhandled rejection can
// take the whole process down. Wrapping every handler routes the error to
// Express's error middleware instead, so one bad query costs one 500, not the
// server.
export function wrapAsync(handler) {
  if (typeof handler !== 'function') return handler;
  return function wrapped(req, res, next) {
    try {
      const out = handler(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

// Wraps the handler-registering verbs of a router in place, so existing
// `api.get('/x', async (req, res) => ...)` calls need no changes.
export function wrapRouter(router, verbs = ['get', 'post', 'put', 'patch', 'delete']) {
  for (const verb of verbs) {
    const original = router[verb].bind(router);
    router[verb] = (path, ...handlers) => original(path, ...handlers.map(wrapAsync));
  }
  return router;
}
