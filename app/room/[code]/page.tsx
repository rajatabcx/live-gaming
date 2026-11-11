import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { normalizeRoomCode } from "@/lib/room-code";
import { HostScreen } from "@/components/host/host-screen";

export const metadata: Metadata = { title: "Room" };

async function Room({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode((await params).code);
  if (!code) notFound();
  return <HostScreen code={code} />;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Room params={params} />
    </Suspense>
  );
}
