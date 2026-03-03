export type Player = "white" | "black";
export type CubeOwner = Player | "center";

export type Point = { white: number; black: number };

export type Move = {
  dieIndex: number;
  die: number;
  from: number | "bar";
  to: number | "off";
  hit: boolean;
};

export type PendingDouble = {
  from: Player;
  timeLeft: number;
};

export type ResultType = "Normal" | "Gammon" | "Backgammon" | "Drop" | "Time Score";

export type GameResult = {
  winner: Player;
  reason: string;
  resultType: ResultType;
  outcomeMultiplier: number;
  cubeMultiplier: number;
  grossPayout: number;
  feeRate: number;
  feeAmount: number;
  netPayout: number;
  notes: string[];
};

export type GameState = {
  points: Point[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
  currentPlayer: Player;
  dice: number[];
  lastRoll: [number, number] | null;
  turnTimeLeft: number;
  gameTimeLeft: number;
  cubeMultiplier: number;
  cubeOwner: CubeOwner;
  pendingDouble: PendingDouble | null;
  betAmount: number;
  streaks: Record<Player, number>;
  winner: GameResult | null;
  rematchCountdown: number;
};

export const TURN_SECONDS = 10;
export const GAME_SECONDS = 5 * 60;
export const DOUBLE_SECONDS = 5;
export const REMATCH_SECONDS = 2;
export const CUBE_MAX = 64;

export function otherPlayer(player: Player): Player {
  return player === "white" ? "black" : "white";
}

export function createInitialPoints(): Point[] {
  const points = Array.from({ length: 24 }, () => ({ white: 0, black: 0 }));

  points[23].white = 2;
  points[12].white = 5;
  points[7].white = 3;
  points[5].white = 5;

  points[0].black = 2;
  points[11].black = 5;
  points[16].black = 3;
  points[18].black = 5;

  return points;
}

export function createInitialState(
  betAmount: number,
  streaks?: Record<Player, number>,
): GameState {
  return {
    points: createInitialPoints(),
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    currentPlayer: "white",
    dice: [],
    lastRoll: null,
    turnTimeLeft: TURN_SECONDS,
    gameTimeLeft: GAME_SECONDS,
    cubeMultiplier: 1,
    cubeOwner: "center",
    pendingDouble: null,
    betAmount,
    streaks: streaks ?? { white: 2, black: 4 },
    winner: null,
    rematchCountdown: REMATCH_SECONDS,
  };
}

export function rollDice(): [number, number] {
  const a = Math.floor(Math.random() * 6) + 1;
  const b = Math.floor(Math.random() * 6) + 1;
  return [a, b];
}

export function diceToMoves([a, b]: [number, number]): number[] {
  if (a === b) {
    return [a, a, a, a];
  }
  return [a, b];
}

function isHomeBoard(player: Player, pointIndex: number): boolean {
  if (player === "white") {
    return pointIndex >= 0 && pointIndex <= 5;
  }
  return pointIndex >= 18 && pointIndex <= 23;
}

function canLand(points: Point[], pointIndex: number, player: Player): boolean {
  const opponent = otherPlayer(player);
  return points[pointIndex][opponent] < 2;
}

function allInHome(points: Point[], bar: Record<Player, number>, player: Player): boolean {
  if (bar[player] > 0) {
    return false;
  }

  for (let i = 0; i < points.length; i += 1) {
    if (points[i][player] > 0 && !isHomeBoard(player, i)) {
      return false;
    }
  }

  return true;
}

function canBearOffOversize(points: Point[], player: Player, pointNumber: number): boolean {
  if (player === "white") {
    for (let p = pointNumber + 1; p <= 6; p += 1) {
      if (points[p - 1].white > 0) {
        return false;
      }
    }
    return true;
  }

  for (let p = 19; p < pointNumber; p += 1) {
    if (points[p - 1].black > 0) {
      return false;
    }
  }
  return true;
}

function entryPointIndex(player: Player, die: number): number {
  if (player === "white") {
    return 24 - die;
  }
  return die - 1;
}

export function getLegalMoves(state: GameState, player: Player, dice: number[]): Move[] {
  const moves: Move[] = [];
  const opponent = otherPlayer(player);
  const mustEnterFromBar = state.bar[player] > 0;

  for (let dieIndex = 0; dieIndex < dice.length; dieIndex += 1) {
    const die = dice[dieIndex];

    if (mustEnterFromBar) {
      const target = entryPointIndex(player, die);
      if (canLand(state.points, target, player)) {
        moves.push({
          dieIndex,
          die,
          from: "bar",
          to: target,
          hit: state.points[target][opponent] === 1,
        });
      }
      continue;
    }

    for (let pointIndex = 0; pointIndex < 24; pointIndex += 1) {
      if (state.points[pointIndex][player] === 0) {
        continue;
      }

      const pointNumber = pointIndex + 1;

      if (player === "white") {
        const targetNumber = pointNumber - die;
        if (targetNumber >= 1) {
          const targetIndex = targetNumber - 1;
          if (canLand(state.points, targetIndex, player)) {
            moves.push({
              dieIndex,
              die,
              from: pointIndex,
              to: targetIndex,
              hit: state.points[targetIndex][opponent] === 1,
            });
          }
          continue;
        }

        if (!allInHome(state.points, state.bar, player)) {
          continue;
        }

        if (die === pointNumber || canBearOffOversize(state.points, player, pointNumber)) {
          moves.push({ dieIndex, die, from: pointIndex, to: "off", hit: false });
        }
      } else {
        const targetNumber = pointNumber + die;
        if (targetNumber <= 24) {
          const targetIndex = targetNumber - 1;
          if (canLand(state.points, targetIndex, player)) {
            moves.push({
              dieIndex,
              die,
              from: pointIndex,
              to: targetIndex,
              hit: state.points[targetIndex][opponent] === 1,
            });
          }
          continue;
        }

        if (!allInHome(state.points, state.bar, player)) {
          continue;
        }

        const distance = 25 - pointNumber;
        if (die === distance || canBearOffOversize(state.points, player, pointNumber)) {
          moves.push({ dieIndex, die, from: pointIndex, to: "off", hit: false });
        }
      }
    }
  }

  return moves;
}

function removeDieAtIndex(dice: number[], dieIndex: number): number[] {
  return dice.filter((_, idx) => idx !== dieIndex);
}

export function applyMove(state: GameState, player: Player, move: Move): GameState {
  const opponent = otherPlayer(player);
  const points = state.points.map((point) => ({ ...point }));
  const bar = { ...state.bar };
  const off = { ...state.off };

  if (move.from === "bar") {
    bar[player] -= 1;
  } else {
    points[move.from][player] -= 1;
  }

  if (move.to === "off") {
    off[player] += 1;
  } else {
    if (points[move.to][opponent] === 1) {
      points[move.to][opponent] = 0;
      bar[opponent] += 1;
    }
    points[move.to][player] += 1;
  }

  return {
    ...state,
    points,
    bar,
    off,
    dice: removeDieAtIndex(state.dice, move.dieIndex),
  };
}

function countInWinnerHome(points: Point[], winner: Player): number {
  const opponent = otherPlayer(winner);
  if (winner === "white") {
    return points.slice(0, 6).reduce((sum, point) => sum + point[opponent], 0);
  }
  return points.slice(18, 24).reduce((sum, point) => sum + point[opponent], 0);
}

function evaluateWinType(
  state: GameState,
  winner: Player,
  reason: string,
): { type: ResultType; multiplier: number } {
  const loser = otherPlayer(winner);
  if (reason === "Drop") {
    return { type: "Drop", multiplier: 1 };
  }
  if (reason === "Time Score") {
    return { type: "Time Score", multiplier: 1 };
  }

  if (state.off[loser] > 0) {
    return { type: "Normal", multiplier: 1 };
  }

  const opponentInWinnerHome = countInWinnerHome(state.points, winner) > 0;
  if (state.bar[loser] > 0 || opponentInWinnerHome) {
    return { type: "Backgammon", multiplier: 3 };
  }
  return { type: "Gammon", multiplier: 2 };
}

function feeRateForStreak(streak: number): number {
  if (streak >= 3) {
    return 0.01;
  }
  return 0.015;
}

export function finalizeGame(state: GameState, winner: Player, reason: string): GameState {
  const evaluated = evaluateWinType(state, winner, reason);
  const feeRate = feeRateForStreak(state.streaks[winner] + 1);
  const pot = state.betAmount * 2;
  const grossPayout = pot * state.cubeMultiplier * evaluated.multiplier;
  const feeAmount = grossPayout * feeRate;
  const netPayout = grossPayout - feeAmount;

  const notes: string[] = [];
  if (state.streaks[winner] + 1 >= 5) {
    notes.push("5-win bonus payout is marked TBD in this MVP and is not applied.");
  }

  return {
    ...state,
    winner: {
      winner,
      reason,
      resultType: evaluated.type,
      outcomeMultiplier: evaluated.multiplier,
      cubeMultiplier: state.cubeMultiplier,
      grossPayout,
      feeRate,
      feeAmount,
      netPayout,
      notes,
    },
    streaks: {
      white: winner === "white" ? state.streaks.white + 1 : 0,
      black: winner === "black" ? state.streaks.black + 1 : 0,
    },
    dice: [],
    pendingDouble: null,
    rematchCountdown: REMATCH_SECONDS,
  };
}

export function scoreWinnerByClock(state: GameState): Player {
  const whiteRemaining = 15 - state.off.white;
  const blackRemaining = 15 - state.off.black;

  if (whiteRemaining < blackRemaining) {
    return "white";
  }
  if (blackRemaining < whiteRemaining) {
    return "black";
  }

  const whiteHome = state.points.slice(0, 6).reduce((sum, point) => sum + point.white, 0);
  const blackHome = state.points.slice(18, 24).reduce((sum, point) => sum + point.black, 0);

  if (whiteHome > blackHome) {
    return "white";
  }
  if (blackHome > whiteHome) {
    return "black";
  }

  return "white";
}

export function endTurn(state: GameState): GameState {
  return {
    ...state,
    currentPlayer: otherPlayer(state.currentPlayer),
    dice: [],
    lastRoll: null,
    turnTimeLeft: TURN_SECONDS,
    pendingDouble: null,
  };
}

export function runAutoTurn(state: GameState): GameState {
  if (state.winner || state.pendingDouble) {
    return state;
  }

  let next = { ...state, turnTimeLeft: TURN_SECONDS };

  if (next.dice.length === 0) {
    const rolled = rollDice();
    next = {
      ...next,
      dice: diceToMoves(rolled),
      lastRoll: rolled,
    };
  }

  while (next.dice.length > 0) {
    const legal = getLegalMoves(next, next.currentPlayer, next.dice);
    if (legal.length === 0) {
      break;
    }
    const selected = legal[Math.floor(Math.random() * legal.length)];
    next = applyMove(next, next.currentPlayer, selected);
    if (next.off[next.currentPlayer] === 15) {
      return finalizeGame(next, next.currentPlayer, "Bear Off");
    }
  }

  return endTurn(next);
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function moveLabel(move: Move): string {
  const fromText = move.from === "bar" ? "Bar" : `P${move.from + 1}`;
  const toText = move.to === "off" ? "Off" : `P${move.to + 1}`;
  return `${fromText} -> ${toText} (d${move.die})${move.hit ? " HIT" : ""}`;
}
