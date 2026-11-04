export function notFound(request, _response, next) {
  const error = new Error(`Route not found: ${request.method} ${request.path}`);
  error.statusCode = 404;
  next(error);
}
