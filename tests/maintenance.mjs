import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

if (process.env.ISTUDIO_TEST_WRITE !== "isolated-demo")
  throw new Error(
    "破棄可能な test.db のみを対象とします。ISTUDIO_TEST_WRITE=isolated-demo を設定してください。",
  );
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const database = path.join(project, "prisma", "test.db");
const directory = path.join(project, "backups", "test-validation");
mkdirSync(directory, { recursive: true });
const environment = { ...process.env, DATABASE_URL: "file:./test.db" };
const results = [];
const startedAt = new Date().toISOString();
const run = (script, args = []) =>
  spawnSync(
    process.execPath,
    [path.join(project, "scripts", script), ...args],
    { cwd: project, env: environment, encoding: "utf8", timeout: 30_000 },
  );
const counts = () => {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    return Object.fromEntries(
      tables.map((table) => [
        table,
        db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n,
      ]),
    );
  } finally {
    db.close();
  }
};
const before = counts();
let snapshot;
async function test(id, name, fn) {
  const time = Date.now();
  try {
    await fn();
    results.push({ id, name, status: "PASS", durationMs: Date.now() - time });
    console.log(`PASS ${id}: ${name}`);
  } catch (error) {
    results.push({
      id,
      name,
      status: "FAIL",
      durationMs: Date.now() - time,
      reason: String(error.message).slice(0, 1200),
    });
    console.error(`FAIL ${id}: ${error.message}`);
  }
}
await test(
  "M1",
  "SQLite online backup と保存後 integrity_check が成功する",
  async () => {
    const response = run("backup.mjs", ["--out=backups/test-validation"]);
    assert.equal(response.status, 0, response.stderr);
    snapshot = readdirSync(directory)
      .filter((name) => /^istudio-.*\.db$/.test(name))
      .sort()
      .at(-1);
    assert.ok(snapshot);
    const db = new DatabaseSync(path.join(directory, snapshot), {
      readOnly: true,
    });
    try {
      assert.equal(
        db.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
      assert.equal(
        db.prepare("SELECT count(*) AS n FROM Booking").get().n,
        before.Booking,
      );
    } finally {
      db.close();
    }
  },
);
await test("M2", "復元確認フラグがなければ DB を変更しない", async () => {
  const response = run("restore.mjs", [
    `--file=backups/test-validation/${snapshot}`,
  ]);
  assert.notEqual(response.status, 0);
  assert.ok(response.stderr.includes("--confirm"));
  assert.deepEqual(counts(), before);
});
await test("M3", "指定ポート稼働中は復元を拒否する", async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const response = run("restore.mjs", [
      `--file=backups/test-validation/${snapshot}`,
      "--confirm",
      "--app-stopped",
      `--port=${server.address().port}`,
    ]);
    assert.notEqual(response.status, 0);
    assert.ok(response.stderr.includes("稼働中"));
    assert.deepEqual(counts(), before);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
await test(
  "M4",
  "iStudio スキーマのない SQLite ファイルを復元しない",
  async () => {
    const invalidName = `invalid-${Date.now()}.db`;
    const invalid = new DatabaseSync(path.join(directory, invalidName));
    invalid.exec("CREATE TABLE other (id INTEGER)");
    invalid.close();
    const response = run("restore.mjs", [
      `--file=backups/test-validation/${invalidName}`,
      "--confirm",
      "--app-stopped",
      "--port=3001",
    ]);
    assert.notEqual(response.status, 0);
    assert.ok(response.stderr.includes("対応する iStudio DB ではありません"));
    assert.deepEqual(counts(), before);
  },
);
await test(
  "M5",
  "停止済み test.db を復元し全テーブル件数と内容が戻る",
  async () => {
    assert.ok(snapshot);
    const db = new DatabaseSync(database);
    db.prepare("INSERT INTO Setting (key, value) VALUES (?, ?)").run(
      "maintenanceRestoreProbe",
      '"架空・復元テストだけの行"',
    );
    db.close();
    assert.equal(counts().Setting, before.Setting + 1);
    const response = run("restore.mjs", [
      `--file=backups/test-validation/${snapshot}`,
      "--confirm",
      "--app-stopped",
      "--port=3001",
    ]);
    assert.equal(response.status, 0, response.stderr);
    assert.deepEqual(counts(), before);
    const restored = new DatabaseSync(database, { readOnly: true });
    try {
      assert.equal(
        restored
          .prepare("SELECT value FROM Setting WHERE key=?")
          .get("maintenanceRestoreProbe"),
        undefined,
      );
      assert.equal(
        restored.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
    } finally {
      restored.close();
    }
    assert.ok(
      readdirSync(path.join(project, "prisma")).some((name) =>
        name.startsWith("test.db.before-restore-"),
      ),
      "復元前バックアップがない",
    );
  },
);
await test(
  "M6",
  "デモ seed の再実行は既存予約・記録・設定を保持する",
  async () => {
    const response = run("run-seed.cjs");
    assert.equal(response.status, 0, response.stderr);
    assert.ok(response.stdout.includes("既存データを保持"));
    assert.deepEqual(counts(), before);
  },
);
const passed = results.filter((result) => result.status === "PASS").length;
const report = {
  startedAt,
  endedAt: new Date().toISOString(),
  database: "prisma/test.db (隔離)",
  port: 3001,
  beforeCounts: before,
  afterCounts: counts(),
  passed,
  failed: results.length - passed,
  results,
};
writeFileSync(
  path.join(project, "tests", "maintenance-results.json"),
  JSON.stringify(report, null, 2),
);
const markdown = [
  "# バックアップ・復元の実検証",
  "",
  `実行: ${report.startedAt} ～ ${report.endedAt} (UTC)。運用 dev.db は変更せず、停止した隔離 test.db を使用。`,
  "",
  `結果: ${passed} 成功 / ${report.failed} 失敗。`,
  "",
  "| 番号 | テスト | 結果 |",
  "|---|---|---|",
  ...results.map(
    (result) => `| ${result.id} | ${result.name} | ${result.status} |`,
  ),
  "",
  "復元前後の全 17 テーブル件数は tests/maintenance-results.json に記録。復元前ファイル・安全なバックアップを保持。実際にテスト専用の設定行を追加してから復元し、その行が消え元の件数に戻ることを検証。",
  "",
  ...results
    .filter((result) => result.status === "FAIL")
    .map((result) => `失敗 ${result.id}: ${result.reason}`),
  "",
];
writeFileSync(
  path.join(project, "docs", "maintenance-test-results.md"),
  markdown.join("\n"),
);
appendFileSync(
  path.join(project, "docs", "test-results.md"),
  "\n追加の保守検証: [バックアップ・復元の実検証](maintenance-test-results.md)。\n",
);
console.log(`保守実結果保存: ${passed} PASS / ${report.failed} FAIL`);
if (report.failed) process.exitCode = 1;
