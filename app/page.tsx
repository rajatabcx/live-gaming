import Link from "next/link";
import { GAMES } from "@/games/registry";
import { GameCard } from "@/components/landing/game-card";
import { StartRoomButton } from "@/components/landing/start-room-button";
import { Wordmark } from "@/components/ui/wordmark";
import { buttonClass } from "@/components/ui/button";

const STEPS = [
  { n: "01", title: "Open a room", body: "On a laptop or TV. Pick something to play." },
  { n: "02", title: "Scan with your phones", body: "Each phone becomes a controller. No app, no account." },
  { n: "03", title: "Play together", body: "One screen, two of you, the couch." },
];

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {/* Ambient glow — the two players, drifting. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[90vh]">
        <div className="absolute left-[12%] top-[8%] h-[46vw] w-[46vw] max-h-[560px] max-w-[560px] rounded-full bg-p1/20 blur-[120px] animate-float" />
        <div
          className="absolute right-[10%] top-[18%] h-[42vw] w-[42vw] max-h-[520px] max-w-[520px] rounded-full bg-p2/20 blur-[120px] animate-float"
          style={{ animationDelay: "-4s" }}
        />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Wordmark />
        <Link href="/join" className="text-sm text-cream-muted transition-colors hover:text-cream">
          Have a code?
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start px-6 pb-24 pt-20 sm:pt-32">
        <p className="animate-fade-up font-mono text-xs uppercase tracking-[0.2em] text-cream-faint">
          Couch games · for two
        </p>
        <h1
          className="animate-fade-up mt-6 max-w-4xl font-display text-[clamp(3.25rem,9vw,7.5rem)] leading-[0.95] tracking-[-0.02em]"
          style={{ animationDelay: "80ms" }}
        >
          Some games are <br />
          <em className="bg-gradient-to-r from-p1 via-glow to-p2 bg-clip-text text-transparent">better as two.</em>
        </h1>
        <p
          className="animate-fade-up mt-8 max-w-md text-lg leading-relaxed text-cream-muted"
          style={{ animationDelay: "160ms" }}
        >
          Quiet, beautiful little games for you and your person. One screen, two phones as controllers, nothing to
          install.
        </p>
        <div className="animate-fade-up mt-10 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
          <StartRoomButton />
          <Link href="/join" className={buttonClass("ghost")}>
            Join on phone
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <ol className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-ink p-7">
              <span className="font-mono text-xs text-cream-faint">{s.n}</span>
              <h2 className="mt-6 text-lg font-medium tracking-tight">{s.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-cream-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-32">
        <div className="mb-10 flex items-end justify-between gap-6">
          <h2 className="font-display text-5xl tracking-tight">The collection</h2>
          <p className="hidden max-w-xs text-right text-sm text-cream-faint sm:block">
            A new one every few weeks. Each built to be played side by side.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between border-t border-line px-6 py-8 text-sm text-cream-faint">
        <span>Made for two.</span>
        <span className="font-mono text-xs">tandem</span>
      </footer>
    </main>
  );
}
