import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError, errorResponse, noStore, requireSession } from "@/lib/auth";
import { permittedStudentIds } from "@/lib/domain";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireSession(req);
    const { id } = await context.params;
    const record = await db.learningRecord.findUnique({ where: { id } });
    if (!record) throw new ApiError(404, "指導履歴が見つかりません。");
    const ids = await permittedStudentIds(user);
    if (
      user.role !== "ADMIN" &&
      !(user.role === "TA" && record.taId === user.id) &&
      !ids.includes(record.studentId)
    )
      throw new ApiError(403, "この学生の指導履歴を閲覧する権限がありません。");
    return noStore({ record });
  } catch (error) {
    return errorResponse(error);
  }
}
