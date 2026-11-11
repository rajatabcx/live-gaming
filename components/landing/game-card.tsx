import type { GameDefinition } from "@/games/types";
import { Badge, Text } from "@/design-system";

const MOOD_LABEL: Record<GameDefinition["mood"], string> = {
  "co-op": "Co-op",
  versus: "Versus",
  chill: "Unwind",
  talk: "Talk",
};

/** Abstract generative cover: two orbs in the game's palette. No images to load. */
export function GameCard({ game, index }: { game: GameDefinition; index: number }) {
  const [a, b] = game.palette;
  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-surface-raised transition-colors duration-500 hover:border-line-strong animate-fade-up"
      style={{ animationDelay: `${120 + index * 80}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <div
          className="absolute inset-0 opacity-90 transition-transform duration-[1.2s] ease-out group-hover:scale-105"
          style={{
            background: `radial-gradient(60% 70% at 30% 35%, ${a} 0%, transparent 70%), radial-gradient(55% 65% at 72% 70%, ${b} 0%, transparent 72%), var(--color-surface-sunken)`,
            filter: "blur(2px) saturate(1.1)",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,var(--color-surface-raised))]" />
        <Badge className="absolute left-5 top-5">{MOOD_LABEL[game.mood]}</Badge>
        {game.twoScreens && (
          <Badge tone="glow" className="absolute right-5 top-5">
            Two screens
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-6 pt-2">
        <Text variant="display-s">{game.title}</Text>
        <Text>{game.tagline}</Text>
        <Text variant="overline" className="mt-auto pt-4">
          2 players · {game.minutes}
        </Text>
      </div>
    </article>
  );
}
