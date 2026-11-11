import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { normalizeRoomCode } from "@/lib/room-code";
import { ControllerScreen } from "@/components/controller/controller-screen";

export const metadata: Metadata = { title: "Controller" };

async function Play({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!code) notFound();
  return <ControllerScreen code={code} />;
}

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Play params={params} />
    </Suspense>
  );
}
