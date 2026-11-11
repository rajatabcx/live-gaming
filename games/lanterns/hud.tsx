"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Panel, Text, cx } from "@/design-system";
import type { Session } from "./session";

const TITLE_SECONDS = 3.2;
const ORDINALS = ["one", "two", "three", "four", "five"];

/** Deliberately sparse: the sky is the interface. Re-renders only on HUD state changes. */
export function Hud({ session }: { session: Session }) {
  const hud = useSyncExternalStore(session.subscribe, session.getHud, session.getHud);
  const quiet = hud.phase === "dawn";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
      <header className={cx("flex items-start justify-between gap-6 transition-opacity duration-1000", quiet && "opacity-0")}>
        <Text variant="overline">
          Lanterns · Chapter {hud.chapter + 1} of {hud.chapterCount}
        </Text>
        <div className="pointer-events-auto flex items-center gap-2">
          <Badge tone="glow" className="mr-2 tabular-nums">
            {hud.lit} / {hud.total} stars
          </Badge>
          <Button variant="ghost" onClick={() => session.toggleMute()} aria-pressed={hud.muted}>
            {hud.muted ? "Sound off" : "Sound on"}
          </Button>
          <Button variant="ghost" onClick={() => session.exit()}>
            Exit
          </Button>
        </div>
      </header>

      {hud.phase === "playing" && <TitleCard key={hud.chapterKey} chapter={hud.chapter} subtitle={hud.subtitle} />}

      {(hud.phase === "found" || hud.phase === "rising") && (
        <div
          aria-live="polite"
          className={cx(
            "absolute inset-x-0 top-[14%] flex flex-col items-center text-center transition-opacity duration-1000",
            hud.phase === "rising" ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="animate-fade-up">
            <Text variant="overline">Constellation found</Text>
            <Text as="h2" variant="display-l" className="mt-3">
              {hud.name}
            </Text>
          </div>
        </div>
      )}

      <footer className="flex justify-center">
        {hud.hint && hud.phase === "playing" && (
          <Panel key={hud.hint} className="animate-fade-up rounded-full px-5 py-3">
            <Text variant="body-s">{hud.hint}</Text>
          </Panel>
        )}
      </footer>

      {hud.phase === "dawn" && <Dawn session={session} stars={hud.nightStars} total={hud.nightTotal} harmonies={hud.harmonies} />}

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

function TitleCard({ chapter, subtitle }: { chapter: number; subtitle: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), TITLE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      aria-live="polite"
      className={cx(
        "absolute inset-x-0 top-[22%] flex flex-col items-center text-center transition-opacity duration-1000",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="animate-fade-up">
        <Text variant="overline">Chapter {ORDINALS[chapter] ?? chapter + 1}</Text>
        <Text variant="display-italic" className="mt-3">
          {subtitle}
        </Text>
      </div>
    </div>
  );
}

/** Waits for the sunrise before saying anything. */
function Dawn({ session, stars, total, harmonies }: { session: Session; stars: number; total: number; harmonies: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 2500);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  return (
    <Overlay>
      <Text variant="overline">Morning</Text>
      <Text as="h2" variant="display-l" className="mt-3">
        You lit up the <span className="font-display italic">whole night.</span>
      </Text>
      <Text variant="body-m" className="mt-4 tabular-nums">
        {stars} of {total} stars · {harmonies} {harmonies === 1 ? "harmony" : "harmonies"}
      </Text>
      <div className="pointer-events-auto mt-8 flex justify-center gap-3">
        <Button size="lg" onClick={() => session.playAgain()}>
          Another night
        </Button>
        <Button size="lg" variant="ghost" onClick={() => session.exit()}>
          Back to lobby
        </Button>
      </div>
      <Text variant="body-s" tone="tertiary" className="mt-4">
        Glow to play again · B for the lobby
      </Text>
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-surface-base/20">
      <Panel className="animate-fade-up w-[min(92vw,500px)] px-10 py-10 text-center">{children}</Panel>
    </div>
  );
}
