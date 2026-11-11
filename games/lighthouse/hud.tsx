"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge, Button, Panel, Text, cx } from "@/design-system";
import { BOAT } from "./sim/constants";
import type { Session } from "./session";

const TITLE_SECONDS = 4;
const ORDINALS = ["one", "two", "three", "four", "five"];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Quiet chrome over the sea. Who does what is drawn per view on the canvas. */
export function Hud({ session }: { session: Session }) {
  const hud = useSyncExternalStore(session.subscribe, session.getHud, session.getHud);
  const atSea = hud.phase === "playing";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-6 sm:p-8">
      <header className={cx("flex items-start justify-between gap-6 transition-opacity duration-700", !atSea && "opacity-40")}>
        <div>
          <Text variant="overline">
            Lighthouse · Night {hud.night + 1} of {hud.nightCount}
          </Text>
          <Text variant="body-s" tone="primary" className="mt-1">
            {hud.name}
          </Text>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <Badge tone={hud.hull <= 1 ? "p1" : "neutral"} className="mr-1">
            <span className="sr-only">Hull</span>
            <span aria-hidden className="flex gap-1">
              {Array.from({ length: BOAT.hull }, (_, i) => (
                <span key={i} className={cx("h-1.5 w-3 rounded-full", i < hud.hull ? "bg-fg-primary" : "bg-fg-primary/20")} />
              ))}
            </span>
          </Badge>
          <Badge tone="glow" className="mr-2 tabular-nums">
            {hud.bottles} / {hud.bottlesTotal} bottles
          </Badge>
          <Button variant="ghost" onClick={() => session.restartNight()}>
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

      {atSea && hud.hint && (
        <div className="mt-4 flex justify-center">
          <Panel key={hud.hint} className="animate-fade-up rounded-full px-5 py-3">
            <Text variant="body-s">{hud.hint}</Text>
          </Panel>
        </div>
      )}

      {atSea && <TitleCard key={hud.nightKey} night={hud.night} subtitle={hud.subtitle} keeper={hud.keeper} sailor={hud.sailor} />}

      {hud.phase === "docked" && (
        <Overlay>
          <Text variant="overline">Night {ORDINALS[hud.night] ?? hud.night + 1}</Text>
          <Text as="h2" variant="display-l" className="mt-3">
            Home <span className="font-display italic">safe.</span>
          </Text>
          <Text variant="body-m" className="mt-4 tabular-nums">
            {clock(hud.time)} at sea · {hud.bottles} of {hud.bottlesTotal} bottles · {hud.scrapes === 0 ? "not a scratch" : `${hud.scrapes} ${hud.scrapes === 1 ? "scrape" : "scrapes"}`}
          </Text>
          {hud.night + 1 < hud.nightCount && (
            <Text variant="body-s" tone="tertiary" className="mt-2">
              Next night you swap — {hud.sailor || "the sailor"} keeps the light.
            </Text>
          )}
          <div className="pointer-events-auto mt-8 flex justify-center">
            <Button size="lg" onClick={() => session.advance()}>
              {hud.night + 1 < hud.nightCount ? "Next night" : "Finish"}
            </Button>
          </div>
        </Overlay>
      )}

      {hud.phase === "finale" && (
        <Overlay>
          <Text variant="overline">Dawn</Text>
          <Text as="h2" variant="display-l" className="mt-3">
            Every night, <span className="font-display italic">home.</span>
          </Text>
          <Text variant="body-m" className="mt-4 tabular-nums">
            {clock(hud.runTime)} at sea · {hud.runBottles} of {hud.runBottlesTotal} bottles · {hud.runScrapes} {hud.runScrapes === 1 ? "scrape" : "scrapes"}
          </Text>
          <div className="pointer-events-auto mt-8 flex justify-center gap-3">
            <Button size="lg" onClick={() => session.advance()}>
              Sail again
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

function TitleCard({ night, subtitle, keeper, sailor }: { night: number; subtitle: string; keeper: string; sailor: string }) {
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
        <Text variant="overline">Night {ORDINALS[night] ?? night + 1}</Text>
        <Text variant="display-italic" className="mt-3">
          {subtitle}
        </Text>
        {keeper && sailor && (
          <Text variant="body-s" className="mt-3">
            {keeper} keeps the light · {sailor} sails
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
