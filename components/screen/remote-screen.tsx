"use client";

import { useEffect, useState, type ComponentType } from "react";
import { getGame } from "@/games/registry";
import type { GameProps } from "@/games/types";
import { useController } from "@/lib/realtime/hooks";
import type { ControllerStatus } from "@/lib/realtime/controller-client";
import { KEY_LABELS, LocalPad } from "@/lib/input/local-pad";
import type { PlayerSlot } from "@/lib/realtime/protocol";
import { Button, PLAYER_COLORS, Text, Wordmark, palette } from "@/design-system";
import { KeyHints } from "@/components/play/key-hints";
import { Seat } from "@/components/host/seat";

const STATUS_COPY: Partial<Record<ControllerStatus, { title: string; body: string }>> = {
  connecting: { title: "Finding the room…", body: "Connecting you to your partner's screen." },
  reconnecting: { title: "Reconnecting…", body: "Hang on, getting you back in." },
  "room-not-found": { title: "Can't find that room", body: "Ask your partner to keep their room open, then try again." },
  outdated: { title: "Refresh needed", body: "This page is out of date — reload to join." },
};

/**
 * A partner's laptop, far away. Shows the game the host is running, live,
 * and turns this keyboard (or a gamepad) into their controller. Runs no game
 * logic: the host simulates, this screen mirrors.
 */
export function RemoteScreen({ code, name }: { code: string; name: string }) {
  const { client, status, player, layout, rtt, mode, lobby, spectating } = useController(code, name, { screen: true });
  const [Game, setGame] = useState<{ id: string; C: ComponentType<GameProps> } | null>(null);
  const gameId = lobby.gameId;
  const color = player ? PLAYER_COLORS[player.slot] : palette.fgPrimary;

  // This keyboard is the controller. Spectators just watch.
  useEffect(() => {
    if (!client || spectating) return;
    return new LocalPad((s) => client.sendInput(s)).attach(window);
  }, [client, spectating]);

  useEffect(() => {
    let live = true;
    const game = getGame(gameId);
    if (!game?.load) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- back to the lobby
      setGame(null);
      return;
    }
    void game.load().then((mod) => live && setGame({ id: game.id, C: mod.default }));
    return () => {
      live = false;
    };
  }, [gameId]);

  const notice = status !== "connected" ? STATUS_COPY[status] : undefined;

  if (!notice && client && Game && Game.id === gameId) {
    return (
      <>
        <Game.C role="screen" feed={client} players={lobby.players} onExit={() => client.command("exit")} />
        {!spectating && <KeyHints layout={layout.layout} color={color} className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 animate-fade-up" />}
        <LinkReadout rtt={rtt} mode={mode} />
      </>
    );
  }

  const seats = ([0, 1] as PlayerSlot[]).map((slot) => lobby.players.find((p) => p.slot === slot));
  const partner = lobby.players.find((p) => p.id !== player?.id && p.connected);
  const title = spectating ? "You're watching" : partner ? `You're in with ${partner.name}.` : "You're in.";
  const body = spectating
    ? "Both seats are taken — you'll see the game as it happens."
    : partner
      ? "They pick the game on their screen. It'll start here at the same moment."
      : "Waiting for your partner to join.";

  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-player-one/10 blur-[140px] animate-float" />
        <div className="absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-player-two/10 blur-[140px] animate-float" style={{ animationDelay: "-4s" }} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Wordmark />
        <div className="flex items-center gap-2.5 rounded-full border border-line-subtle bg-surface-base/50 px-4 py-2 text-sm backdrop-blur-xl">
          <span className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-status-online" : "bg-accent-glow animate-pulse-soft"}`} />
          <span className="text-fg-secondary">
            {status === "connected" ? `Room ${code}${rtt !== null ? ` · ${Math.round(rtt)} ms` : ""}` : "Connecting…"}
          </span>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-8 pb-16 lg:flex-row lg:items-center lg:justify-between">
        {notice ? (
          <div className="max-w-md animate-fade-up">
            <Text as="h1" variant="display-m">
              {notice.title}
            </Text>
            <Text variant="body-l" className="mt-4">
              {notice.body}
            </Text>
            {(status === "room-not-found" || status === "outdated") && (
              <Button variant="ghost" className="mt-8" onClick={() => (status === "outdated" ? location.reload() : client?.retry())}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="max-w-md animate-fade-up">
              <Text variant="overline">Long distance · room {code}</Text>
              <Text as="h1" variant="display-m" className="mt-4">
                {title}
              </Text>
              <Text variant="body-l" className="mt-4">
                {body}
              </Text>
              {!spectating && (
                <Text variant="body-s" className="mt-8">
                  You&apos;ll play on this keyboard — {KEY_LABELS.move}, {KEY_LABELS.a} and {KEY_LABELS.b}. A gamepad works too.
                </Text>
              )}
            </div>
            <aside className="flex w-full max-w-[380px] flex-col gap-2.5 animate-fade-up" style={{ animationDelay: "120ms" }}>
              <Seat slot={0} player={seats[0]} />
              <Seat slot={1} player={seats[1]} />
              <Text variant="body-s" className="px-1 pt-2">
                Tip: put each other on a call — it&apos;s half the fun.
              </Text>
            </aside>
          </>
        )}
      </section>
    </main>
  );
}

/** Quiet connection readout in the corner while playing. */
function LinkReadout({ rtt, mode }: { rtt: number | null; mode: "p2p" | "relay" | null }) {
  if (rtt === null) return null;
  return (
    <span className="pointer-events-none fixed bottom-4 right-4 z-10 font-mono text-[11px] text-fg-tertiary">
      {Math.round(rtt)} ms · {mode === "relay" ? "relay" : "direct"}
    </span>
  );
}
