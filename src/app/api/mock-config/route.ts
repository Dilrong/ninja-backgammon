import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    minBet: 0.1,
    maxBet: 100,
    defaultBet: 1,
    maxCube: 64,
    turnSeconds: 10,
    gameSeconds: 300,
    doubleDecisionSeconds: 5,
    rematchDelaySeconds: 2,
  });
}
