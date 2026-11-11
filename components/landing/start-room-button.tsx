"use client";

import { useRouter } from "next/navigation";
import { createRoomCode } from "@/lib/room-code";
import { Button } from "@/components/ui/button";

export function StartRoomButton({ label = "Start a room" }: { label?: string }) {
  const router = useRouter();
  return (
    <Button onClick={() => router.push(`/room/${createRoomCode()}`)}>
      {label}
      <span aria-hidden className="text-lg leading-none">→</span>
    </Button>
  );
}
