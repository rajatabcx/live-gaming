import Link from "next/link";
import { GAMES } from "@/games/registry";
import { GameCard } from "@/components/landing/game-card";
import { StartRoomButton } from "@/components/landing/start-room-button";
import { Button, Text, Wordmark } from "@/design-system";

const STEPS = [
  { n: "01", title: "Open a room", body: "On a laptop or TV. Pick something to play." },
  { n: "02", title: "Scan with your phones", body: "Each phone becomes a controller. No app, no account." },
  { n: "03", title: "Play together", body: "On one couch, or miles apart — send the link and it opens on their laptop too." },
];

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* Ambient glow — the two players, drifting. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[90vh]">
        <div className="absolute left-[12%] top-[8%] h-[46vw] w-[46vw] max-h-[560px] max-w-[560px] rounded-full bg-player-one/20 blur-[120px] animate-float" />
        <div
          className="absolute right-[10%] top-[18%] h-[42vw] w-[42vw] max-h-[520px] max-w-[520px] rounded-full bg-player-two/20 blur-[120px] animate-float"
          style={{ animationDelay: "-4s" }}
        />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <Link href="/join" className="text-sm text-fg-secondary transition-colors hover:text-fg-primary">
          Have a code?
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start px-6 pb-24 pt-20 sm:pt-32">
        <Text variant="overline" className="animate-fade-up">
          Games for two · near or far
        </Text>
        <h1
          className="type-display-xl animate-fade-up mt-6 max-w-4xl"
          style={{ animationDelay: "80ms" }}
        >
          Some games are <br />
          <em className="bg-gradient-to-r from-player-one via-accent-glow to-player-two bg-clip-text text-transparent">better as two.</em>
        </h1>
        <Text variant="body-l" className="animate-fade-up mt-8 max-w-md" style={{ animationDelay: "160ms" }}>
          Quiet, beautiful little games for you and your person. On the couch with your phones as controllers, or
          from two cities on two laptops. Nothing to install.
        </Text>
        <div className="animate-fade-up mt-10 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
          <StartRoomButton />
          <Button asChild variant="ghost">
            <Link href="/join">Join on phone</Link>
          </Button>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-surface-base p-7">
              <Text as="span" variant="mono-s">{s.n}</Text>
              <Text as="h2" variant="label-m" className="mt-6 text-lg">{s.title}</Text>
              <Text className="mt-2">{s.body}</Text>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-32">
        <div className="mb-10 flex items-end justify-between gap-6">
          <Text variant="display-m">The collection</Text>
          <Text variant="body-s" tone="tertiary" className="hidden max-w-xs text-right sm:block">
            Side by side, or miles apart. Every one is finished and ready tonight.
          </Text>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between border-t border-line-subtle px-6 py-8 text-sm text-fg-tertiary">
        <span>Made for two.</span>
        <Text as="span" variant="mono-s">duet</Text>
      </footer>
    </main>
  );
}
