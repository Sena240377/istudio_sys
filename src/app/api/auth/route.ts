import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ApiError,
  SESSION_COOKIE,
  digest,
  errorResponse,
  noStore,
  readBody,
  requireMutation,
  requireOrigin,
  requireSession,
  verifyPassword,
} from "@/lib/auth";
import { str } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    const { user, csrfToken } = await requireSession(req);
    return noStore({
      viewer: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      csrfToken,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    requireOrigin(req);
    const body = await readBody(req);
    if (body.action === "logout") {
      const session = await requireMutation(req);
      await db.session.delete({ where: { id: session.id } });
      const response = noStore({ ok: true });
      response.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: req.nextUrl.protocol === "https:",
        maxAge: 0,
        path: "/",
      });
      return response;
    }
    const email = str(body.email, "メールアドレス", 254, true)
      .trim()
      .toLowerCase();
    const password = str(body.password, "パスワード", 200, true);
    const throttleKey = digest(email);
    const now = new Date();
    let throttle = await db.loginThrottle.findUnique({
      where: { key: throttleKey },
    });
    if (
      throttle &&
      now.getTime() - throttle.windowStart.getTime() > 15 * 60_000
    )
      throttle = await db.loginThrottle.update({
        where: { key: throttleKey },
        data: { attempts: 0, windowStart: now },
      });
    if (throttle && throttle.attempts >= 12)
      throw new ApiError(
        429,
        "ログイン試行が多すぎます。15分後にお試しください。",
      );
    const user = await db.user.findUnique({ where: { email } });
    // Evaluate a fixed dummy hash for unknown users to avoid a fast account-existence oracle.
    const valid = verifyPassword(
      password,
      user?.passwordHash ??
        "scrypt:00000000000000000000000000000000:" + "0".repeat(128),
    );
    if (!user || !user.active || !valid) {
      await db.loginThrottle.upsert({
        where: { key: throttleKey },
        create: { key: throttleKey, attempts: 1 },
        update: { attempts: { increment: 1 } },
      });
      throw new ApiError(
        401,
        "メールアドレスまたはパスワードを確認してください。",
      );
    }
    await db.loginThrottle.deleteMany({ where: { key: throttleKey } });
    const token = randomBytes(32).toString("hex");
    const csrfToken = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        tokenHash: digest(token),
        csrfToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 8 * 60 * 60_000),
      },
    });
    await db.auditEvent.create({
      data: { actorId: user.id, action: "LOGIN", detail: "認証成功" },
    });
    const response = NextResponse.json(
      {
        ok: true,
        csrfToken,
        viewer: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      maxAge: 8 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
