import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { validateRequest } from "./validateRequest.js";

test("validates and replaces request body with parsed data", () => {
  const request = { body: { levelNumber: "3" } };
  let nextCalled = false;
  const middleware = validateRequest({
    body: z.object({ levelNumber: z.coerce.number().int().positive() }),
  });

  middleware(request, {}, (error) => {
    assert.equal(error, undefined);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(request.body, { levelNumber: 3 });
});

test("forwards schema errors to centralized middleware", () => {
  const request = { body: { levelNumber: -1 } };
  let nextError;
  const middleware = validateRequest({
    body: z.object({ levelNumber: z.number().positive() }),
  });

  middleware(request, {}, (error) => {
    nextError = error;
  });

  assert.equal(nextError.name, "ZodError");
  assert.equal(nextError.issues[0].path[0], "levelNumber");
});
