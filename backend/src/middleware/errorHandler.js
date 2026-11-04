export function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || "Internal server error.";
  let details;

  if (error.name === "ZodError") {
    statusCode = 400;
    message = "Request validation failed.";
    details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  } else if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Document validation failed.";
    details = Object.values(error.errors).map((issue) => ({
      path: issue.path,
      message: issue.message,
    }));
  } else if (error.name === "CastError") {
    statusCode = 400;
    message = "A request value has an invalid format.";
    details = [{ path: error.path, message: "Invalid value." }];
  } else if (error.code === 11000) {
    statusCode = 409;
    message = "A record with the same unique value already exists.";
  } else if (error.name === "VersionError") {
    statusCode = 409;
    message = "The record changed before this update could be applied.";
  } else if (statusCode >= 500) {
    message = "Internal server error.";
    console.error("Unhandled request error:", error);
  } else if (statusCode >= 400) {
    message = error.type === "entity.parse.failed"
      ? "Request body contains invalid JSON."
      : error.type === "entity.too.large"
        ? "Request body is too large."
        : message;
  }

  response.status(statusCode).json({
    error: {
      message,
      ...(details ? { details } : {}),
    },
  });
}
