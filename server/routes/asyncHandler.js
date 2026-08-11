// Wraps an async route handler so thrown errors (e.g. CognoDB unreachable)
// are forwarded to Express's centralised error handler instead of crashing
// the request or the process.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
