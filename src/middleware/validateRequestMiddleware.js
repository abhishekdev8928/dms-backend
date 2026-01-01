import createHttpError from "http-errors";

export const validateRequestMiddleware = (schema) => {
  return (req, res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten();

      const errors = Object.entries(flattened.fieldErrors).map(
        ([field, messages]) => ({
          field,
          message: messages?.[0] || "Invalid value",
        })
      );

      return next(
        Object.assign(createHttpError(400, "Validation failed"), { errors })
      );
    }

    // ✅ attach validated data
    req.validated = parsed.data;
    next();
  };
};