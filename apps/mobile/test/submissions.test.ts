import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmOrSubmit,
  definitelyRejected,
} from "../src/logic/submissions.ts";
const payload = { requestId: "stable-request", text: "Send once" };
test("an accepted existing receipt does not repeat a host action", async () => {
  let sends = 0;
  const result = await confirmOrSubmit(
    {
      submission: async () => ({ status: "accepted" }),
      submit: async () => {
        sends++;
        return { status: "accepted" };
      },
    },
    payload,
  );
  assert.equal(result.status, "accepted");
  assert.equal(sends, 0);
});
test("unknown and rejected receipts are returned without submitting again", async () => {
  for (const status of ["unknown", "rejected"]) {
    let sends = 0;
    assert.equal(
      (
        await confirmOrSubmit(
          {
            submission: async () => ({ status }),
            submit: async () => {
              sends++;
              return { status: "accepted" };
            },
          },
          payload,
        )
      ).status,
      status,
    );
    assert.equal(sends, 0);
  }
});
test("a missing receipt resends the original identity and payload", async () => {
  let actual;
  const result = await confirmOrSubmit(
    {
      submission: async () => {
        throw { status: 404 };
      },
      submit: async (value) => {
        actual = value;
        return { status: "accepted" };
      },
    },
    payload,
  );
  assert.equal(actual, payload);
  assert.equal(result.status, "accepted");
});
test("failed reconciliation does not perform a potentially duplicate send", async () => {
  for (const status of [0, 401, 403, 429, 500, 503]) {
    let sends = 0;
    await assert.rejects(
      confirmOrSubmit(
        {
          submission: async () => {
            throw Object.assign(new Error("Unavailable"), { status });
          },
          submit: async () => {
            sends++;
            return { status: "accepted" };
          },
        },
        payload,
      ),
    );
    assert.equal(sends, 0);
    assert.equal(definitelyRejected({ status }), false);
  }
});
test("an explicitly rejected session or attachment permits recomposing", () => {
  for (const status of [400, 409, 413, 415, 422])
    assert.equal(definitelyRejected({ status }), true);
});

test("re-pairing never retries an old device submission, even if the new device would return 404", async () => {
  let reads = 0;
  let sends = 0;
  const client = {
    submission: async () => {
      reads++;
      throw { status: 404 };
    },
    submit: async () => {
      sends++;
      return { status: "accepted" };
    },
  };
  await assert.rejects(
    confirmOrSubmit(client, payload, {
      storedDeviceId: "old-device",
      currentDeviceId: "new-device",
    }),
    /previous device pairing/,
  );
  await assert.rejects(
    confirmOrSubmit(client, payload, { currentDeviceId: "new-device" }),
    /previous device pairing/,
  );
  assert.equal(reads, 0);
  assert.equal(sends, 0);
});
