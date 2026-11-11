"use client";

import { useEffect, useRef, useState } from "react";
import { sourceTarget, toSource, type GameProps } from "../types";
import { Hud } from "./hud";
import { Session } from "./session";

/**
 * Entry for Keyhole, on the host or a remote screen. React only mounts the
 * canvas and HUD; the Session owns the loop, the sim and the renderer.
 */
export default function Keyhole(props: GameProps) {
  const { players, onExit } = props;
  const target = sourceTarget(props);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exitRef = useRef(onExit);
  const playersRef = useRef(players);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    exitRef.current = onExit;
    playersRef.current = players;
  });

  useEffect(() => {
    const s = new Session(toSource(target), canvasRef.current!, () => exitRef.current());
    s.setPlayers(playersRef.current);
    s.start();
    setSession(s);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __keyhole?: Session }).__keyhole = s;
    return () => {
      s.destroy();
      setSession(null);
    };
  }, [target]);

  useEffect(() => {
    session?.setPlayers(players);
  }, [session, players]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-surface-base">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Keyhole" />
      {session && <Hud session={session} />}
    </div>
  );
}
