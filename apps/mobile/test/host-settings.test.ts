import test from "node:test";
import assert from "node:assert/strict";
import {
  configFields,
  credentialReferences,
  fieldValue,
  pathValue,
} from "../src/host-settings/schema.ts";
import type { SettingsNamespace } from "../src/host-settings/schema.ts";

const namespace = (
  schema: unknown,
  extra: Partial<SettingsNamespace> = {},
): SettingsNamespace => ({
  ns: "example",
  autoGenerate: true,
  schema,
  value: {},
  secrets: [],
  revision: 7,
  applies: "live",
  ...extra,
});
test("reads referenced Schemastery fields without evaluating plugin callbacks", () => {
  const form = namespace({
    uid: 1,
    refs: {
      "1": { type: "object", dict: { enabled: 2, mode: 3, hidden: 6 } },
      "2": { type: "boolean" },
      "3": { type: "union", list: [4, 5] },
      "4": { type: "const", value: "ask" },
      "5": { type: "const", value: "never" },
      "6": { type: "string", meta: { hidden: true } },
    },
  });
  const fields = configFields(form);
  assert.deepEqual(
    fields.map((field) => [field.path, field.kind]),
    [
      [["enabled"], "boolean"],
      [["mode"], "enum"],
    ],
  );
  assert.equal(fieldValue(fields[1], '"never"'), "never");
  assert.throws(() => fieldValue(fields[1], '"allow-everything"'));
});
test("secret metadata wins over a schema scalar and never supplies a saved value", () => {
  const form = namespace(
    { type: "object", dict: { key: { type: "string" } } },
    { secrets: [{ path: ["key"], set: true }], value: {} },
  );
  const field = configFields(form)[0];
  assert.equal(field.secret, true);
  assert.equal(field.configured, true);
  assert.equal("value" in field, false);
  assert.equal(pathValue(form.value, field.path), undefined);
});
test("config introspection rejects prototype paths and inherited properties", () => {
  const dict = JSON.parse(
    '{"__proto__":{"type":"string"},"safe":{"type":"number"}}',
  );
  assert.deepEqual(
    configFields(namespace({ type: "object", dict })).map(
      (field) => field.path,
    ),
    [["safe"]],
  );
  assert.equal(
    pathValue(Object.create({ leaked: "private" }), ["leaked"]),
    undefined,
  );
  assert.equal(pathValue({}, ["__proto__"]), undefined);
});
test("recursive schemas stop and complex unions are explicitly unsupported", () => {
  const fields = configFields(
    namespace({
      uid: 1,
      refs: {
        "1": { type: "object", dict: { self: 1, branch: 2 } },
        "2": { type: "union", list: [1] },
      },
    }),
  );
  assert.equal(fields.length, 1);
  assert.equal(fields[0].kind, "unsupported");
});
test("existing collection items retain exact mutation paths and host constraints", () => {
  const fields = configFields(
    namespace(
      {
        type: "object",
        dict: {
          ports: {
            type: "array",
            inner: {
              type: "number",
              meta: { min: 1, max: 65535, disabled: true },
            },
          },
        },
      },
      { value: { ports: [8788] } },
    ),
  );
  const port = fields.find((field) => field.kind === "number")!;
  assert.deepEqual(port.path, ["ports", "0"]);
  assert.equal(port.disabled, true);
  assert.equal(fieldValue(port, "8788"), 8788);
  for (const invalid of ["", "NaN", "0", "65536"])
    assert.throws(() => fieldValue(port, invalid));
});
test("credential discovery uses only validated API key references", () => {
  const refs = credentialReferences([
    namespace(
      {},
      {
        value: {
          providers: {
            a: { apiKeyEnv: "MODEL_API_KEY" },
            b: { apiKeyEnv: "MODEL_API_KEY" },
            bad: { apiKeyEnv: "not a reference" },
            inline: { apiKey: "do-not-collect" },
          },
        },
      },
    ),
  ]);
  assert.deepEqual(refs, ["MODEL_API_KEY"]);
});
