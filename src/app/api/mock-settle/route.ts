import { NextResponse } from "next/server";

type SettlePayload = {
  winner?: "white" | "black";
  reason?: string;
  netPayout?: number;
  cubeMultiplier?: number;
  resultType?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as SettlePayload;

  return NextResponse.json({
    ok: true,
    settlementId: `mock-${Date.now()}`,
    paidTo: payload.winner ?? "white",
    netPayout: Number((payload.netPayout ?? 0).toFixed(2)),
    reason: payload.reason ?? "unknown",
    resultType: payload.resultType ?? "Normal",
    cubeMultiplier: payload.cubeMultiplier ?? 1,
  });
}
