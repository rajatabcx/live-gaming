import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import { Text } from "@/design-system";

const SLOT_STYLE: Record<PlayerSlot, { dot: string; label: string }> = {
  0: { dot: "bg-player-one shadow-[0_0_24px_var(--color-player-one)]", label: "Player one" },
  1: { dot: "bg-player-two shadow-[0_0_24px_var(--color-player-two)]", label: "Player two" },
};

export function Seat({ slot, player }: { slot: PlayerSlot; player?: PlayerInfo }) {
  const style = SLOT_STYLE[slot];
  const state = !player ? "empty" : player.connected ? "here" : "away";
  return (
    <div className="flex items-center gap-4 rounded-md border border-line-subtle bg-surface-base/50 px-5 py-4 backdrop-blur-xl">
      <span
        className={`h-3 w-3 shrink-0 rounded-full transition-all duration-700 ${
          state === "here" ? style.dot : "bg-fg-primary/15"
        } ${state === "away" ? "animate-pulse-soft" : ""}`}
      />
      <div className="min-w-0">
        <Text variant="overline">{style.label}</Text>
        <Text tone="primary" className="truncate">
          {state === "empty" && <span className="text-fg-secondary">Waiting for a phone…</span>}
          {state === "here" && player!.name}
          {state === "away" && <span className="text-fg-secondary">{player!.name} · reconnecting</span>}
        </Text>
      </div>
    </div>
  );
}
