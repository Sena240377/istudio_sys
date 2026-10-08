import { NextRequest } from "next/server";
import { errorResponse, noStore, readBody, requireMutation } from "@/lib/auth";
import { executeAction } from "@/lib/actions";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireMutation(req);
    const body = await readBody(req);
    return noStore(await executeAction(user, body));
  } catch (error) {
    return errorResponse(error);
  }
}
