"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Panel, Text, cx } from "@/design-system";
import type { Session } from "./session";

const TITLE_SECONDS = 2.6;

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Everything on top of the canvas. Re-renders only on HUD state changes, never per frame. */
export function Hud({ session }: { session: Session }) {
  const hud = useSyncExternalStore(session.subscribe, session.getHud, session.getHud);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <Text variant="overline">
            Tongue Tied · {hud.levelIndex + 1} / {hud.levelCount}
          </Text>
          <Text variant="label-m" tone="secondary">
            {hud.name}
          </Text>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Badge tone="glow" className="mr-2 tabular-nums">
            {hud.fireflies} / {hud.firefliesTotal} fireflies
          </Badge>
          <Button variant="ghost" onClick={() => session.restartLevel()}>
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

      <TitleCard key={hud.levelKey} index={hud.levelIndex} name={hud.name} subtitle={hud.subtitle} />

      <footer className="flex justify-center">
        {hud.hint && hud.phase === "playing" && (
          <Panel key={hud.hint} className="animate-fade-up rounded-full px-5 py-3">
            <Text variant="body-s">{hud.hint}</Text>
          </Panel>
        )}
      </footer>

      {hud.phase === "cleared" && (
        <Overlay>
          <Text variant="overline">Level {hud.levelIndex + 1} cleared</Text>
          <Text as="h2" variant="display-italic" className="mt-3">
            {hud.clearLine}
          </Text>
          <div className="mt-6 flex justify-center gap-8">
            <Stat label="Time" value={formatTime(hud.clearTime)} />
            <Stat label="Fireflies" value={`${hud.fireflies} / ${hud.firefliesTotal}`} />
          </div>
          <div className="pointer-events-auto mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={() => session.advance()}>
              {hud.levelIndex + 1 < hud.levelCount ? "Next level" : "Finish"}
            </Button>
            <Text variant="body-s" tone="tertiary">
              or press Jump on either phone
            </Text>
          </div>
        </Overlay>
      )}

      {hud.phase === "finale" && (
        <Overlay>
          <Text variant="overline">The end — for now</Text>
          <Text as="h2" variant="display-l" className="mt-3">
            You made it up <span className="font-display italic">together.</span>
          </Text>
          <Text variant="body-m" className="mt-4">
            {hud.runFireflies} of {hud.runFirefliesTotal} fireflies found along the way.
          </Text>
          <div className="pointer-events-auto mt-8 flex justify-center gap-3">
            <Button size="lg" onClick={() => session.advance()}>
              Play again
            </Button>
            <Button size="lg" variant="ghost" onClick={() => session.exit()}>
              Back to lobby
            </Button>
          </div>
          <Text variant="body-s" tone="tertiary" className="mt-4">
            Jump to play again · Tongue for the lobby
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

function TitleCard({ index, name, subtitle }: { index: number; name: string; subtitle: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), TITLE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      aria-live="polite"
      className={cx(
        "absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-700",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="animate-fade-up">
        <Text variant="overline">Level {index + 1}</Text>
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
      <Panel className="animate-fade-up w-[min(92vw,460px)] px-10 py-10 text-center">{children}</Panel>
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
