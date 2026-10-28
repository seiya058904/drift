import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
// @ts-expect-error Executable build script.
import { encryptBackup, decryptBackup } from "../scripts/backup.mjs";
test("backup envelope roundtrip, authenticated tamper detection and wrong-key rejection", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const text = Buffer.from("CREATE TABLE bottles(id TEXT); -- 秘密");
  const encrypted = encryptBackup(text, keys.publicKey);
  assert.deepEqual(decryptBackup(encrypted, keys.privateKey), text);
  const tampered = JSON.parse(encrypted.toString());
  tampered.data = Buffer.from("tampered").toString("base64");
  assert.throws(() =>
    decryptBackup(Buffer.from(JSON.stringify(tampered)), keys.privateKey),
  );
  const different = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(() => decryptBackup(encrypted, different.privateKey));
});
