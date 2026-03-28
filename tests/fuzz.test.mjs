import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { buildLaunchEnv, tailText } from "../lib/core.mjs";

test("tailText keeps outputs within the requested bound", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), fc.integer({ min: 1, max: 5000 }), async (value, maxChars) => {
      const result = tailText(value, maxChars);
      assert.ok(result.length <= maxChars);
      if (value.length <= maxChars) {
        assert.equal(result, value);
      } else {
        assert.equal(result, value.slice(value.length - maxChars));
      }
    }),
    { numRuns: 200 },
  );
});

test("buildLaunchEnv merges launch env on top of parent env only when requested", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.string()),
      fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.string()),
      fc.boolean(),
      async (parentEnv, launchEnv, inheritParentEnv) => {
        const result = buildLaunchEnv({ env: launchEnv, inheritParentEnv }, parentEnv);
        if (!inheritParentEnv) {
          assert.deepEqual(result, launchEnv);
          return;
        }

        for (const [key, value] of Object.entries(parentEnv)) {
          if (!(key in launchEnv)) {
            assert.equal(result[key], value);
          }
        }

        for (const [key, value] of Object.entries(launchEnv)) {
          assert.equal(result[key], value);
        }
      },
    ),
    { numRuns: 200 },
  );
});
