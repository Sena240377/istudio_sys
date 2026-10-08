const path = require("node:path");
const fs = require("node:fs");
const { transformSync } = require("esbuild");
const root = path.resolve(__dirname, "..");
const env = fs.existsSync(path.join(root, ".env"))
  ? fs.readFileSync(path.join(root, ".env"), "utf8")
  : "";
if (!process.env.DATABASE_URL)
  process.env.DATABASE_URL =
    env.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1] || "file:./dev.db";
// In-process TypeScript loading avoids Windows user-profile lookup in CLI loaders.
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "es2020",
    sourcefile: filename,
  }).code;
  module._compile(compiled, filename);
};
require(path.join(__dirname, "seed.ts"));
