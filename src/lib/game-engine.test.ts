import { describe, expect, it } from "vitest";
import {
  applyMove,
  createInitialState,
  finalizeGame,
  getLegalMoves,
} from "./game-engine";

describe("game engine", () => {
  it("creates a valid 15v15 initial setup", () => {
    const state = createInitialState(1);
    const white = state.points.reduce((sum, point) => sum + point.white, 0);
    const black = state.points.reduce((sum, point) => sum + point.black, 0);

    expect(white).toBe(15);
    expect(black).toBe(15);
    expect(state.points[23].white).toBe(2);
    expect(state.points[0].black).toBe(2);
  });

  it("forces bar entry before normal moves", () => {
    const state = createInitialState(1);
    state.bar.white = 1;
    state.dice = [3, 5];

    const moves = getLegalMoves(state, "white", state.dice);

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((move) => move.from === "bar")).toBe(true);
  });

  it("applies hit and sends opponent to bar", () => {
    const state = createInitialState(1);
    state.points = Array.from({ length: 24 }, () => ({ white: 0, black: 0 }));
    state.points[7].white = 1;
    state.points[5].black = 1;
    state.dice = [2];

    const moves = getLegalMoves(state, "white", state.dice);
    const hitMove = moves.find((move) => move.to === 5);

    expect(hitMove).toBeDefined();
    if (!hitMove) {
      return;
    }

    const next = applyMove(state, "white", hitMove);
    expect(next.points[5].white).toBe(1);
    expect(next.points[5].black).toBe(0);
    expect(next.bar.black).toBe(1);
  });

  it("calculates backgammon multiplier and fee discount on streak", () => {
    const state = createInitialState(2);
    state.off.white = 15;
    state.off.black = 0;
    state.bar.black = 1;
    state.cubeMultiplier = 4;
    state.streaks.white = 2;

    const result = finalizeGame(state, "white", "Bear Off");

    expect(result.winner?.resultType).toBe("Backgammon");
    expect(result.winner?.outcomeMultiplier).toBe(3);
    expect(result.winner?.feeRate).toBe(0.01);
  });
});
