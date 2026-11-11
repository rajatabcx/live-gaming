"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Panel, Text, cx } from "@/design-system";
import type { Session } from "./session";

const TITLE_SECONDS = 1.8;

const seconds = (s: number) => `${s.toFixed(1)}s`;

/** Everything on top of the canvas. Re-renders only on HUD state changes, never per frame. */
export function Hud({ session }: { session: Session }) {
  const hud = useSyncExternalStore(session.subscribe, session.getHud, session.getHud);
  const [p1, p2] = hud.names;
  const winnerName = hud.heatWinner !== null ? hud.names[hud.heatWinner] : null;
  const champName = hud.matchWinner !== null ? hud.names[hud.matchWinner] : null;

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <Text variant="overline">
            Wobble Run · Heat {hud.heat + 1} of {hud.heatCount}
          </Text>
          <Text variant="label-m" tone="secondary">
            {hud.name}
          </Text>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="mr-2 flex items-center gap-1.5" aria-label={`Score: ${p1} ${hud.wins[0]}, ${p2} ${hud.wins[1]}`}>
            <Badge tone="p1" className="tabular-nums">
              {p1} · {hud.wins[0]}
            </Badge>
            <Badge tone="p2" className="tabular-nums">
              {p2} · {hud.wins[1]}
            </Badge>
          </div>
          <Button variant="ghost" onClick={() => session.restartHeat()}>
            Restart
          </Button>
          <Button variant="ghost" onClick={() => session.toggleMute()} aria-pressed={hud.muted}>
            {hud.muted ? "Sound off" : "Sound on"}
          </Button>
          <Button variant="ghost" onClick={() => session.exit()}>
            Exit
          </Button>
        </div>
      </header>

      <TitleCard key={hud.heatKey} heat={hud.heat} name={hud.name} subtitle={hud.subtitle} />

      {hud.countdown !== null && (
        <div aria-live="assertive" className="absolute inset-0 flex items-center justify-center">
          <Text key={hud.countdown} as="p" variant="display-xl" className="animate-fade-up tabular-nums drop-shadow-[0_6px_30px_rgba(0,0,0,0.35)]">
            {hud.countdown === 0 ? "Go!" : hud.countdown}
          </Text>
        </div>
      )}

      <footer className="flex justify-center">
        {(hud.phase === "intro" || hud.countdown !== null) && (
          <Panel className="animate-fade-up rounded-full px-5 py-3">
            <Text variant="body-s">Stick to run · Jump · Dive to lunge — and shove</Text>
          </Panel>
        )}
      </footer>

      {hud.phase === "heat-over" && (
        <Overlay>
          <Text variant="overline">
            Heat {hud.heat + 1} · {hud.name}
          </Text>
          <Text as="h2" variant="display-l" className="mt-3">
            {winnerName} <span className="font-display italic">takes it.</span>
          </Text>
          <Text variant="body-m" className="mt-2">
            {hud.line}
          </Text>
          <div className="mt-6 flex justify-center gap-8">
            <Stat label="Time" value={seconds(hud.heatTime)} />
            <Stat label="Margin" value={hud.margin === null ? "Ran out of time" : `+${seconds(hud.margin)}`} />
            <Stat label="Score" value={`${hud.wins[0]} – ${hud.wins[1]}`} />
          </div>
          <div className="pointer-events-auto mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={() => session.advance()}>
              Next heat
            </Button>
            <Text variant="body-s" tone="tertiary">
              or press Jump on either phone
            </Text>
          </div>
        </Overlay>
      )}

      {hud.phase === "match-over" && (
        <Overlay>
          <Text variant="overline">Match over · {hud.wins[0]} – {hud.wins[1]}</Text>
          <Text as="h2" variant="display-l" className="mt-3">
            {champName ? (
              <>
                {champName} <span className="font-display italic">wins.</span>
              </>
            ) : (
              "A perfect tie."
            )}
          </Text>
          <Text variant="body-m" className="mt-2">
            {hud.line}
          </Text>
          <div className="pointer-events-auto mt-8 flex justify-center gap-3">
            <Button size="lg" onClick={() => session.advance()}>
              Rematch
            </Button>
            <Button size="lg" variant="ghost" onClick={() => session.exit()}>
              Back to lobby
            </Button>
          </div>
          <Text variant="body-s" tone="tertiary" className="mt-4">
            Jump for a rematch · Dive for the lobby
          </Text>
        </Overlay>
      )}

      {hud.waitingFor && (
        <Overlay>
          <span aria-hidden className="mx-auto mb-4 block h-2 w-2 animate-pulse-soft rounded-full bg-accent-glow" />
          <Text variant="label-m">Waiting for {hud.waitingFor}…</Text>
          <Text variant="body-s" tone="tertiary" className="mt-2">
            Paused. Their phone will reconnect on its own.
          </Text>
        </Overlay>
      )}
    </div>
  );
}

function TitleCard({ heat, name, subtitle }: { heat: number; name: string; subtitle: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), TITLE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      aria-live="polite"
      className={cx(
        "absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-500",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="animate-fade-up">
        <Text variant="overline">Heat {heat + 1}</Text>
        <Text as="h1" variant="display-l" className="mt-3">
          {name}
        </Text>
        <Text variant="display-italic" tone="secondary" className="mt-1">
          {subtitle}
        </Text>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-base/30">
      <Panel className="animate-fade-up w-[min(92vw,520px)] px-10 py-10 text-center">{children}</Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Text variant="overline">{label}</Text>
      <Text variant="label-m" className="tabular-nums">
        {value}
      </Text>
    </div>
  );
}
