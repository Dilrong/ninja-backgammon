"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AiDifficulty,
  CUBE_MAX,
  DOUBLE_SECONDS,
  GameState,
  Move,
  Player,
  applyMove,
  createInitialState,
  diceToMoves,
  endTurn,
  finalizeGame,
  formatTime,
  getLegalMoves,
  moveLabel,
  otherPlayer,
  rollDice,
  runAutoTurn,
  scoreWinnerByClock,
} from "@/lib/game-engine";
import { synth } from "@/lib/audio";

type FromSelection = number | "bar" | null;

type ConfigResponse = {
  minBet: number;
  maxBet: number;
  defaultBet: number;
  maxCube: number;
  turnSeconds: number;
  gameSeconds: number;
  doubleDecisionSeconds: number;
  rematchDelaySeconds: number;
};

type SettlementResponse = {
  ok: boolean;
  settlementId: string;
  paidTo: Player;
  netPayout: number;
};

type MovePulse = {
  from: number | "bar";
  to: number | "off";
};

type SfxKind =
  | "roll"
  | "rollThrow"
  | "rollLoop"
  | "rollStop"
  | "hit"
  | "double"
  | "win"
  | "tick";
type SfxBank = Record<SfxKind, HTMLAudioElement[]>;

const pipMap: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function calcPipCount(state: GameState, player: Player): number {
  let total = state.bar[player] * 25;
  for (let i = 0; i < 24; i += 1) {
    const distance = player === "white" ? i + 1 : 24 - i;
    total += state.points[i][player] * distance;
  }
  return total;
}

function CheckerStack({
  count,
  tone,
}: {
  count: number;
  tone: "white" | "black";
}) {
  if (count === 0) {
    return null;
  }

  const visibleCount = Math.min(count, 5);
  const hidden = count - visibleCount;

  return (
    <div className={`checker-stack ${tone}`}>
      {Array.from({ length: visibleCount }, (_, idx) => visibleCount - idx).map((slot) => (
        <span key={`${tone}-${count}-${slot}`} className={`checker-chip ${tone}`} />
      ))}
      {hidden > 0 && <span className="checker-overflow">+{hidden}</span>}
    </div>
  );
}

function PointCell({
  pointNumber,
  whiteCount,
  blackCount,
  selected,
  selectable,
  destination,
  pulse,
  orientation,
  onClick,
}: {
  pointNumber: number;
  whiteCount: number;
  blackCount: number;
  selected: boolean;
  selectable: boolean;
  destination: boolean;
  pulse: boolean;
  orientation: "top" | "bottom";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`point-cell ${orientation} ${selected ? "selected" : ""} ${selectable ? "selectable" : ""} ${destination ? "destination" : ""} ${pulse ? "pulse" : ""}`}
      onClick={onClick}
    >
      <div className="point-number">{pointNumber}</div>
      <div className="checkers">
        <CheckerStack count={whiteCount} tone="white" />
        <CheckerStack count={blackCount} tone="black" />
      </div>
    </button>
  );
}

function DiceFace({ value }: { value: number }) {
  const active = new Set(pipMap[value] ?? pipMap[1]);
  return (
    <div className="dice-face">
      {Array.from({ length: 9 }, (_, idx) => idx + 1).map((slot) => (
        <span key={`pip-${value}-${slot}`} className={`dice-pip ${active.has(slot) ? "on" : ""}`} />
      ))}
    </div>
  );
}

export default function Home() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [game, setGame] = useState<GameState>(() => createInitialState(1));
  const [selectedFrom, setSelectedFrom] = useState<FromSelection>(null);
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState<[number, number]>([1, 1]);
  const [reelLock, setReelLock] = useState<[boolean, boolean]>([false, false]);
  const [leverPulled, setLeverPulled] = useState(false);
  const [movePulse, setMovePulse] = useState<MovePulse | null>(null);
  const [settlementMessage, setSettlementMessage] = useState<string>("");
  const [sfxVolume, setSfxVolume] = useState(0.72);
  const [bgmVolume, setBgmVolume] = useState(0.34);
  const [bgmOn, setBgmOn] = useState(false);
  const [impactText, setImpactText] = useState<string>("");
  const [coachHint, setCoachHint] = useState<string>("");
  const [houseDifficulty, setHouseDifficulty] = useState<AiDifficulty>("normal");
  const submittedSettlementKey = useRef<string | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const rollTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sfxPool = useRef<SfxBank>({
    roll: [],
    rollThrow: [],
    rollLoop: [],
    rollStop: [],
    hit: [],
    double: [],
    win: [],
    tick: [],
  });

  const [shakeType, setShakeType] = useState<"none" | "hit" | "double" | "win">("none");
  const [isCharging, setIsCharging] = useState(false);

  const playFx = useCallback(
    (kind: SfxKind) => {
      // Fallback or layer over existing wav files
      const list = sfxPool.current[kind];
      if (list && list.length > 0) {
        const source = list[Math.floor(Math.random() * list.length)];
        const oneShot = source.cloneNode(true) as HTMLAudioElement;
        oneShot.volume = sfxVolume;
        if (kind !== "tick") {
          oneShot.playbackRate = 0.96 + Math.random() * 0.1;
        }
        oneShot.currentTime = 0;
        void oneShot.play().catch(() => undefined);
      }

      // Add synth layers for dopamine effect
      if (kind === "hit") {
        synth.playHit();
        setShakeType("hit");
        setTimeout(() => setShakeType("none"), 400);
      } else if (kind === "double") {
        synth.playDouble();
        setShakeType("double");
        setTimeout(() => setShakeType("none"), 600);
      } else if (kind === "win") {
        synth.playWin();
        setShakeType("win");
        setTimeout(() => setShakeType("none"), 1500);
      } else if (kind === "rollThrow") {
        synth.playRollThrow();
      } else if (kind === "rollStop") {
        synth.playRollStop();
      } else if (kind === "tick") {
        synth.playTick();
      }
    },
    [sfxVolume],
  );

  const hypeLevel = useMemo(() => {
    const cubeBoost = game.cubeMultiplier * 12;
    const clockBoost = Math.max(0, 10 - game.turnTimeLeft) * 4;
    const capped = Math.min(100, 28 + cubeBoost + clockBoost);
    return capped;
  }, [game.cubeMultiplier, game.turnTimeLeft]);

  const triggerImpact = useCallback((text: string) => {
    setImpactText(text);
    setTimeout(() => setImpactText(""), 760);
  }, []);

  const isPlayerTurn = game.currentPlayer === "white";

  const legalMoves = useMemo(() => {
    if (game.winner || game.pendingDouble || game.dice.length === 0) {
      return [] as Move[];
    }
    return getLegalMoves(game, game.currentPlayer, game.dice);
  }, [game]);

  const selectableFrom = useMemo(() => {
    const picks = new Set<number | "bar">();
    legalMoves.forEach((move) => {
      if (move.from === "bar") {
        picks.add("bar");
      } else {
        picks.add(move.from);
      }
    });
    return picks;
  }, [legalMoves]);

  const candidateMoves = useMemo(() => {
    if (selectedFrom === null) {
      return [] as Move[];
    }
    return legalMoves.filter((move) => move.from === selectedFrom);
  }, [legalMoves, selectedFrom]);

  const destinationSet = useMemo(() => {
    const picks = new Set<number | "off">();
    candidateMoves.forEach((move) => {
      picks.add(move.to);
    });
    return picks;
  }, [candidateMoves]);

  const suggestedMove = useMemo(() => {
    if (!isPlayerTurn || legalMoves.length === 0) {
      return null;
    }

    let best = legalMoves[0];
    let score = Number.NEGATIVE_INFINITY;
    for (const move of legalMoves) {
      let nextScore = 0;
      if (move.hit) {
        nextScore += 20;
      }
      if (move.to === "off") {
        nextScore += 30;
      }
      if (move.from !== "bar" && move.to !== "off") {
        nextScore += (move.from - move.to) * 1.2;
      }
      if (nextScore > score) {
        best = move;
        score = nextScore;
      }
    }
    return best;
  }, [isPlayerTurn, legalMoves]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    bgmRef.current = new Audio("/sfx/bgm-loop.wav");
    bgmRef.current.loop = true;
    bgmRef.current.preload = "auto";
    bgmRef.current.volume = 0.34;

    sfxPool.current = {
      roll: [new Audio("/sfx/roll-1.wav"), new Audio("/sfx/roll-2.wav")],
      rollThrow: [new Audio("/sfx/roll-throw.wav")],
      rollLoop: [new Audio("/sfx/roll-loop.wav")],
      rollStop: [new Audio("/sfx/roll-stop.wav")],
      hit: [new Audio("/sfx/hit-1.wav"), new Audio("/sfx/hit-2.wav")],
      double: [new Audio("/sfx/double-1.wav"), new Audio("/sfx/double-2.wav")],
      win: [new Audio("/sfx/win-1.wav"), new Audio("/sfx/win-2.wav")],
      tick: [new Audio("/sfx/tick.wav")],
    };

    Object.values(sfxPool.current).forEach((list) => {
      list.forEach((audio) => {
        audio.preload = "auto";
        audio.volume = 0.72;
      });
    });

    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!bgmRef.current) {
      return;
    }
    bgmRef.current.volume = bgmVolume;
    synth.setVolume(bgmVolume);
  }, [bgmVolume]);

  useEffect(() => {
    const bgm = bgmRef.current;
    if (!bgm) {
      return;
    }
    if (!bgmOn) {
      bgm.pause();
      synth.stopBgm();
      return;
    }
    void bgm.play().catch(() => {
      setBgmOn(false);
    });
    synth.startBgm();
  }, [bgmOn]);

  useEffect(() => {
    return () => {
      rollTimerRefs.current.forEach((timerId) => {
        clearTimeout(timerId);
      });
      rollTimerRefs.current = [];
    };
  }, []);

  useEffect(() => {
    Object.values(sfxPool.current).forEach((list) => {
      list.forEach((audio) => {
        audio.volume = sfxVolume;
      });
    });
  }, [sfxVolume]);

  useEffect(() => {
    if (game.winner || game.pendingDouble) {
      return;
    }
    if (game.dice.length === 0) {
      return;
    }
    if (game.turnTimeLeft > 0 && game.turnTimeLeft <= 3) {
      const tickTimer = setTimeout(() => playFx("tick"), 0);
      return () => clearTimeout(tickTimer);
    }
  }, [game.winner, game.pendingDouble, game.dice.length, game.turnTimeLeft, playFx]);

  useEffect(() => {
    const controller = new AbortController();
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/mock-config", { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as ConfigResponse;
        setConfig(data);
        setGame((prev) => {
          if (prev.betAmount !== 1) {
            return prev;
          }
          return createInitialState(data.defaultBet, prev.streaks);
        });
      } catch {
        return;
      }
    };

    void loadConfig();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((prev) => {
        if (prev.winner) {
          return prev;
        }
        if (prev.gameTimeLeft <= 1) {
          const winner = scoreWinnerByClock(prev);
          return finalizeGame({ ...prev, gameTimeLeft: 0 }, winner, "Time Score");
        }
        return { ...prev, gameTimeLeft: prev.gameTimeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((prev) => {
        if (prev.winner || prev.pendingDouble) {
          return prev;
        }
        if (prev.turnTimeLeft <= 1) {
          setSelectedFrom(null);
          const next = runAutoTurn(prev, "normal");
          if (next !== prev) {
            playFx("roll");
          }
          return next;
        }
        return { ...prev, turnTimeLeft: prev.turnTimeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [playFx]);

  useEffect(() => {
    if (game.winner || game.pendingDouble || game.currentPlayer !== "black") {
      return;
    }

    const houseTurnTimer = setTimeout(() => {
      setSelectedFrom(null);
      triggerImpact("HOUSE MOVE");
      playFx("rollThrow");
      setGame((prev) => {
        if (prev.winner || prev.pendingDouble || prev.currentPlayer !== "black") {
          return prev;
        }
        return runAutoTurn(prev, houseDifficulty);
      });
    }, 550);

    return () => clearTimeout(houseTurnTimer);
  }, [game.winner, game.pendingDouble, game.currentPlayer, playFx, triggerImpact, houseDifficulty]);

  useEffect(() => {
    if (game.winner || game.pendingDouble || game.currentPlayer !== "black") {
      return;
    }
    if (game.dice.length > 0) {
      return;
    }
    if (game.cubeMultiplier >= CUBE_MAX) {
      return;
    }
    if (game.cubeOwner !== "center" && game.cubeOwner !== "black") {
      return;
    }

    const whitePip = calcPipCount(game, "white");
    const blackPip = calcPipCount(game, "black");
    const advantage = whitePip - blackPip;
    if (advantage < 14 || Math.random() > 0.45) {
      return;
    }

    const cubeTimer = setTimeout(() => {
      setGame((prev) => {
        if (
          prev.winner ||
          prev.pendingDouble ||
          prev.currentPlayer !== "black" ||
          prev.dice.length > 0 ||
          prev.cubeMultiplier >= CUBE_MAX ||
          (prev.cubeOwner !== "center" && prev.cubeOwner !== "black")
        ) {
          return prev;
        }
        playFx("double");
        triggerImpact("HOUSE DOUBLE");
        return {
          ...prev,
          pendingDouble: {
            from: "black",
            timeLeft: DOUBLE_SECONDS,
          },
        };
      });
    }, 420);

    return () => clearTimeout(cubeTimer);
  }, [
    game,
    playFx,
    triggerImpact,
  ]);

  useEffect(() => {
    if (!game.pendingDouble || game.pendingDouble.from !== "white" || game.winner) {
      return;
    }

    const decisionTimer = setTimeout(() => {
      setGame((prev) => {
        if (!prev.pendingDouble || prev.pendingDouble.from !== "white" || prev.winner) {
          return prev;
        }

        const whitePip = calcPipCount(prev, "white");
        const blackPip = calcPipCount(prev, "black");
        const disadvantage = blackPip - whitePip;
        const shouldDrop = disadvantage > 24 && prev.cubeMultiplier >= 4;

        if (shouldDrop) {
          playFx("win");
          triggerImpact("HOUSE DROP");
          return finalizeGame(prev, "white", "Drop");
        }

        playFx("double");
        triggerImpact("HOUSE ACCEPT");
        return {
          ...prev,
          pendingDouble: null,
          cubeMultiplier: Math.min(prev.cubeMultiplier * 2, CUBE_MAX),
          cubeOwner: "black",
        };
      });
    }, 700);

    return () => clearTimeout(decisionTimer);
  }, [game.pendingDouble, game.winner, playFx, triggerImpact]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((prev) => {
        if (!prev.pendingDouble || prev.winner) {
          return prev;
        }
        if (prev.pendingDouble.timeLeft <= 1) {
          const accepter = otherPlayer(prev.pendingDouble.from);
          playFx("double");
          return {
            ...prev,
            pendingDouble: null,
            cubeMultiplier: Math.min(prev.cubeMultiplier * 2, CUBE_MAX),
            cubeOwner: accepter,
          };
        }
        return {
          ...prev,
          pendingDouble: {
            ...prev.pendingDouble,
            timeLeft: prev.pendingDouble.timeLeft - 1,
          },
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [playFx]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((prev) => {
        if (!prev.winner || prev.rematchCountdown <= 0) {
          return prev;
        }
        return { ...prev, rematchCountdown: prev.rematchCountdown - 1 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!game.winner) {
      return;
    }
    const winTimerA = setTimeout(() => playFx("win"), 0);
    const winTimerB = setTimeout(() => playFx("win"), 120);
    const bannerTimer = setTimeout(() => triggerImpact("VICTORY"), 0);
    return () => {
      clearTimeout(winTimerA);
      clearTimeout(winTimerB);
      clearTimeout(bannerTimer);
    };
  }, [game.winner, playFx, triggerImpact]);

  useEffect(() => {
    if (!game.winner) {
      return;
    }

    const key = `${game.winner.winner}-${game.winner.netPayout}-${game.winner.reason}`;
    if (submittedSettlementKey.current === key) {
      return;
    }

    submittedSettlementKey.current = key;

    const submitSettlement = async () => {
      try {
        const response = await fetch("/api/mock-settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winner: game.winner?.winner,
            reason: game.winner?.reason,
            netPayout: game.winner?.netPayout,
            cubeMultiplier: game.winner?.cubeMultiplier,
            resultType: game.winner?.resultType,
          }),
        });
        if (!response.ok) {
          setSettlementMessage("Settlement API failed (mock).");
          return;
        }
        const data = (await response.json()) as SettlementResponse;
        setSettlementMessage(`Mock settlement complete: ${data.settlementId}`);
      } catch {
        setSettlementMessage("Settlement API unavailable (using local result only).");
      }
    };

    void submitSettlement();
  }, [game.winner]);

  const executeMove = (move: Move) => {
    setGame((prev) => {
      if (prev.winner || prev.pendingDouble) {
        return prev;
      }

      const availableMoves = getLegalMoves(prev, prev.currentPlayer, prev.dice);
      const matchingMove = availableMoves.find(
        (candidate) =>
          candidate.dieIndex === move.dieIndex &&
          candidate.from === move.from &&
          candidate.to === move.to,
      );

      if (!matchingMove) {
        return prev;
      }

      const moved = applyMove(prev, prev.currentPlayer, matchingMove);
      setMovePulse({ from: matchingMove.from, to: matchingMove.to });
      setTimeout(() => setMovePulse(null), 420);
      if (matchingMove.hit) {
        playFx("hit");
        setTimeout(() => playFx("hit"), 90);
        triggerImpact("CRITICAL HIT");
      } else {
        triggerImpact("NICE MOVE");
      }

      if (moved.off[prev.currentPlayer] === 15) {
        return finalizeGame(moved, prev.currentPlayer, "Bear Off");
      }

      const remainMoves = getLegalMoves(moved, moved.currentPlayer, moved.dice);
      if (moved.dice.length === 0 || remainMoves.length === 0) {
        return endTurn(moved);
      }

      return moved;
    });
    setSelectedFrom(null);
  };

  const tryQuickMoveByDestination = (pointIndex: number): boolean => {
    const targetMoves = legalMoves.filter((move) => move.to === pointIndex);
    if (targetMoves.length !== 1) {
      return false;
    }
    executeMove(targetMoves[0]);
    return true;
  };

  const tryQuickMoveBySource = (from: number | "bar"): boolean => {
    const sourceMoves = legalMoves.filter((move) => move.from === from);
    if (sourceMoves.length !== 1) {
      return false;
    }
    executeMove(sourceMoves[0]);
    return true;
  };

  const tryPointClick = (pointIndex: number) => {
    if (game.winner || game.pendingDouble || game.dice.length === 0 || !isPlayerTurn) {
      return;
    }

    if (selectedFrom === null) {
      if (tryQuickMoveByDestination(pointIndex)) {
        return;
      }

      if (selectableFrom.has(pointIndex) && game.points[pointIndex][game.currentPlayer] > 0) {
        if (tryQuickMoveBySource(pointIndex)) {
          return;
        }
        setSelectedFrom(pointIndex);
        setCoachHint("Select destination point to complete the move.");
      }
      return;
    }

    const direct = candidateMoves.find((move) => move.to === pointIndex);
    if (direct) {
      executeMove(direct);
      setCoachHint("");
      return;
    }

    if (selectableFrom.has(pointIndex) && game.points[pointIndex][game.currentPlayer] > 0) {
      setSelectedFrom((prev) => (prev === pointIndex ? null : pointIndex));
    }
  };

  const tryBarClick = () => {
    if (game.winner || game.pendingDouble || game.dice.length === 0 || !isPlayerTurn) {
      return;
    }

    if (selectableFrom.has("bar") && game.bar[game.currentPlayer] > 0) {
      if (selectedFrom === null && tryQuickMoveBySource("bar")) {
        return;
      }
      setSelectedFrom((prev) => (prev === "bar" ? null : "bar"));
      setCoachHint("Bar checker selected. Tap valid entry point.");
    }
  };

  const tryOffClick = () => {
    if (game.winner || game.pendingDouble || game.dice.length === 0 || !isPlayerTurn) {
      return;
    }

    if (selectedFrom === null) {
      const offMoves = legalMoves.filter((move) => move.to === "off");
      if (offMoves.length === 1) {
        executeMove(offMoves[0]);
        setCoachHint("");
      }
      return;
    }

    const offMove = candidateMoves.find((move) => move.to === "off");
    if (offMove) {
      executeMove(offMove);
      setCoachHint("");
    }
  };

  const suggestBestMove = () => {
    if (!suggestedMove) {
      setCoachHint("No suggestion available until dice are rolled.");
      return;
    }

    setSelectedFrom(suggestedMove.from);
    setCoachHint(`Suggested: ${moveLabel(suggestedMove)}`);
  };

  const rollCurrentPlayerDice = () => {
    let rolledResult: [number, number] | null = null;

    setGame((prev) => {
      if (prev.winner || prev.pendingDouble || prev.dice.length > 0) {
        return prev;
      }
      const rolled = rollDice();
      rolledResult = rolled;
      const rolledState = {
        ...prev,
        dice: diceToMoves(rolled),
        lastRoll: rolled,
      };
      const moves = getLegalMoves(rolledState, rolledState.currentPlayer, rolledState.dice);
      if (moves.length === 0) {
        return endTurn(rolledState);
      }
      return rolledState;
    });

    if (!rolledResult) {
      return;
    }
    const finalRoll = rolledResult;

    rollTimerRefs.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
    rollTimerRefs.current = [];

    setRolling(true);
    setReelLock([false, false]);
    setLeverPulled(true);
    triggerImpact("DICE ROLL");

    const totalFrames = 22;
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const delay = 28 + frame * 18;
      const timerId = setTimeout(() => {
        const lockLeft = frame >= totalFrames - 6;
        const lockRight = frame >= totalFrames - 2;

        setDisplayDice([
          lockLeft ? finalRoll[0] : Math.floor(Math.random() * 6) + 1,
          lockRight ? finalRoll[1] : Math.floor(Math.random() * 6) + 1,
        ]);
        setReelLock([lockLeft, lockRight]);

        if (frame % 3 === 0) {
          playFx("rollLoop");
        }
        if (frame === totalFrames - 7) {
          triggerImpact("ROLLING...");
        }
      }, delay);
      rollTimerRefs.current.push(timerId);
    }

    const finishTimer = setTimeout(() => {
      setDisplayDice(finalRoll);
      setReelLock([true, true]);
      playFx("rollStop");
      triggerImpact("NICE ROLL");
      setRolling(false);
      setTimeout(() => {
        setLeverPulled(false);
        setReelLock([false, false]);
      }, 220);
    }, 28 + totalFrames * 18 + 60);

    rollTimerRefs.current.push(finishTimer);
  };

  const handleRollPointerDown = () => {
    if (game.winner || game.pendingDouble || game.dice.length > 0 || !isPlayerTurn) return;
    setIsCharging(true);
  };

  const handleRollPointerUp = () => {
    if (!isCharging || !isPlayerTurn) return;
    setIsCharging(false);
    playFx("rollThrow");
    rollCurrentPlayerDice();
  };

  const offerDouble = () => {
    setGame((prev) => {
      if (prev.winner || prev.pendingDouble || prev.dice.length > 0) {
        return prev;
      }
      if (prev.currentPlayer !== "white") {
        return prev;
      }
      if (prev.cubeMultiplier >= CUBE_MAX) {
        return prev;
      }
      if (prev.cubeOwner !== "center" && prev.cubeOwner !== prev.currentPlayer) {
        return prev;
      }
      playFx("double");
      triggerImpact("DOUBLE PRESSURE");
      return {
        ...prev,
        pendingDouble: {
          from: prev.currentPlayer,
          timeLeft: DOUBLE_SECONDS,
        },
      };
    });
  };

  const acceptDouble = () => {
    setGame((prev) => {
      if (!prev.pendingDouble || prev.winner) {
        return prev;
      }
      const accepter = otherPlayer(prev.pendingDouble.from);
      playFx("double");
      triggerImpact("CUBE UP");
      return {
        ...prev,
        pendingDouble: null,
        cubeMultiplier: Math.min(prev.cubeMultiplier * 2, CUBE_MAX),
        cubeOwner: accepter,
      };
    });
  };

  const dropDouble = () => {
    setGame((prev) => {
      if (!prev.pendingDouble || prev.winner) {
        return prev;
      }
      playFx("win");
      triggerImpact("DROP WIN");
      return finalizeGame(prev, prev.pendingDouble.from, "Drop");
    });
  };

  const startRematch = () => {
    setGame((prev) => {
      if (!prev.winner || prev.rematchCountdown > 0) {
        return prev;
      }
      setSelectedFrom(null);
      setMovePulse(null);
      setSettlementMessage("");
      submittedSettlementKey.current = null;
      const nextBet = config?.defaultBet ?? prev.betAmount;
      return createInitialState(nextBet, prev.streaks);
    });
  };

  const topPointNumbers = Array.from({ length: 12 }, (_, idx) => idx + 13);
  const bottomPointNumbers = Array.from({ length: 12 }, (_, idx) => 12 - idx);
  const shownDice = rolling ? displayDice : game.lastRoll ?? displayDice;

  return (
    <div className={`page-wrap ${shakeType !== "none" ? `shaking-${shakeType}` : ""}`}>
      {/* Dopamine Flash Overlay */}
      {shakeType !== "none" && (
        <div className={`dopamine-flash flash-${shakeType}`} />
      )}
      <div className="bauhaus-shape circle" />
      <div className="bauhaus-shape square" />
      <div className="bauhaus-shape bar" />

      <main className="app-shell">
        <section className="top-strip">
          <div>
            <p className="kicker">Ninja Backgammon MVP</p>
            <h1>5-Minute Duel Board</h1>
          </div>
          <div className="timer-grid">
            <div>
              <span>Game Clock</span>
              <strong>{formatTime(game.gameTimeLeft)}</strong>
            </div>
            <div className={game.turnTimeLeft <= 3 ? "hot-clock" : ""}>
              <span>Turn Clock</span>
              <strong>{formatTime(game.turnTimeLeft)}</strong>
            </div>
            <div className={rolling ? "dice-roll" : ""}>
              <span>Cube</span>
              <strong>x{game.cubeMultiplier}</strong>
            </div>
            <div className={`dice-stage ${rolling ? "rolling" : ""} ${isCharging ? "charging" : ""}`}>
              <span>Dice</span>
              <div className="dice-pair">
                <div className={`slot-reel ${rolling ? "rolling" : ""} ${reelLock[0] ? "locked" : ""}`}>
                  <DiceFace value={shownDice[0]} />
                </div>
                <div className={`slot-reel ${rolling ? "rolling" : ""} ${reelLock[1] ? "locked" : ""}`}>
                  <DiceFace value={shownDice[1]} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hype-strip">
          <span>HYPE</span>
          <div className="hype-bar">
            <div className="hype-fill" style={{ width: `${hypeLevel}%` }} />
          </div>
          <strong>{hypeLevel}%</strong>
        </section>

        {impactText && <div className="impact-banner">{impactText}</div>}

        <section className="content-grid">
          <aside className="control-panel">
            <div className="panel-box">
              <h2>Match</h2>
              <p>You (White) vs House AI (Black)</p>
              <p>Current Turn: {isPlayerTurn ? "YOU" : "HOUSE"}</p>
              <p>
                Last Roll: {game.lastRoll ? `${game.lastRoll[0]}-${game.lastRoll[1]}` : "-"}
              </p>
              <p>Dice Queue: {game.dice.length > 0 ? game.dice.join(", ") : "(roll first)"}</p>
              <p>Cube Owner: {game.cubeOwner === "center" ? "CENTER" : game.cubeOwner.toUpperCase()}</p>
              <p className="hint-line">Move UX: source checker tap then destination point tap</p>
              <label>
                House Difficulty
                <select
                  value={houseDifficulty}
                  onChange={(event) => setHouseDifficulty(event.target.value as AiDifficulty)}
                >
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>

            <div className="panel-box">
              <h2>Bet (Mock API)</h2>
              <label>
                INJ Per Player
                <input
                  type="number"
                  min={config?.minBet ?? 0.1}
                  max={config?.maxBet ?? 100}
                  step={0.1}
                  value={game.betAmount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) {
                      return;
                    }
                    const minBet = config?.minBet ?? 0.1;
                    const maxBet = config?.maxBet ?? 100;
                    const clamped = Math.min(maxBet, Math.max(minBet, value));
                    setGame((prev) => ({ ...prev, betAmount: Number(clamped.toFixed(1)) }));
                  }}
                  disabled={Boolean(game.winner)}
                />
              </label>
              <p>Pot: {(game.betAmount * 2).toFixed(1)} INJ</p>
              <p>Streak W/B: {game.streaks.white} / {game.streaks.black}</p>
              <label>
                SFX Volume ({Math.round(sfxVolume * 100)}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(sfxVolume * 100)}
                  onChange={(event) => setSfxVolume(Number(event.target.value) / 100)}
                />
              </label>

              <label>
                BGM Volume ({Math.round(bgmVolume * 100)}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(bgmVolume * 100)}
                  onChange={(event) => setBgmVolume(Number(event.target.value) / 100)}
                />
              </label>

              <button type="button" onClick={() => setBgmOn((prev) => !prev)}>
                {bgmOn ? "Stop BGM" : "Play BGM"}
              </button>
            </div>

            <div className="panel-box action-box">
              <h2>Actions</h2>
              <button
                type="button"
                className={`${leverPulled ? "lever-pulled" : ""} ${isCharging ? "charging" : ""}`}
                onPointerDown={handleRollPointerDown}
                onPointerUp={handleRollPointerUp}
                onPointerOut={handleRollPointerUp}
                onContextMenu={(e) => e.preventDefault()}
                disabled={Boolean(game.winner || game.pendingDouble || game.dice.length > 0 || !isPlayerTurn)}
              >
                {rolling ? "ROLLING..." : isCharging ? "CHARGING !!" : "Hold to Roll"}
              </button>
              <button
                type="button"
                onClick={offerDouble}
                disabled={Boolean(
                  game.winner ||
                  game.pendingDouble ||
                  game.dice.length > 0 ||
                  !isPlayerTurn ||
                  game.cubeMultiplier >= CUBE_MAX ||
                  (game.cubeOwner !== "center" && game.cubeOwner !== game.currentPlayer),
                )}
              >
                Offer Double
              </button>
              <button
                type="button"
                onClick={suggestBestMove}
                disabled={Boolean(!isPlayerTurn || game.winner || game.pendingDouble || game.dice.length === 0)}
              >
                Suggest Move
              </button>

              {coachHint && <p className="coach-hint">{coachHint}</p>}

              {game.pendingDouble && (
                <div className="double-box">
                  <p>
                    {game.pendingDouble.from.toUpperCase()} offered double (auto-accept in {game.pendingDouble.timeLeft}s)
                  </p>
                  {game.pendingDouble.from === "black" ? (
                    <>
                      <button type="button" onClick={acceptDouble}>
                        Accept
                      </button>
                      <button type="button" onClick={dropDouble}>
                        Drop
                      </button>
                    </>
                  ) : (
                    <p>House is deciding...</p>
                  )}
                </div>
              )}

              {selectedFrom !== null && candidateMoves.length > 0 && (
                <div className="move-preview">
                  <p>Selected: {selectedFrom === "bar" ? "Bar" : `P${selectedFrom + 1}`}</p>
                  <p>{candidateMoves.map((move) => moveLabel(move)).join(" | ")}</p>
                </div>
              )}
            </div>
          </aside>

          <section className="board-panel">
            <div className="status-row compact">
              <span>Bar W/B: {game.bar.white} / {game.bar.black}</span>
              <span>Off W/B: {game.off.white} / {game.off.black}</span>
            </div>

            <div className="board-track top-row">
              <div className="half-grid">
                {topPointNumbers.slice(0, 6).map((pointNumber) => {
                  const pointIndex = pointNumber - 1;
                  const point = game.points[pointIndex];
                  return (
                    <PointCell
                      key={`top-left-${pointNumber}`}
                      pointNumber={pointNumber}
                      whiteCount={point.white}
                      blackCount={point.black}
                      orientation="top"
                      selected={selectedFrom === pointIndex}
                      selectable={selectableFrom.has(pointIndex)}
                      destination={destinationSet.has(pointIndex)}
                      pulse={movePulse?.from === pointIndex || movePulse?.to === pointIndex}
                      onClick={() => tryPointClick(pointIndex)}
                    />
                  );
                })}
              </div>

              <div className="bar-lane">
                <button
                  type="button"
                  className={`bar-off bar-button ${selectedFrom === "bar" ? "selected" : ""} ${selectableFrom.has("bar") ? "selectable" : ""} ${movePulse?.from === "bar" ? "pulse" : ""}`}
                  onClick={tryBarClick}
                >
                  Bar
                  <strong>{game.bar.white} / {game.bar.black}</strong>
                </button>
              </div>

              <div className="half-grid">
                {topPointNumbers.slice(6).map((pointNumber) => {
                  const pointIndex = pointNumber - 1;
                  const point = game.points[pointIndex];
                  return (
                    <PointCell
                      key={`top-right-${pointNumber}`}
                      pointNumber={pointNumber}
                      whiteCount={point.white}
                      blackCount={point.black}
                      orientation="top"
                      selected={selectedFrom === pointIndex}
                      selectable={selectableFrom.has(pointIndex)}
                      destination={destinationSet.has(pointIndex)}
                      pulse={movePulse?.from === pointIndex || movePulse?.to === pointIndex}
                      onClick={() => tryPointClick(pointIndex)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="board-track bottom-row">
              <div className="half-grid">
                {bottomPointNumbers.slice(0, 6).map((pointNumber) => {
                  const pointIndex = pointNumber - 1;
                  const point = game.points[pointIndex];
                  return (
                    <PointCell
                      key={`bottom-left-${pointNumber}`}
                      pointNumber={pointNumber}
                      whiteCount={point.white}
                      blackCount={point.black}
                      orientation="bottom"
                      selected={selectedFrom === pointIndex}
                      selectable={selectableFrom.has(pointIndex)}
                      destination={destinationSet.has(pointIndex)}
                      pulse={movePulse?.from === pointIndex || movePulse?.to === pointIndex}
                      onClick={() => tryPointClick(pointIndex)}
                    />
                  );
                })}
              </div>

              <div className="bar-lane">
                <button
                  type="button"
                  className={`bar-off off-button ${destinationSet.has("off") ? "destination" : ""} ${movePulse?.to === "off" ? "pulse" : ""}`}
                  onClick={tryOffClick}
                >
                  Off
                  <strong>{game.off.white} / {game.off.black}</strong>
                </button>
              </div>

              <div className="half-grid">
                {bottomPointNumbers.slice(6).map((pointNumber) => {
                  const pointIndex = pointNumber - 1;
                  const point = game.points[pointIndex];
                  return (
                    <PointCell
                      key={`bottom-right-${pointNumber}`}
                      pointNumber={pointNumber}
                      whiteCount={point.white}
                      blackCount={point.black}
                      orientation="bottom"
                      selected={selectedFrom === pointIndex}
                      selectable={selectableFrom.has(pointIndex)}
                      destination={destinationSet.has(pointIndex)}
                      pulse={movePulse?.from === pointIndex || movePulse?.to === pointIndex}
                      onClick={() => tryPointClick(pointIndex)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        </section>

        {game.winner && (
          <section className="result-panel victory-pop">
            <h2>{game.winner.winner.toUpperCase()} Wins</h2>
            <p>
              {game.winner.reason} / {game.winner.resultType} / Cube x{game.winner.cubeMultiplier}
            </p>
            <p>
              Gross {game.winner.grossPayout.toFixed(2)} INJ - Fee ({(game.winner.feeRate * 100).toFixed(1)}%) {game.winner.feeAmount.toFixed(2)} = Net {game.winner.netPayout.toFixed(2)} INJ
            </p>
            <p>
              Match Highlight: Pip W/B {calcPipCount(game, "white")} / {calcPipCount(game, "black")}
            </p>
            {game.winner.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            {settlementMessage && <p>{settlementMessage}</p>}

            <button type="button" onClick={startRematch} disabled={game.rematchCountdown > 0}>
              {game.rematchCountdown > 0 ? `다시 걸기 (${game.rematchCountdown})` : "다시 걸기"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
