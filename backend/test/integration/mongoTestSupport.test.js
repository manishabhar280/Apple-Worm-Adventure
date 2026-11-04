import assert from "node:assert/strict";
import test from "node:test";
import { validateTestDatabaseUri } from "./mongoTestSupport.js";

const localTestUri =
  "mongodb://127.0.0.1:27017/apple_worm_adventure_test_isolated?replicaSet=rs0";

test("requires an explicit dedicated database and never falls back to MONGODB_URI", () => {
  assert.equal(validateTestDatabaseUri({ MONGODB_URI: localTestUri }), null);
  assert.equal(
    validateTestDatabaseUri({ MONGODB_TEST_URI: localTestUri }),
    localTestUri,
  );
});

test("rejects production mode, production URI reuse, and non-test database names", () => {
  assert.throws(
    () => validateTestDatabaseUri({
      NODE_ENV: "production",
      MONGODB_TEST_URI: localTestUri,
    }),
    /NODE_ENV=production/,
  );
  assert.throws(
    () => validateTestDatabaseUri({
      MONGODB_URI: localTestUri,
      MONGODB_TEST_URI: localTestUri,
    }),
    /must not equal MONGODB_URI/,
  );
  assert.throws(
    () => validateTestDatabaseUri({
      MONGODB_TEST_URI: "mongodb://127.0.0.1:27017/production",
    }),
    /apple_worm_adventure_test_/,
  );
});

test("refuses all remote MongoDB targets", () => {
  const uri =
    "mongodb+srv://test.example.mongodb.net/apple_worm_adventure_test_ci?retryWrites=true";
  assert.throws(
    () => validateTestDatabaseUri({
      MONGODB_TEST_URI: uri,
      MONGODB_TEST_DATABASE_ACK: "dedicated-non-production",
    }),
    /only allow loopback hosts/,
  );
});
