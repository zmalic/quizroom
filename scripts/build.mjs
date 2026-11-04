import { build, context } from "esbuild";
import { mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
await mkdir("dist", { recursive: true });

const server = { entryPoints: ["src/server/index.ts"], outfile: "dist/server.js", bundle: true, platform: "node", format: "esm", target: "node20", packages: "external", sourcemap: true };
const client = { entryPoints: ["src/client/main.ts"], outfile: "public/app.js", bundle: true, platform: "browser", format: "iife", target: "es2020", sourcemap: true, minify: !watch };

if (watch) {
  for (const o of [server, client]) await (await context(o)).watch();
} else {
  await Promise.all([build(server), build(client)]);
}
