import { GAMES } from "@/games/registry";
import { isPlayable } from "@/games/types";
import { Text } from "@/design-system";

export function GamePicker({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {GAMES.map((g) => {
        const playable = isPlayable(g);
        const active = selected === g.id;
        return (
          <li key={g.id}>
            <button
              disabled={!playable}
              onClick={() => onSelect(g.id)}
              className={`group flex w-full items-center gap-4 rounded-md border px-4 py-3 text-left transition-all duration-300 ${
                active ? "border-fg-primary/40 bg-fg-primary/[0.06]" : "border-transparent hover:bg-fg-primary/[0.03]"
              } disabled:cursor-default`}
            >
              <span
                className="h-9 w-9 shrink-0 rounded-full"
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${g.palette[0]}, ${g.palette[1]})`,
                  opacity: playable ? 1 : 0.35,
                }}
              />
              <span className="min-w-0 flex-1">
                <Text as="span" tone={playable ? "primary" : "tertiary"} className="block">
                  {g.title}
                </Text>
                <Text as="span" variant="body-s" tone="tertiary" className="block truncate">
                  {g.tagline}
                </Text>
              </span>
              {!playable && (
                <Text as="span" variant="overline">
                  Soon
                </Text>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
