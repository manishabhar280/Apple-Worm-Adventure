export function validateRequest(schemas) {
  return function requestValidator(request, _response, next) {
    try {
      for (const section of ["body", "params", "query"]) {
        const schema = schemas[section];
        if (schema) {
          request[section] = schema.parse(request[section]);
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
