"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Panel, Text, cx } from "@/design-system";
import type { Session } from "./session";

const TITLE_SECONDS = 4;
const ORDINALS = ["one", "two", "three", "four", "five"];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Quiet chrome over the rooms. Which room is whose is drawn per view on the canvas. */
export function Hud({ session }: { session: Session }) {
  const hud = useSyncExternalStore(session.subscribe, session.getHud, session.getHud);
  const playing = hud.phase === "playing";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-6 sm:p-8">
      <header className={cx("flex items-start justify-between gap-6 transition-opacity duration-700", !playing && "opacity-40")}>
        <div>
          <Text variant="overline">
            Keyhole · Chapter {hud.chapter + 1} of {hud.chapterCount}
          </Text>
          <Text variant="body-s" tone="primary" className="mt-1">
            {hud.name}
          </Text>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <Badge tone={hud.unlocked ? "glow" : "neutral"} className="mr-2">
            {hud.unlocked ? "Door unlocked" : "Door locked"}
          </Badge>
          <Button variant="ghost" onClick={() => session.restartChapter()}>
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

      {playing && hud.hint && (
        <div className="mt-4 flex justify-center">
          <Panel key={hud.hint} className="animate-fade-up rounded-full px-5 py-3">
            <Text variant="body-s">{hud.hint}</Text>
          </Panel>
        </div>
      )}

      {playing && <TitleCard key={hud.chapterKey} chapter={hud.chapter} subtitle={hud.subtitle} rooms={hud.rooms} names={hud.names} />}

      {hud.phase === "done" && (
        <Overlay>
          <Text variant="overline">Chapter {ORDINALS[hud.chapter] ?? hud.chapter + 1}</Text>
          <Text as="h2" variant="display-l" className="mt-3">
            Together <span className="font-display italic">again.</span>
          </Text>
          <Text variant="body-m" className="mt-4 tabular-nums">
            {clock(hud.time)} apart · {hud.wrongs === 0 ? "not one wrong guess" : `${hud.wrongs} wrong ${hud.wrongs === 1 ? "guess" : "guesses"}`}
          </Text>
          <div className="pointer-events-auto mt-8 flex justify-center">
            <Button size="lg" onClick={() => session.advance()}>
              {hud.chapter + 1 < hud.chapterCount ? "Next room" : "Finish"}
            </Button>
          </div>
        </Overlay>
      )}

      {hud.phase === "finale" && (
        <Overlay>
          <Text variant="overline">The end</Text>
          <Text as="h2" variant="display-l" className="mt-3">
            Every door, <span className="font-display italic">open.</span>
          </Text>
          <Text variant="body-m" className="mt-4 tabular-nums">
            {clock(hud.runTime)} of talking through walls
            {hud.runEyes > 0 && ` · caught each other peeking ${hud.runEyes === 1 ? "once" : `${hud.runEyes} times`}`}
          </Text>
          <div className="pointer-events-auto mt-8 flex justify-center gap-3">
            <Button size="lg" onClick={() => session.advance()}>
              Play again
            </Button>
            <Button size="lg" variant="ghost" onClick={() => session.exit()}>
              Back to lobby
            </Button>
          </div>
        </Overlay>
      )}

      {hud.waitingFor && (
        <Overlay>
          <span aria-hidden className="mx-auto mb-4 block h-2 w-2 animate-pulse-soft rounded-full bg-accent-glow" />
          <Text variant="label-m">Waiting for {hud.waitingFor}…</Text>
          <Text variant="body-s" tone="tertiary" className="mt-2">
            Paused. They&apos;ll reconnect on their own.
          </Text>
        </Overlay>
      )}
    </div>
  );
}

function TitleCard({ chapter, subtitle, rooms, names }: { chapter: number; subtitle: string; rooms: [string, string]; names: [string, string] }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), TITLE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      aria-live="polite"
      className={cx(
        "absolute inset-x-0 top-[20%] flex flex-col items-center text-center transition-opacity duration-1000",
        shown ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="animate-fade-up">
        <Text variant="overline">Chapter {ORDINALS[chapter] ?? chapter + 1}</Text>
        <Text variant="display-italic" className="mt-3">
          {subtitle}
        </Text>
        {names[0] && names[1] && (
          <Text variant="body-s" className="mt-3">
            {names[0]} in the {rooms[0].toLowerCase()} · {names[1]} in the {rooms[1].toLowerCase()}
          </Text>
        )}
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
