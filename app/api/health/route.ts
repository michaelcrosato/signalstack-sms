import { NextResponse } from "next/server";
import { envDefaults } from "@/lib/env/defaults";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "signalstack-sms",
    demoSafeDefaults: envDefaults
  });
}
