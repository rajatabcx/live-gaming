import Link from "next/link";

/** Figma: Brand / Mark. Two overlapping circles — the two players — next to the serif wordmark. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      <span className="relative block h-5 w-8" aria-hidden>
        <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-player-one mix-blend-screen transition-transform duration-500 group-hover:-translate-x-0.5" />
        <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-player-two mix-blend-screen transition-transform duration-500 group-hover:translate-x-0.5" />
      </span>
      <span className="font-display text-2xl leading-none tracking-tight text-fg-primary">Tandem</span>
    </Link>
  );
}
