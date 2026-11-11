"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { getGame } from "@/games/registry";
import { isPlayable, type GameProps } from "@/games/types";
import { useHostRoom } from "@/lib/realtime/hooks";
import type { HostStatus } from "@/lib/realtime/host-room";
import { joinUrl } from "@/lib/join-url";
import { createRoomCode } from "@/lib/room-code";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { GamePicker } from "./game-picker";
import { JoinPanel } from "./join-panel";
import { Seat } from "./seat";
import { WarmupField } from "./warmup-field";

const STATUS_COPY: Record<HostStatus, string> = {
  starting: "Opening room…",
  open: "Room open",
  reconnecting: "Reconnecting…",
  "code-taken": "Room already open",
  error: "Connection problem",
};

export function HostScreen({ code }: { code: string }) {
  const router = useRouter();
  const { room, status, players } = useHostRoom(code);
  const [gameId, setGameId] = useState<string | null>(null);
  const [Game, setGame] = useState<ComponentType<GameProps> | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on window.location
    setUrl(joinUrl(code));
  }, [code]);

  const game = getGame(gameId);
  const bothHere = players.filter((p) => p.connected).length === 2;
  const seats = useMemo(() => [players.find((p) => p.slot === 0), players.find((p) => p.slot === 1)], [players]);

  const start = async () => {
    if (!game?.load || !room) return;
    room.setGame(game.id);
    const mod = await game.load();
    setGame(() => mod.default);
  };

  const exit = () => {
    room?.setGame(null);
    room?.setLayout({ kind: "lobby" });
    setGame(null);
  };

  if (Game && room) return <Game room={room} players={players} onExit={exit} />;

  if (status === "code-taken") {
    return (
      <Centered>
        <h1 className="font-display text-5xl">This room is open elsewhere</h1>
        <p className="mt-4 max-w-sm text-cream-muted">
          Room {code} is already running in another tab or on another screen.
        </p>
        <Button className="mt-8" onClick={() => router.replace(`/room/${createRoomCode()}`)}>
          Open a fresh room
        </Button>
      </Centered>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-p1/10 blur-[140px]" />
        <div className="absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-p2/10 blur-[140px]" />
      </div>
      {room && <WarmupField room={room} players={players} />}

      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Wordmark />
        <div className="flex items-center gap-2.5 rounded-full border border-line bg-ink/50 px-4 py-2 text-sm backdrop-blur-xl">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "open" ? "bg-[#7ee0a1]" : status === "error" ? "bg-p1" : "bg-glow animate-pulse-soft"
            }`}
          />
          <span className="text-cream-muted">{STATUS_COPY[status]}</span>
        </div>
      </header>

      <section className="pointer-events-none relative z-10 grid flex-1 items-center gap-10 px-8 pb-10 lg:grid-cols-[auto_1fr_380px]">
        <div className="pointer-events-auto animate-fade-up">{url && <JoinPanel url={url} code={code} />}</div>

        <div className="hidden text-center lg:block">
          <p className="font-display text-3xl italic text-cream-faint">
            {bothHere ? "Move around. Find each other." : "Your room is ready."}
          </p>
        </div>

        <aside className="pointer-events-auto flex flex-col gap-6 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <div className="flex flex-col gap-2.5">
            <Seat slot={0} player={seats[0]} />
            <Seat slot={1} player={seats[1]} />
          </div>

          <div className="rounded-[28px] border border-line bg-ink/60 p-3 backdrop-blur-2xl">
            <p className="px-3 pb-2 pt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cream-faint">
              Choose a game
            </p>
            <GamePicker selected={gameId} onSelect={setGameId} />
          </div>

          <Button disabled={!game || !isPlayable(game) || !bothHere} onClick={start} className="h-14">
            {!bothHere ? "Waiting for both players" : !game ? "Pick a game" : `Play ${game.title}`}
          </Button>
        </aside>
      </section>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-6 text-center">{children}</main>
  );
}
