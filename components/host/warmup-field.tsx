"use client";

import { useEffect, useRef } from "react";
import type { HostRoom } from "@/lib/realtime/host-room";
import type { PlayerInfo, PlayerSlot } from "@/lib/realtime/protocol";
import { PLAYER_COLORS, palette } from "@/design-system/palette";

const COLORS: Record<PlayerSlot, string> = PLAYER_COLORS;
const SPEED = 520; // px/s at full stick
const DAMPING = 6;

interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pulse: number; // 0..1, decays
}

interface Ripple {
  x: number;
  y: number;
  age: number;
  color: string;
}

/**
 * The lobby's playground: each connected player is a glowing orb they can
 * steer. Proves the controller works and gives hands something to do while
 * picking a game. Plain canvas + rAF — React never re-renders per frame.
 */
export function WarmupField({ room, players }: { room: HostRoom; players: PlayerInfo[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const orbs: Record<PlayerSlot, Orb> = {
      0: { x: w * 0.4, y: h * 0.55, vx: 0, vy: 0, pulse: 0 },
      1: { x: w * 0.6, y: h * 0.55, vx: 0, vy: 0, pulse: 0 },
    };
    const ripples: Ripple[] = [];

    const offPress = room.on("press", ({ playerId }) => {
      const p = playersRef.current.find((pl) => pl.id === playerId);
      if (!p) return;
      const orb = orbs[p.slot];
      orb.pulse = 1;
      ripples.push({ x: orb.x, y: orb.y, age: 0, color: COLORS[p.slot] });
      room.haptic(playerId, 18);
    });

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      ctx.clearRect(0, 0, w, h);

      const active = playersRef.current.filter((p) => p.connected);
      for (const p of active) {
        const input = room.inputForSlot(p.slot);
        const o = orbs[p.slot];
        o.vx += (input.x * SPEED - o.vx) * Math.min(1, DAMPING * dt);
        o.vy += (input.y * SPEED - o.vy) * Math.min(1, DAMPING * dt);
        o.x = Math.max(40, Math.min(w - 40, o.x + o.vx * dt));
        o.y = Math.max(40, Math.min(h - 40, o.y + o.vy * dt));
        o.pulse = Math.max(0, o.pulse - dt * 2.5);
      }

      // Shared glow when both orbs are close — the "together" moment.
      if (active.length === 2) {
        const a = orbs[0];
        const b = orbs[1];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const t = Math.max(0, 1 - d / 260);
        if (t > 0) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, 220);
          g.addColorStop(0, `rgba(255,197,138,${0.35 * t})`);
          g.addColorStop(1, "rgba(255,197,138,0)");
          ctx.fillStyle = g;
          ctx.fillRect(mx - 220, my - 220, 440, 440);
        }
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += dt;
        if (r.age > 1.2) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = (1 - r.age / 1.2) * 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 24 + r.age * 180, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (const p of active) {
        const o = orbs[p.slot];
        const radius = 22 + o.pulse * 10;
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, radius * 4);
        g.addColorStop(0, COLORS[p.slot]);
        g.addColorStop(0.25, `${COLORS[p.slot]}66`);
        g.addColorStop(1, `${COLORS[p.slot]}00`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.x, o.y, radius * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.fgPrimary;
        ctx.beginPath();
        ctx.arc(o.x, o.y, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      offPress();
      window.removeEventListener("resize", resize);
    };
  }, [room]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />;
}
