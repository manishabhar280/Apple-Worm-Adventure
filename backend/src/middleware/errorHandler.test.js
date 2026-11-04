import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { errorHandler } from "./errorHandler.js";

function captureResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("formats request validation errors as a safe 400 response", () => {
  const error = z.object({ level: z.number().int().positive() }).safeParse({ level: -1 }).error;
  const response = captureResponse();

  errorHandler(error, {}, response, () => {});

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.message, "Request validation failed.");
  assert.equal(response.body.error.details[0].path, "level");
});

test("maps database cast and duplicate-key errors without exposing internals", () => {
  const castResponse = captureResponse();
  errorHandler(
    { name: "CastError", path: "_id", value: "private-value" },
    {},
    castResponse,
    () => {},
  );
  assert.equal(castResponse.statusCode, 400);
  assert.doesNotMatch(JSON.stringify(castResponse.body), /private-value/);

  const duplicateResponse = captureResponse();
  errorHandler({ code: 11000, keyValue: { email: "private@example.test" } }, {}, duplicateResponse, () => {});
  assert.equal(duplicateResponse.statusCode, 409);
  assert.doesNotMatch(JSON.stringify(duplicateResponse.body), /private@example/);
});

test("does not write a second response after headers are sent", () => {
  const error = new Error("late error");
  let forwarded;
  errorHandler(error, {}, { headersSent: true }, (nextError) => {
    forwarded = nextError;
  });
  assert.equal(forwarded, error);
});
