import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
// Explicit local developer command. Never import this into an HTTP route.
async function main() {
  const directory = path.resolve(".local/emails");
  const files = (await readdir(directory).catch(() => [])).filter((name) => name.endsWith(".json")).sort().slice(-5);
  if (!files.length) { console.log("No preview messages yet. Request a verification or password-reset link first."); return; }
  for (const file of files) {
    const message = JSON.parse(await readFile(path.join(directory, file), "utf8"));
    console.log(`\n${message.kind} → ${message.to}\n${message.url}\n`);
  }
}
main().catch(() => { console.error("Unable to read local email previews."); process.exitCode = 1; });
