import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
export async function checkMigrations() {
  const files = (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (!files.length) throw Error("No migrations");
  files.forEach((file, index) => {
    if (!file.startsWith(String(index + 1).padStart(4, "0") + "_"))
      throw Error(`Migration sequence must be contiguous: ${file}`);
  });
  const database = new DatabaseSync(":memory:");
  let previousFiles = [];
  try {
    previousFiles = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", "origin/main", "--", "migrations"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    /* Initial clone. */
  }
  for (const path of previousFiles) {
    const previous = execFileSync("git", ["show", `origin/main:${path}`], {
      encoding: "utf8",
    });
    if (previous !== (await readFile(path, "utf8")))
      throw Error(`Applied migration changed: ${path}`);
  }
  if (
    previousFiles.some((path, index) => path !== `migrations/${files[index]}`)
  )
    throw Error("New migrations must follow the previously applied prefix");
  for (const file of files) {
    const sql = await readFile(`migrations/${file}`, "utf8");
    if (
      /\b(?:DROP|RENAME|TRUNCATE)\b|ALTER\s+TABLE[^;]*DROP|DELETE\s+FROM/iu.test(
        sql,
      )
    )
      throw Error(`Destructive migration needs an incident workflow: ${file}`);
    database.exec(sql);
  }
  // Apply the previous prefix, keep a row, then apply only the new suffix.
  const upgrade = new DatabaseSync(":memory:");
  for (const path of previousFiles) upgrade.exec(await readFile(path, "utf8"));
  if (previousFiles.length)
    upgrade
      .prepare(
        "INSERT INTO bottles(id,body,status,created_at) VALUES('migration-probe','Preserve this message','approved',1)",
      )
      .run();
  for (const file of files.filter(
    (f) => !previousFiles.includes(`migrations/${f}`),
  ))
    upgrade.exec(await readFile(`migrations/${file}`, "utf8"));
  if (
    previousFiles.length &&
    upgrade.prepare("SELECT body FROM bottles WHERE id='migration-probe'").get()
      ?.body !== "Preserve this message"
  )
    throw Error("Upgrade lost data");
  database.close();
  upgrade.close();
  console.log(
    `Migration gates passed (${files.length} ordered files, ${previousFiles.length} previous).`,
  );
  return files;
}
if (process.argv[1]?.endsWith("check-migrations.mjs")) await checkMigrations();
