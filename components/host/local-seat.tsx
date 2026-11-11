"use client";

import { useState } from "react";
import { Button, Field, Input, Text } from "@/design-system";
import { KEY_LABELS } from "@/lib/input/local-pad";

const NAME_KEY = "duet.name";

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Long-distance: the host plays on this computer's keyboard (or a gamepad)
 * instead of a phone. One seat, one tap to give it back.
 */
export function LocalSeat({
  localName,
  canJoin,
  onJoin,
  onLeave,
}: {
  localName: string | null;
  canJoin: boolean;
  onJoin: (name: string) => void;
  onLeave: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (localName !== null) {
    return (
      <div className="flex items-center justify-between gap-3 px-1">
        <Text variant="body-s">
          You&apos;re on this keyboard · <span className="font-mono text-xs">{KEY_LABELS.move}</span>
        </Text>
        <button onClick={onLeave} className="text-sm text-fg-secondary underline-offset-4 transition-colors hover:text-fg-primary hover:underline">
          Leave seat
        </button>
      </div>
    );
  }

  if (draft === null) {
    if (!canJoin) return null;
    return (
      <Button variant="ghost" onClick={() => setDraft(savedName())}>
        Play on this computer
      </Button>
    );
  }

  return (
    <form
      className="flex gap-2 animate-fade-up"
      onSubmit={(e) => {
        e.preventDefault();
        const name = draft.trim().slice(0, 16) || "Player";
        try {
          localStorage.setItem(NAME_KEY, name);
        } catch {}
        setDraft(null);
        onJoin(name);
      }}
    >
      <div className="flex-1">
        <Field label="Your name" htmlFor="local-name" hideLabel>
          <Input id="local-name" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={16} placeholder="Your name" className="h-12" />
        </Field>
      </div>
      <Button type="submit">Join</Button>
    </form>
  );
}
