import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

// Offline path checks only: do not fetch links or crawl generated/dependency files.
const root = process.cwd();
const files = ["AGENTS.md", "README.md"];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
}
await collect("docs");
const errors = [];
let checked = 0;
for (const file of files) {
  const content = (await readFile(file, "utf8")).replace(/```[^]*?```/g, "");
  const targets = [
    ...content.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g),
    ...content.matchAll(/\b(?:src|href)="([^"]+)"/g),
  ];
  for (const [, target] of targets) {
    if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(target)) continue;
    try {
      const path = decodeURIComponent(target.split(/[?#]/)[0]);
      if (!path) continue;
      const resolved = resolve(dirname(resolve(file)), path);
      const local = relative(root, resolved);
      if (local.startsWith("..") || isAbsolute(local))
        throw Error("target escapes the repository");
      await stat(resolved);
      checked++;
    } catch {
      errors.push(`${file}: missing or invalid local link ${target}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation paths passed (${files.length} Markdown files, ${checked} local links; external URLs and anchors not checked).`);
}
