"use client";

import { useCallback, useRef } from "react";
import type { ControllerClient } from "@/lib/realtime/controller-client";
import { NEUTRAL_INPUT, type ControllerLayout, type InputState } from "@/lib/realtime/protocol";
import { ActionButton } from "./action-button";
import { Stick } from "./stick";

/** Renders whatever layout the host asked for and streams input to it. */
export function Gamepad({
  client,
  layout,
  color,
}: {
  client: ControllerClient;
  layout: ControllerLayout;
  color: string;
}) {
  const state = useRef<InputState>({ ...NEUTRAL_INPUT });
  const patch = useCallback(
    (p: Partial<InputState>) => {
      state.current = { ...state.current, ...p };
      client.sendInput(state.current);
    },
    [client],
  );

  const hasStick = layout.kind !== "buttons";
  const a = layout.kind === "lobby" ? "Wave" : layout.a;
  const b = layout.kind === "lobby" ? undefined : layout.b;

  return (
    <div className="grid h-full w-full grid-cols-[1.3fr_1fr]">
      {hasStick ? <Stick color={color} onChange={(x, y) => patch({ x, y })} /> : <div />}
      <div className="flex flex-col items-center justify-center gap-6 pr-2">
        {b !== undefined && (
          <ActionButton glyph="B" label={b} color={color} size="md" onChange={(v) => patch({ b: v })} />
        )}
        <ActionButton glyph="A" label={a} color={color} onChange={(v) => patch({ a: v })} />
      </div>
    </div>
  );
}
