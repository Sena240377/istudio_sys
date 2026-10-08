import { DatabaseSync, backup } from "node:sqlite";
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prismaDir = path.join(project, "prisma");
const within = (base, target) =>
  target === base ||
  (!path.relative(base, target).startsWith("..") &&
    !path.isAbsolute(path.relative(base, target)));
const args = process.argv.slice(2);
const input = args.find((arg) => arg.startsWith("--file="))?.slice(7);
if (!input || !args.includes("--confirm") || !args.includes("--app-stopped"))
  throw new Error(
    "利用例: pnpm restore --file=backups/istudio-....db --confirm --app-stopped [--port=3000]。アプリを先に停止してください。",
  );
const port = Number(
  args.find((arg) => arg.startsWith("--port="))?.slice(7) || 3000,
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("ポート番号が不正です。");
const listening = await new Promise((resolve) => {
  const socket = net.createConnection({ port, host: "127.0.0.1" });
  socket.setTimeout(1500);
  socket.once("connect", () => {
    socket.destroy();
    resolve(true);
  });
  socket.once("error", () => {
    socket.destroy();
    resolve(false);
  });
  socket.once("timeout", () => {
    socket.destroy();
    resolve(true);
  });
});
if (listening)
  throw new Error(
    `ポート ${port} が稼働中です。アプリを停止してから再実行してください。`,
  );
const envText = existsSync(path.join(project, ".env"))
  ? readFileSync(path.join(project, ".env"), "utf8")
  : "";
const configured =
  process.env.DATABASE_URL ||
  envText.match(/^DATABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1] ||
  "file:./dev.db";
if (!configured.startsWith("file:") || configured.includes("?"))
  throw new Error("SQLite の file: 接続 URL が必要です。");
const database = path.resolve(prismaDir, configured.slice(5));
if (
  !within(prismaDir, database) ||
  !existsSync(database) ||
  !within(realpathSync(prismaDir), realpathSync(database))
)
  throw new Error("復元先は prisma フォルダー内の既存 DB に限ります。");
const sourcePath = path.resolve(project, input);
if (
  !existsSync(sourcePath) ||
  realpathSync(sourcePath) === realpathSync(database)
)
  throw new Error("別の既存バックアップファイルを指定してください。");
const restored = new DatabaseSync(sourcePath, { readOnly: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const staged = `${database}.restore-${stamp}.db`;
const previous = `${database}.before-restore-${stamp}.db`;
try {
  if (
    restored
      .prepare("PRAGMA integrity_check")
      .all()
      .some((row) => row.integrity_check !== "ok")
  )
    throw new Error("バックアップ DB の整合性検査に失敗しました。");
  if (restored.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("バックアップ DB の外部キー検査に失敗しました。");
  const tables = new Set(
    restored
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => row.name),
  );
  const expectedTables = [
    "User",
    "StudentIdentity",
    "Session",
    "TaProfile",
    "Course",
    "Unit",
    "Slot",
    "Booking",
    "LearningRecord",
    "Survey",
    "Notification",
    "Interview",
    "HistoryGrant",
    "Setting",
    "BookingAttempt",
    "AuditEvent",
    "LoginThrottle",
  ];
  for (const table of expectedTables)
    if (!tables.has(table))
      throw new Error(`対応する iStudio DB ではありません (${table} 不在)。`);
  const currentSchema = new DatabaseSync(database, { readOnly: true });
  try {
    for (const table of expectedTables) {
      const shape = (connection) =>
        connection
          .prepare(`PRAGMA table_info("${table}")`)
          .all()
          .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }));
      if (
        JSON.stringify(shape(currentSchema)) !== JSON.stringify(shape(restored))
      )
        throw new Error(
          `現行 DB とスキーマが異なります (${table})。移行を検証してから復元してください。`,
        );
    }
  } finally {
    currentSchema.close();
  }
  await backup(restored, staged);
} finally {
  restored.close();
}
const current = new DatabaseSync(database);
try {
  current.exec(
    "PRAGMA busy_timeout=1000; BEGIN EXCLUSIVE; ROLLBACK; PRAGMA wal_checkpoint(TRUNCATE);",
  );
  await backup(current, previous);
} finally {
  current.close();
}
// 停止確認・排他ロック取得後、DB と同じ検証済みディレクトリ内の副ファイルだけを扱う。
for (const suffix of ["-wal", "-shm"]) {
  const sidecar = `${database}${suffix}`;
  if (existsSync(sidecar)) unlinkSync(sidecar);
}
const old = `${database}.replaced-${stamp}.db`;
renameSync(database, old);
try {
  renameSync(staged, database);
} catch (error) {
  renameSync(old, database);
  throw error;
}
console.log(
  `復元成功: ${database}\n復元前の安全なバックアップ: ${previous}\n置換前ファイルも保持: ${old}\nアプリを起動し、ログイン・予約・件数を確認してください。`,
);
