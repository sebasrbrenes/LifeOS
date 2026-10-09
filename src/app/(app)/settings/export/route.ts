import { NextResponse } from "next/server";

import {
  buildPersonalExport,
  exportFileName,
} from "@/features/settings/export";
import { getSessionUser } from "@/lib/auth/session";
import { localDate } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";

/** Downloads all of the signed-in user's data as JSON (spec §22). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const now = new Date();
  try {
    const data = await buildPersonalExport(supabase, user, now);
    const timezone =
      (data.tables.profiles[0]?.timezone as string | undefined) ?? "UTC";
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(localDate(now, timezone))}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Never echo database errors: they can contain internal details.
    console.error("[export] failed");
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
