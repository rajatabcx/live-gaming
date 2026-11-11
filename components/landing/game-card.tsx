import type { GameDefinition } from "@/games/types";
import { isPlayable } from "@/games/types";

const MOOD_LABEL: Record<GameDefinition["mood"], string> = {
  "co-op": "Co-op",
  versus: "Versus",
  chill: "Unwind",
  talk: "Talk",
};

/** Abstract generative cover: two orbs in the game's palette. No images to load. */
export function GameCard({ game, index }: { game: GameDefinition; index: number }) {
  const [a, b] = game.palette;
  const playable = isPlayable(game);
  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-ink-raised transition-colors duration-500 hover:border-line-strong animate-fade-up"
      style={{ animationDelay: `${120 + index * 80}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <div
          className="absolute inset-0 opacity-90 transition-transform duration-[1.2s] ease-out group-hover:scale-105"
          style={{
            background: `radial-gradient(60% 70% at 30% 35%, ${a} 0%, transparent 70%), radial-gradient(55% 65% at 72% 70%, ${b} 0%, transparent 72%), var(--ink-sunken)`,
            filter: "blur(2px) saturate(1.1)",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,var(--ink-raised))]" />
        <span className="absolute left-5 top-5 rounded-full border border-cream/15 bg-ink/40 px-3 py-1 text-xs tracking-wide text-cream/80 backdrop-blur-md">
          {MOOD_LABEL[game.mood]}
        </span>
        {!playable && (
          <span className="absolute right-5 top-5 text-xs tracking-wide text-cream/60">Coming soon</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-6 pt-2">
        <h3 className="font-display text-3xl tracking-tight">{game.title}</h3>
        <p className="text-[15px] leading-relaxed text-cream-muted">{game.tagline}</p>
        <p className="mt-auto pt-4 font-mono text-xs uppercase tracking-[0.14em] text-cream-faint">
          2 players · {game.minutes}
        </p>
      </div>
    </article>
  );
}
