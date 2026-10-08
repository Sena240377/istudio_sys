import { DatabaseSync, backup } from "node:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const prismaDir = path.join(project, "prisma");
const within = (base, target) =>
  target === base ||
  (!path.relative(base, target).startsWith("..") &&
    !path.isAbsolute(path.relative(base, target)));
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
  !existsSync(database) ||
  !within(realpathSync(prismaDir), realpathSync(database))
)
  throw new Error(
    "バックアップ対象は prisma フォルダー内の既存 DB に限ります。",
  );
const outputArgument = process.argv
  .find((arg) => arg.startsWith("--out="))
  ?.slice(6);
const directory = outputArgument
  ? path.resolve(project, outputArgument)
  : path.join(project, "backups");
if (
  !within(project, directory) ||
  ["public", ".next", "node_modules", ".git"].some((name) =>
    within(path.join(project, name), directory),
  )
)
  throw new Error(
    "保存先はプロジェクト内の非公開フォルダーを指定してください。",
  );
mkdirSync(directory, { recursive: true });
if (!within(realpathSync(project), realpathSync(directory)))
  throw new Error("シンボリックリンク先がプロジェクト外です。");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.join(directory, `istudio-${stamp}.db`);
const source = new DatabaseSync(database, { readOnly: true });
try {
  if (
    source
      .prepare("PRAGMA integrity_check")
      .all()
      .some((row) => row.integrity_check !== "ok")
  )
    throw new Error("元 DB の整合性検査に失敗しました。");
  await backup(source, output);
} finally {
  source.close();
}
const saved = new DatabaseSync(output, { readOnly: true });
try {
  if (
    saved
      .prepare("PRAGMA integrity_check")
      .all()
      .some((row) => row.integrity_check !== "ok")
  )
    throw new Error("保存後の整合性検査に失敗しました。");
} finally {
  saved.close();
}
writeFileSync(
  `${output}.manifest.json`,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      format: "SQLite online backup",
      integrity: "ok",
      application: "istudio-learning-support",
      note: "個人情報・認証情報を含むため公開禁止。アクセス制限と別媒体への暗号化保管が必要。",
    },
    null,
    2,
  ),
);
console.log(`バックアップ保存・整合性検査成功: ${output}`);
