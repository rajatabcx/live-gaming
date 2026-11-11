import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";

const SLOT_STYLE: Record<PlayerSlot, { dot: string; label: string }> = {
  0: { dot: "bg-p1 shadow-[0_0_24px_var(--p1)]", label: "Player one" },
  1: { dot: "bg-p2 shadow-[0_0_24px_var(--p2)]", label: "Player two" },
};

export function Seat({ slot, player }: { slot: PlayerSlot; player?: PlayerInfo }) {
  const style = SLOT_STYLE[slot];
  const state = !player ? "empty" : player.connected ? "here" : "away";
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-ink/50 px-5 py-4 backdrop-blur-xl">
      <span
        className={`h-3 w-3 shrink-0 rounded-full transition-all duration-700 ${
          state === "here" ? style.dot : "bg-cream/15"
        } ${state === "away" ? "animate-pulse-soft" : ""}`}
      />
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-cream-faint">{style.label}</p>
        <p className="truncate text-[15px]">
          {state === "empty" && <span className="text-cream-muted">Waiting for a phone…</span>}
          {state === "here" && player!.name}
          {state === "away" && <span className="text-cream-muted">{player!.name} · reconnecting</span>}
        </p>
      </div>
    </div>
  );
}
