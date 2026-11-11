import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGame } from "@/games/registry";
import { DevGame } from "@/components/dev/dev-game";

export const metadata: Metadata = { title: "Playtest" };

/** Local playtesting on one keyboard — development builds only. */
async function Playtest({ params }: { params: Promise<{ game: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { game } = await params;
  if (!getGame(game)?.load) notFound();
  return <DevGame id={game} />;
}

export default function PlaytestPage({ params }: { params: Promise<{ game: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Playtest params={params} />
    </Suspense>
  );
}
