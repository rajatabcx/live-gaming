"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { getGame } from "@/games/registry";
import type { GameProps } from "@/games/types";
import { KeyboardRoom, KEYBOARD_PLAYERS } from "@/games/dev/keyboard-room";
import { Text } from "@/design-system";

/** Mounts a game against the keyboard room: no phones, no network. */
export function DevGame({ id }: { id: string }) {
  const router = useRouter();
  const [room] = useState(() => new KeyboardRoom());
  const [Game, setGame] = useState<ComponentType<GameProps> | null>(null);

  useEffect(() => room.attach(window), [room]);

  useEffect(() => {
    (window as unknown as { __room?: KeyboardRoom }).__room = room;
    let live = true;
    void getGame(id)
      ?.load()
      .then((mod) => live && setGame(() => mod.default));
    return () => {
      live = false;
    };
  }, [id, room]);

  if (!Game) return <main className="min-h-dvh" />;
  return (
    <>
      <Game role="host" room={room} players={KEYBOARD_PLAYERS} onExit={() => router.push("/")} />
      <div className="pointer-events-none fixed bottom-6 left-6 z-10 hidden flex-col gap-1 lg:flex">
        <Text variant="mono-s">Left · WASD move · Space A · E B</Text>
        <Text variant="mono-s">Right · IJKL move · U A · O B</Text>
      </div>
    </>
  );
}
