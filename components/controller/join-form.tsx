"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/room-code";
import { Button, Input } from "@/design-system";

export function JoinForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const code = normalizeRoomCode(value);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code) router.push(`/play/${code}`);
      }}
    >
      <Input
        aria-label="Room code"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH))}
        placeholder="K7M4Q"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="h-20 text-center font-display text-5xl tracking-[0.2em] placeholder:text-fg-primary/15"
      />
      <Button type="submit" size="lg" disabled={!code}>
        Join
      </Button>
    </form>
  );
}
