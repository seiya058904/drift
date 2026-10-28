import { test } from "node:test";
import assert from "node:assert/strict";
import { moderate, normalize, sample } from "../worker/rules";
test("moderation: Unicode, whitespace, controls, links, contacts, spam and prohibited phrases", () => {
  assert.equal(moderate("希望今天有人对你温柔一点。🌊").status, "approved");
  assert.equal(
    moderate(
      Array.from({ length: 500 }, (_, i) =>
        String.fromCodePoint(0x4e00 + i),
      ).join(""),
    ).status,
    "approved",
  );
  for (const text of [
    "",
    "  ",
    "🌊".repeat(501),
    "test\u0000",
    "https://spam.com",
    "reach me at hello@example.net",
    "+1 202 555 0112",
    "ha".repeat(20),
    "kill yourself",
  ])
    assert.equal(moderate(text).status, "hidden", text);
  assert.equal(normalize("  café\r\n海  "), "café\n海");
  assert.equal(moderate("<img src=x onerror=alert(1)>").status, "approved"); // Always rendered as text.
});
test("weighted sampling follows 1/(1+exposure)^1.5 across all candidates", () => {
  let seed = 773;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const rows = [
    { id: 0, exposure_count: 0 },
    { id: 1, exposure_count: 3 },
    { id: 2, exposure_count: 8 },
  ];
  const counts = [0, 0, 0];
  for (let i = 0; i < 100000; i++) counts[sample(rows, random)!.id]++;
  const total = 1 + 1 / 8 + 1 / 27;
  [1, 1 / 8, 1 / 27].forEach((w, i) =>
    assert.ok(Math.abs(counts[i] / 100000 - w / total) < 0.006),
  );
  assert.equal(sample([]), null);
});
