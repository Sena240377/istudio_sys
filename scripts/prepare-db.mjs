import {
  existsSync,
  mkdirSync,
  readFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = existsSync(path.join(root, ".env"))
  ? readFileSync(path.join(root, ".env"), "utf8")
  : "";
const url =
  process.env.DATABASE_URL ||
  env.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1] ||
  "file:./dev.db";
if (url.startsWith("file:")) {
  const base = path.join(root, "prisma");
  const target = path.resolve(base, url.slice(5));
  const relative = path.relative(base, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("開発SQLite DBはprismaフォルダー内に指定してください。");
  mkdirSync(path.dirname(target), { recursive: true });
  if (!existsSync(target)) closeSync(openSync(target, "wx"));
}
