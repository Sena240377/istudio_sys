import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

export const SESSION_COOKIE = "istudio_session";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected || expected.length !== 128)
    return false;
  const computed = scryptSync(password, salt, 64);
  return timingSafeEqual(computed, Buffer.from(expected, "hex"));
}
export async function requireSession(req: NextRequest) {
  requireRequestHost(req);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new ApiError(401, "ログインしてください。");
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  });
  if (
    !session ||
    !session.user.active ||
    session.expiresAt.getTime() <= Date.now()
  )
    throw new ApiError(401, "セッションの有効期限が切れました。");
  return session;
}
function requireRequestHost(req: NextRequest) {
  const authority = req.headers.get("host");
  if (!authority) throw new ApiError(403, "接続先を確認できません。");
  let requestUrl: URL;
  try {
    requestUrl = new URL(`${req.nextUrl.protocol}//${authority}`);
  } catch {
    throw new ApiError(403, "接続先が不正です。");
  }
  if (process.env.APP_ORIGIN) {
    if (requestUrl.host !== new URL(process.env.APP_ORIGIN).host)
      throw new ApiError(403, "この接続先は許可されていません。");
  } else if (
    !["127.0.0.1", "localhost", "[::1]"].includes(requestUrl.hostname)
  ) {
    throw new ApiError(403, "検証用アプリはローカル環境から利用してください。");
  }
}
export function requireOrigin(req: NextRequest) {
  requireRequestHost(req);
  const origin = req.headers.get("origin");
  // NextURL normalizes 127.0.0.1 to localhost; compare against the actual request authority.
  // Deployments behind a reverse proxy must pin APP_ORIGIN to their public HTTPS origin.
  const expected =
    process.env.APP_ORIGIN ??
    `${req.nextUrl.protocol}//${req.headers.get("host")}`;
  if (!origin || origin !== expected)
    throw new ApiError(403, "送信元を確認できません。");
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "別サイトからの操作は許可されません。");
}
export async function requireMutation(req: NextRequest) {
  requireOrigin(req);
  const session = await requireSession(req);
  const csrf = req.headers.get("x-csrf-token");
  if (!csrf || csrf !== session.csrfToken)
    throw new ApiError(
      403,
      "操作トークンが一致しません。再ログインしてください。",
    );
  return session;
}
export function requireRole(role: string, allowed: string[]) {
  if (!allowed.includes(role))
    throw new ApiError(403, "この操作の権限がありません。");
}
export function errorResponse(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error(
    "iStudio API error:",
    error instanceof Error ? error.name : "Unknown",
  );
  return NextResponse.json(
    { error: "処理を完了できませんでした。時間をおいて再実行してください。" },
    { status: 500 },
  );
}
export function noStore<T>(data: T) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function readBody(
  req: NextRequest,
): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "JSON形式で送信してください。");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > 64_000)
    throw new ApiError(413, "入力が大きすぎます。");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "JSONが不正です。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "入力が不正です。");
  return value as Record<string, unknown>;
}
