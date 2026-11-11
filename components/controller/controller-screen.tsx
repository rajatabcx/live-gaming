"use client";

import { useEffect, useState } from "react";
import { useController } from "@/lib/realtime/hooks";
import type { ControllerStatus } from "@/lib/realtime/controller-client";
import { Button } from "@/components/ui/button";
import { Gamepad } from "./gamepad";

const NAME_KEY = "tandem.name";
const PLAYER_COLOR = ["#ff8a7a", "#8fb8ff"] as const;

const STATUS_COPY: Partial<Record<ControllerStatus, { title: string; body: string }>> = {
  connecting: { title: "Finding the room…", body: "Keep this phone near the screen." },
  reconnecting: { title: "Reconnecting…", body: "Hang on, getting you back in." },
  "room-not-found": {
    title: "Can't find that room",
    body: "Check the screen is still showing the code, then try again.",
  },
  "room-full": { title: "This room is full", body: "Two players are already in." },
  outdated: { title: "Refresh needed", body: "This page is out of date — reload to join." },
};

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Best-effort: keep the phone awake and go fullscreen where supported. */
async function enterPlayMode() {
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
  } catch {}
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } }).wakeLock?.request(
      "screen",
    );
  } catch {}
}

export function ControllerScreen({ code }: { code: string }) {
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage after hydration
    setDraft(readName());
  }, []);

  if (name === null) {
    return (
      <main className="flex min-h-dvh flex-1 flex-col justify-between px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16">
        <div className="animate-fade-up">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-cream-faint">Room {code}</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.02]">What should we call you?</h1>
        </div>
        <form
          className="flex flex-col gap-3 animate-fade-up"
          style={{ animationDelay: "100ms" }}
          onSubmit={(e) => {
            e.preventDefault();
            const n = draft.trim().slice(0, 16) || "Player";
            try {
              localStorage.setItem(NAME_KEY, n);
            } catch {}
            enterPlayMode();
            setName(n);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={16}
            placeholder="Your name"
            className="h-14 rounded-2xl border border-line-strong bg-ink-raised px-5 text-lg outline-none transition-colors placeholder:text-cream-faint focus:border-cream/40"
          />
          <Button type="submit" className="h-14">
            Join room
          </Button>
        </form>
      </main>
    );
  }

  return <Connected code={code} name={name} />;
}

function Connected({ code, name }: { code: string; name: string }) {
  const { client, status, player, layout, rtt } = useController(code, name);
  const color = player ? PLAYER_COLOR[player.slot] : "#f4ece2";
  const notice = status !== "connected" ? STATUS_COPY[status] : undefined;

  return (
    <main className="touch-surface fixed inset-0 flex flex-col bg-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full blur-[100px] transition-colors duration-700"
        style={{ background: `${color}33` }}
      />
      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 16px ${color}` }} />
          <span className="text-sm">{name}</span>
        </div>
        <span className="font-mono text-[11px] text-cream-faint">
          {status === "connected" && rtt !== null ? `${Math.round(rtt)} ms` : code}
        </span>
      </header>

      {layout.caption && status === "connected" && (
        <p className="relative z-10 px-5 pt-3 text-center text-sm text-cream-muted">{layout.caption}</p>
      )}

      <div className="relative z-10 flex-1 pb-[env(safe-area-inset-bottom)]">
        {notice ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <h2 className="font-display text-4xl">{notice.title}</h2>
            <p className="mt-3 text-cream-muted">{notice.body}</p>
            {(status === "room-not-found" || status === "outdated") && (
              <Button
                variant="ghost"
                className="mt-8"
                onClick={() => (status === "outdated" ? location.reload() : client?.retry())}
              >
                Try again
              </Button>
            )}
          </div>
        ) : (
          client && <Gamepad client={client} layout={layout.layout} color={color} />
        )}
      </div>

      {layout.layout.kind === "lobby" && status === "connected" && (
        <p className="relative z-10 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-cream-faint">
          You&apos;re in. Look at the big screen.
        </p>
      )}
    </main>
  );
}
