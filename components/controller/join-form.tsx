"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/room-code";
import { Button } from "@/components/ui/button";

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
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH))}
        placeholder="ABCD"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="h-20 rounded-2xl border border-line-strong bg-ink-raised text-center font-display text-5xl tracking-[0.3em] outline-none transition-colors placeholder:text-cream/15 focus:border-cream/40"
      />
      <Button type="submit" disabled={!code} className="h-14">
        Join
      </Button>
    </form>
  );
}
