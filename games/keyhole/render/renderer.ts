import { PLAYER_COLORS } from "@/design-system/palette";
import type { PlayerSlot } from "@/lib/realtime/protocol";
import { rgba } from "../../kit/color";
import { clamp, lerp } from "../../kit/math";
import { Particles } from "../../kit/particles";
import { drawGlow, seeded } from "../../kit/sprites";
import { clipTo, fitTransform, viewports, type Viewport } from "../../kit/views";
import { ITEMS, SYMBOLS, type ColorId, type Hotspot, type RoomData } from "../sim/chapter";
import { DOOR_HOLD, FLOOR_Y, ROOM_H, ROOM_W } from "../sim/constants";
import type { Slot, SpotState, World, WorldEvent } from "../sim/world";
import { drawItem, drawSymbol, keyholePath } from "./glyphs";
import { BRASS, COLOR_HEX, CREAM, GLOW, INK, PAPER, THEMES, WOOD, type RoomColors } from "./palette";

export interface FrameOptions {
  /** 0 = black, 1 = fully visible. */
  fade: number;
  /** 0..1 — the "you're in the …" card at the start of a chapter. */
  intro: number;
}

const TAU = Math.PI * 2;
const DOOR_TOP = FLOOR_Y - 330;
const CHARACTER_H = 150;

/** Cosmetic, per room: what the renderer remembers between frames. */
interface RoomFx {
  particles: Particles;
  /** Seconds since the last wrong answer (shakes the close-up). */
  wrong: number;
  /** Key index → seconds since pressed, for a flash. */
  keys: Map<number, number>;
  /** Hotspot id → seconds since it appeared or opened. */
  fresh: Map<string, number>;
  /** Seconds since an item came through the keyhole. */
  arrived: number;
  /** Smoothed peek (0..1) so the keyhole view eases in. */
  peek: number;
  panel: number;
  lastPanel: string | null;
}

const newFx = (): RoomFx => ({ particles: new Particles(), wrong: 9, keys: new Map(), fresh: new Map(), arrived: 9, peek: 0, panel: 0, lastPanel: null });

/**
 * Draws Keyhole once per player view on this screen. Each view is one room,
 * seen side-on like a dollhouse; the shared door sits on the wall between
 * them, so side by side the two rooms read as one house. Close-ups and the
 * peek through the keyhole are drawn over the room in screen space.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private slots: PlayerSlot[] = [0, 1];
  private names: [string, string] = ["", ""];
  private fx: [RoomFx, RoomFx] = [newFx(), newFx()];
  private dust: { x: number; y: number; r: number; phase: number }[] = [];
  private eyes = 0;
  private opened = 0;
  private clock = 0;
  private font = "ui-sans-serif, system-ui, sans-serif";
  private display = "ui-serif, Georgia, serif";

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    const style = getComputedStyle(canvas);
    if (style.fontFamily) this.font = style.fontFamily;
    const display = style.getPropertyValue("--font-display").trim();
    if (display) this.display = display;
    const rand = seeded(11);
    for (let i = 0; i < 40; i++) this.dust.push({ x: rand() * ROOM_W, y: 120 + rand() * (FLOOR_Y - 160), r: 1 + rand() * 1.6, phase: rand() * 10 });
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, this.canvas.clientWidth);
    this.h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  setViews(slots: PlayerSlot[]) {
    this.slots = slots;
  }

  setNames(names: [string, string]) {
    this.names = names;
  }

  startChapter() {
    this.fx = [newFx(), newFx()];
    this.eyes = 0;
    this.opened = 0;
  }

  handle(world: World, events: readonly WorldEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "key":
          this.fx[e.slot].keys.set(e.index, 0);
          break;
        case "wrong":
          this.fx[e.slot].wrong = 0;
          break;
        case "solved":
        case "reveal": {
          const fx = this.fx[e.slot];
          fx.fresh.set(e.id, 0);
          const h = world.hotspot(e.slot, e.id);
          if (h) fx.particles.burst("spark", h.x, propTop(h) + 40, e.type === "reveal" ? 22 : 14, 160, { color: GLOW, size: 2.6, drag: 2.5, max: 1.1 });
          break;
        }
        case "pass": {
          const to: Slot = e.from === 0 ? 1 : 0;
          this.fx[to].arrived = 0;
          const door = world.chapter.rooms[to].hotspots.find((h) => h.device.kind === "door");
          if (door) this.fx[to].particles.burst("spark", door.x, keyholeY(), 12, 120, { color: BRASS.light, size: 2.2, drag: 3, max: 0.8 });
          break;
        }
        case "eyes":
          this.eyes = 1;
          ([0, 1] as const).forEach((s) => {
            const door = world.chapter.rooms[s].hotspots.find((h) => h.device.kind === "door");
            if (door) this.fx[s].particles.burst("heart", door.x, keyholeY() - 20, 8, 80, { color: PLAYER_COLORS[s === 0 ? 1 : 0], size: 9, gravity: -40, drag: 1.6, max: 1.8 });
          });
          break;
        case "unlocked":
          ([0, 1] as const).forEach((s) => {
            const door = world.chapter.rooms[s].hotspots.find((h) => h.device.kind === "door");
            if (door) this.fx[s].particles.burst("spark", door.x, keyholeY(), 20, 150, { color: GLOW, size: 2.6, drag: 2.5, max: 1.2 });
          });
          break;
      }
    }
  }

  draw(world: World, alpha: number, dt: number, opts: FrameOptions) {
    this.clock += dt;
    this.eyes = Math.max(0, this.eyes - dt * 0.5);
    this.opened = world.opened ? Math.min(1, this.opened + dt * 0.7) : 0;
    for (const s of [0, 1] as const) {
      const fx = this.fx[s];
      const p = world.players[s];
      fx.particles.update(dt);
      fx.wrong += dt;
      fx.arrived += dt;
      for (const [k, v] of fx.keys) fx.keys.set(k, v + dt);
      for (const [k, v] of fx.fresh) fx.fresh.set(k, v + dt);
      fx.peek += ((p.peek > 0 ? 1 : 0) - fx.peek) * Math.min(1, dt * 8);
      fx.panel += ((p.panel ? 1 : 0) - fx.panel) * Math.min(1, dt * 12);
      if (p.panel) fx.lastPanel = p.panel;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (const vp of viewports(this.slots, this.w, this.h, 0)) {
      const slot = vp.slot as Slot;
      ctx.save();
      clipTo(ctx, vp, this.dpr);
      this.drawRoomView(world, slot, vp, alpha);
      const fx = this.fx[slot];
      if (fx.peek > 0.01) this.drawPeek(world, slot, vp, fx.peek, alpha);
      if (fx.panel > 0.01 && fx.lastPanel) this.drawPanel(world, slot, vp, fx.lastPanel, fx.panel);
      this.drawChrome(world, slot, vp, opts.intro);
      ctx.restore();
    }
    // The wall between two side-by-side rooms.
    if (this.slots.length === 2) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = INK;
      ctx.fillRect(this.w / 2 - 3, 0, 6, this.h);
    }

    if (opts.fade < 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = rgba(INK, 1 - opts.fade);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // ─── A room ─────────────────────────────────────────────────────────────────

  private drawRoomView(world: World, slot: Slot, vp: Viewport, alpha: number) {
    const ctx = this.ctx;
    const room = world.chapter.rooms[slot];
    const colors = THEMES[room.theme];
    // Fill around the letterbox with the wall so the room reads edge to edge.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = colors.wallLow;
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    fitTransform(ctx, vp, this.dpr, ROOM_W, ROOM_H, ROOM_W / 2, ROOM_H / 2, "contain");
    this.drawRoom(world, slot, room, colors, alpha, true);
  }

  /** The room in room space. `live`: draw the player and prompts (false inside the peek). */
  private drawRoom(world: World, slot: Slot, room: RoomData, colors: RoomColors, alpha: number, live: boolean) {
    const ctx = this.ctx;
    const fx = this.fx[slot];

    // Wall, wallpaper, wainscot, floor.
    const wall = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
    wall.addColorStop(0, colors.wallLow);
    wall.addColorStop(0.45, colors.wall);
    wall.addColorStop(1, colors.wall);
    ctx.fillStyle = wall;
    ctx.fillRect(-400, -200, ROOM_W + 800, FLOOR_Y + 200);
    ctx.fillStyle = rgba(colors.pattern, 0.55);
    for (let x = 40; x < ROOM_W; x += 80) {
      for (let y = 70; y < FLOOR_Y - 200; y += 90) {
        const k = (x / 80 + y / 90) % 2 === 0 ? 1 : 0.6;
        ctx.beginPath();
        ctx.arc(x + ((y / 90) % 2) * 40, y, 3 * k, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = colors.trim;
    ctx.fillRect(-400, FLOOR_Y - 190, ROOM_W + 800, 10);
    ctx.fillStyle = rgba(colors.wallLow, 0.7);
    ctx.fillRect(-400, FLOOR_Y - 180, ROOM_W + 800, 180);
    ctx.strokeStyle = rgba(colors.trim, 0.9);
    ctx.lineWidth = 3;
    for (let x = 60; x < ROOM_W - 40; x += 220) ctx.strokeRect(x, FLOOR_Y - 160, 180, 130);
    ctx.fillStyle = colors.floor;
    ctx.fillRect(-400, FLOOR_Y, ROOM_W + 800, ROOM_H - FLOOR_Y + 300);
    ctx.fillStyle = colors.trim;
    ctx.fillRect(-400, FLOOR_Y - 14, ROOM_W + 800, 14);
    ctx.strokeStyle = colors.floorLine;
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const y = FLOOR_Y + i * 26 + i * i * 2;
      ctx.beginPath();
      ctx.moveTo(-400, y);
      ctx.lineTo(ROOM_W + 400, y);
      ctx.stroke();
    }

    // A ceiling lamp and its pool of warm light.
    const lampX = room.theme === "greenhouse" ? 760 : 800;
    ctx.strokeStyle = rgba(CREAM, 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lampX, 0);
    ctx.lineTo(lampX, 120);
    ctx.stroke();
    ctx.fillStyle = BRASS.dark;
    ctx.beginPath();
    ctx.moveTo(lampX - 40, 150);
    ctx.quadraticCurveTo(lampX, 100, lampX + 40, 150);
    ctx.closePath();
    ctx.fill();
    drawGlow(ctx, GLOW, lampX, 160, 520, 0.22);
    drawGlow(ctx, GLOW, lampX, 156, 40, 0.8);
    const pool = ctx.createRadialGradient(lampX, FLOOR_Y + 40, 10, lampX, FLOOR_Y + 40, 520);
    pool.addColorStop(0, rgba(GLOW, 0.12));
    pool.addColorStop(1, rgba(GLOW, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(lampX - 520, FLOOR_Y - 60, 1040, 260);

    this.drawWindow(room, colors);

    // Furniture.
    for (const h of room.hotspots) {
      if (!world.visible(slot, h)) continue;
      const st = world.spots[slot][h.id];
      const fresh = fx.fresh.get(h.id);
      ctx.save();
      if (h.hidden && fresh !== undefined && fresh < 0.8) ctx.globalAlpha = clamp(fresh / 0.8, 0, 1);
      this.drawProp(world, slot, h, st);
      ctx.restore();
    }

    // Floating dust in the lamplight.
    for (const d of this.dust) {
      const y = d.y + Math.sin(this.clock * 0.3 + d.phase) * 14;
      const x = d.x + Math.sin(this.clock * 0.2 + d.phase * 2) * 20;
      ctx.fillStyle = rgba(GLOW, 0.12 + 0.08 * Math.sin(this.clock + d.phase));
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, TAU);
      ctx.fill();
    }

    if (live) {
      this.drawPrompt(world, slot);
      this.drawCharacter(world, slot, alpha);
    }
    fx.particles.draw(ctx);

    // Floor shadow at the edges, like a stage.
    const edge = ctx.createLinearGradient(0, 0, ROOM_W, 0);
    edge.addColorStop(0, rgba(INK, 0.35));
    edge.addColorStop(0.12, rgba(INK, 0));
    edge.addColorStop(0.88, rgba(INK, 0));
    edge.addColorStop(1, rgba(INK, 0.35));
    ctx.fillStyle = edge;
    ctx.fillRect(-400, -200, ROOM_W + 800, ROOM_H + 400);
  }

  private drawWindow(room: RoomData, colors: RoomColors) {
    const ctx = this.ctx;
    // A tall window somewhere the furniture isn't.
    const taken = (x: number) => room.hotspots.some((h) => Math.abs(h.x - x) < h.w / 2 + 110);
    const x = [760, 680, 820, 300, 1300].find((c) => !taken(c));
    if (x === undefined) return;
    const y = 170;
    const w = 150;
    const hh = 240;
    const sky = ctx.createLinearGradient(0, y, 0, y + hh);
    sky.addColorStop(0, "#101a33");
    sky.addColorStop(1, "#1d2440");
    ctx.fillStyle = colors.trim;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 12, y - 12, w + 24, hh + 24, [w / 2 + 12, w / 2 + 12, 6, 6]);
    ctx.fill();
    ctx.fillStyle = sky;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, hh, [w / 2, w / 2, 2, 2]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    drawSymbol(ctx, "moon", x + 30, y + 70, 18, "#f4ece2");
    drawGlow(ctx, "#cfd8ff", x + 30, y + 70, 60, 0.35);
    const rand = seeded(x);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = rgba(CREAM, 0.4 + 0.3 * Math.sin(this.clock * 1.3 + i));
      ctx.fillRect(x - w / 2 + rand() * w, y + 20 + rand() * (hh - 60), 2, 2);
    }
    ctx.restore();
    ctx.strokeStyle = colors.trim;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y + hh);
    ctx.moveTo(x - w / 2, y + hh * 0.55);
    ctx.lineTo(x + w / 2, y + hh * 0.55);
    ctx.stroke();
    ctx.fillStyle = colors.trim;
    ctx.fillRect(x - w / 2 - 22, y + hh + 6, w + 44, 12);
  }

  // ─── Props ──────────────────────────────────────────────────────────────────

  private drawProp(world: World, slot: Slot, h: Hotspot, st: SpotState) {
    const ctx = this.ctx;
    const { x, w } = h;
    const f = FLOOR_Y;
    const open = st.solved;
    const fresh = this.fx[slot].fresh.get(h.id) ?? 9;
    const pop = fresh < 0.6 ? Math.sin((fresh / 0.6) * Math.PI) : 0;
    const shadow = (sw: number) => {
      ctx.fillStyle = rgba(INK, 0.35);
      ctx.beginPath();
      ctx.ellipse(x, f + 4, sw / 2, 10, 0, 0, TAU);
      ctx.fill();
    };

    switch (h.prop) {
      case "painting": {
        const ph = 170;
        const y = 250;
        ctx.fillStyle = BRASS.dark;
        ctx.fillRect(x - w / 2 - 14, y - 14, w + 28, ph + 28);
        ctx.fillStyle = BRASS.base;
        ctx.fillRect(x - w / 2 - 6, y - 6, w + 12, ph + 12);
        const g = ctx.createLinearGradient(0, y, 0, y + ph);
        g.addColorStop(0, "#1b2340");
        g.addColorStop(1, "#3a2d4a");
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, y, w, ph);
        // Hills under a night sky, and the three marks hung in it.
        ctx.fillStyle = "#24314a";
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y + ph);
        ctx.quadraticCurveTo(x - w / 4, y + ph - 70, x + 10, y + ph - 30);
        ctx.quadraticCurveTo(x + w / 4, y + ph - 80, x + w / 2, y + ph - 40);
        ctx.lineTo(x + w / 2, y + ph);
        ctx.fill();
        if (h.device.kind === "clue" && h.device.art.kind === "symbols") {
          const marks = h.device.art.symbols;
          marks.forEach((s, i) => drawSymbol(ctx, s, x - w / 2 + ((i + 1) * w) / (marks.length + 1), y + 55, 16, rgba(CREAM, 0.8)));
        }
        break;
      }
      case "desk": {
        shadow(w);
        const top = f - 150;
        ctx.fillStyle = WOOD.mid;
        ctx.fillRect(x - w / 2, top, w, 18);
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - w / 2 + 10, top + 18, 18, 132);
        ctx.fillRect(x + w / 2 - 28, top + 18, 18, 132);
        ctx.fillStyle = WOOD.light;
        const pull = open ? 26 : 0;
        ctx.fillRect(x - 70, top + 22 + pull * 0.2, 140, 46);
        ctx.fillStyle = BRASS.base;
        ctx.beginPath();
        ctx.arc(x, top + 45 + pull * 0.2, 5, 0, TAU);
        ctx.fill();
        if (!open) {
          ctx.fillStyle = INK;
          keyholePath(ctx, x, top + 56, 10);
          ctx.fill();
        }
        // A reading lamp and a book.
        ctx.fillStyle = BRASS.dark;
        ctx.fillRect(x - w / 2 + 40, top - 70, 6, 70);
        ctx.fillStyle = "#7a3d3a";
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 14, top - 70);
        ctx.lineTo(x - w / 2 + 72, top - 70);
        ctx.lineTo(x - w / 2 + 60, top - 100);
        ctx.lineTo(x - w / 2 + 26, top - 100);
        ctx.fill();
        drawGlow(ctx, GLOW, x - w / 2 + 43, top - 60, 90, 0.4);
        ctx.fillStyle = "#3e5a7a";
        ctx.fillRect(x + 30, top - 16, 70, 16);
        break;
      }
      case "letter": {
        shadow(w);
        ctx.fillStyle = WOOD.mid;
        ctx.fillRect(x - w / 2, f - 90, w, 12);
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - 6, f - 78, 12, 78);
        ctx.fillRect(x - 30, f - 6, 60, 6);
        const bob = Math.sin(this.clock * 2) * 2;
        ctx.save();
        ctx.translate(x, f - 108 + bob);
        ctx.rotate(-0.12);
        ctx.fillStyle = PAPER.base;
        ctx.fillRect(-30, -18, 60, 36);
        ctx.strokeStyle = PAPER.shade;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-30, -18);
        ctx.lineTo(0, 4);
        ctx.lineTo(30, -18);
        ctx.stroke();
        ctx.fillStyle = PLAYER_COLORS[0];
        ctx.beginPath();
        ctx.arc(0, 4, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
        drawGlow(ctx, GLOW, x, f - 108, 70, 0.25 + pop * 0.5);
        break;
      }
      case "chest": {
        shadow(w);
        const top = f - 120;
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - w / 2, top, w, 120);
        ctx.fillStyle = WOOD.mid;
        ctx.fillRect(x - w / 2 + 8, top + 8, w - 16, 104);
        ctx.fillStyle = BRASS.dark;
        ctx.fillRect(x - w / 2 + 24, top, 12, 120);
        ctx.fillRect(x + w / 2 - 36, top, 12, 120);
        // Lid: open shows the warm inside.
        if (open) {
          ctx.fillStyle = "#1a0f0b";
          ctx.fillRect(x - w / 2 + 6, top - 10, w - 12, 14);
          drawGlow(ctx, GLOW, x, top - 4, 110, 0.5);
          ctx.fillStyle = WOOD.light;
          ctx.save();
          ctx.translate(x - w / 2, top);
          ctx.rotate(-0.9);
          ctx.fillRect(0, -40, w, 40);
          ctx.restore();
        } else {
          ctx.fillStyle = WOOD.light;
          ctx.beginPath();
          ctx.roundRect(x - w / 2 - 6, top - 44, w + 12, 50, [40, 40, 4, 4]);
          ctx.fill();
          ctx.fillStyle = BRASS.dark;
          ctx.fillRect(x - w / 2 + 24, top - 40, 12, 46);
          ctx.fillRect(x + w / 2 - 36, top - 40, 12, 46);
        }
        this.drawDialStrip(h, st, x, top + 60, 30);
        break;
      }
      case "lamps": {
        if (h.device.kind !== "sequence") break;
        const keys = h.device.keys as ColorId[];
        const n = keys.length;
        keys.forEach((c, i) => {
          const lx = x - w / 2 + ((i + 0.5) * w) / n;
          const lit = open || st.entered.includes(i) || (this.fx[slot].keys.get(i) ?? 9) < 0.4;
          const color = COLOR_HEX[c];
          ctx.fillStyle = rgba(INK, 0.3);
          ctx.beginPath();
          ctx.ellipse(lx, f + 3, 30, 7, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = BRASS.dark;
          ctx.fillRect(lx - 4, f - 170, 8, 170);
          ctx.fillRect(lx - 24, f - 8, 48, 8);
          ctx.fillStyle = lit ? color : rgba(color, 0.35);
          ctx.beginPath();
          ctx.moveTo(lx - 36, f - 170);
          ctx.lineTo(lx + 36, f - 170);
          ctx.lineTo(lx + 24, f - 220);
          ctx.lineTo(lx - 24, f - 220);
          ctx.closePath();
          ctx.fill();
          if (lit) {
            drawGlow(ctx, color, lx, f - 190, 140, 0.55);
            drawGlow(ctx, color, lx, f - 30, 90, 0.18);
          }
        });
        break;
      }
      case "clock": {
        shadow(w * 0.7);
        const cw = 120;
        const top = f - 420;
        ctx.fillStyle = WOOD.dark;
        ctx.beginPath();
        ctx.roundRect(x - cw / 2 - 10, top - 20, cw + 20, 150, [60, 60, 6, 6]);
        ctx.fill();
        ctx.fillRect(x - cw / 2, top + 120, cw, 300);
        ctx.fillStyle = WOOD.mid;
        ctx.fillRect(x - cw / 2 + 16, top + 150, cw - 32, 220);
        // Pendulum: stopped until set right.
        const swing = open ? Math.sin(this.clock * 3) * 0.25 : 0;
        ctx.save();
        ctx.translate(x, top + 160);
        ctx.rotate(swing);
        ctx.fillStyle = BRASS.base;
        ctx.fillRect(-2, 0, 4, 150);
        ctx.beginPath();
        ctx.arc(0, 160, 18, 0, TAU);
        ctx.fill();
        ctx.restore();
        this.drawClockFace(x, top + 60, 50, st.values[0] ?? 12, st.values[1] ?? 0, -1);
        if (open) drawGlow(ctx, GLOW, x, top + 60, 120, 0.3 + pop * 0.4);
        break;
      }
      case "cabinet": {
        shadow(w);
        const top = f - 330;
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - w / 2, top, w, 330);
        ctx.fillStyle = WOOD.mid;
        const ajar = open ? 0.55 : 1;
        ctx.fillRect(x - w / 2 + 12, top + 12, (w / 2 - 16) * ajar, 300);
        ctx.fillRect(x + 4 + (w / 2 - 16) * (1 - ajar), top + 12, (w / 2 - 16) * ajar, 300);
        if (open) {
          drawGlow(ctx, GLOW, x, top + 160, 140, 0.45);
          ctx.fillStyle = "#1a0f0b";
          ctx.fillRect(x - (w / 2 - 16) * (1 - ajar) - 4, top + 12, (w - 32) * (1 - ajar) + 8, 300);
          drawSymbol(ctx, "heart", x, top + 150, 22, rgba(PLAYER_COLORS[0], 0.9));
        }
        this.drawDialStrip(h, st, x, top - 30, 26);
        break;
      }
      case "note": {
        const y = 330;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(0.05);
        ctx.fillStyle = PAPER.base;
        ctx.fillRect(-w / 2, -60, w, 120);
        ctx.fillStyle = PAPER.shade;
        for (let i = 0; i < 5; i++) ctx.fillRect(-w / 2 + 14, -36 + i * 18, w - 28 - (i % 2) * 18, 3);
        ctx.restore();
        ctx.fillStyle = PLAYER_COLORS[0];
        ctx.beginPath();
        ctx.arc(x, y - 58, 6, 0, TAU);
        ctx.fill();
        break;
      }
      case "pot":
      case "flower": {
        shadow(w * 0.8);
        ctx.fillStyle = WOOD.mid;
        ctx.fillRect(x - w / 2, f - 80, w, 14);
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - w / 2 + 12, f - 66, 12, 66);
        ctx.fillRect(x + w / 2 - 24, f - 66, 12, 66);
        const potW = Math.min(110, w * 0.75);
        ctx.fillStyle = "#a8573c";
        ctx.beginPath();
        ctx.moveTo(x - potW / 2, f - 150);
        ctx.lineTo(x + potW / 2, f - 150);
        ctx.lineTo(x + potW / 2 - 14, f - 80);
        ctx.lineTo(x - potW / 2 + 14, f - 80);
        ctx.fill();
        ctx.fillStyle = "#c26a4a";
        ctx.fillRect(x - potW / 2 - 6, f - 160, potW + 12, 16);
        if (h.prop === "pot" && open) {
          ctx.strokeStyle = "#6fa36f";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(x, f - 158);
          ctx.quadraticCurveTo(x + 20, f - 220, x + 4, f - 260);
          ctx.stroke();
          drawSymbol(ctx, "leaf", x + 18, f - 220, 16, "#7fb57f");
        }
        if (h.prop === "flower") {
          const sway = Math.sin(this.clock * 1.2) * 4;
          ctx.strokeStyle = "#5e8f66";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x, f - 158);
          ctx.quadraticCurveTo(x - 10, f - 240, x + sway, f - 300);
          ctx.stroke();
          drawSymbol(ctx, "leaf", x - 22, f - 220, 18, "#7fb57f");
          const cx = x + sway;
          const cy = f - 310;
          for (let i = 0; i < 6; i++) {
            const a = (i * TAU) / 6 + this.clock * 0.1;
            ctx.fillStyle = i % 2 ? "#ffb3c1" : "#ff8a9d";
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 22, 13, a, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = "#f2c45a";
          ctx.beginPath();
          ctx.arc(cx, cy, 14, 0, TAU);
          ctx.fill();
          drawGlow(ctx, "#ffb3c1", cx, cy, 110, 0.3 + pop * 0.5);
        }
        break;
      }
      case "musicbox": {
        shadow(w);
        ctx.fillStyle = WOOD.mid;
        ctx.fillRect(x - w / 2 - 20, f - 110, w + 40, 14);
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - w / 2 - 6, f - 96, 14, 96);
        ctx.fillRect(x + w / 2 - 8, f - 96, 14, 96);
        ctx.fillStyle = "#6b3a4a";
        ctx.fillRect(x - 50, f - 170, 100, 60);
        ctx.fillStyle = "#874c5e";
        ctx.fillRect(x - 54, f - 182, 108, 16);
        ctx.fillStyle = BRASS.base;
        ctx.fillRect(x + 50, f - 150, 14, 6);
        drawSymbol(ctx, "heart", x, f - 140, 10, BRASS.light);
        if (world.players[slot].panel === h.id) {
          for (let i = 0; i < 3; i++) {
            const t = (this.clock * 0.6 + i / 3) % 1;
            ctx.fillStyle = rgba(CREAM, 0.7 * (1 - t));
            ctx.font = `28px ${this.display}`;
            ctx.textAlign = "center";
            ctx.fillText("♪", x - 20 + i * 22, f - 200 - t * 80);
          }
        }
        break;
      }
      case "telescope": {
        shadow(w * 0.8);
        ctx.strokeStyle = WOOD.dark;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x, f - 160);
        ctx.lineTo(x - 50, f);
        ctx.moveTo(x, f - 160);
        ctx.lineTo(x + 50, f);
        ctx.moveTo(x, f - 160);
        ctx.lineTo(x, f);
        ctx.stroke();
        ctx.save();
        ctx.translate(x, f - 170);
        ctx.rotate(-0.55);
        ctx.fillStyle = BRASS.base;
        ctx.fillRect(-70, -16, 150, 32);
        ctx.fillStyle = BRASS.dark;
        ctx.fillRect(-90, -11, 24, 22);
        ctx.fillStyle = open ? "#bfe0ff" : "#14100c";
        ctx.beginPath();
        ctx.ellipse(80, 0, 6, 18, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (open) drawGlow(ctx, "#cfe6ff", x + 66, f - 214, 50, 0.6 + 0.2 * Math.sin(this.clock * 3));
        break;
      }
      case "starchart": {
        const y = 230;
        const ch = 180;
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(x - w / 2 - 10, y - 10, w + 20, ch + 20);
        ctx.fillStyle = "#16213d";
        ctx.fillRect(x - w / 2, y, w, ch);
        if (h.device.kind === "clue" && h.device.art.kind === "symbols") {
          const marks = h.device.art.symbols;
          marks.forEach((s, i) => {
            const mx = x - w / 2 + 30 + ((i % 2) * (w - 60)) + (i > 1 ? 10 : 0);
            const my = y + 50 + Math.floor(i / 2) * 80;
            drawSymbol(ctx, s, mx, my, 14, rgba("#dfe9ff", 0.85));
          });
          ctx.strokeStyle = rgba("#dfe9ff", 0.25);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x - w / 2 + 12, y + 12, w - 24, ch - 24);
        }
        drawGlow(ctx, "#9fc0ff", x, y + ch / 2, 120, 0.15 + pop * 0.5);
        break;
      }
      case "piano": {
        shadow(w);
        const top = f - 230;
        ctx.fillStyle = "#1a1418";
        ctx.fillRect(x - w / 2, top, w, 230);
        ctx.fillStyle = "#2a2026";
        ctx.fillRect(x - w / 2 + 14, top + 14, w - 28, 80);
        ctx.fillStyle = "#14100f";
        ctx.fillRect(x - w / 2 - 10, top + 110, w + 20, 18);
        const n = 14;
        for (let i = 0; i < n; i++) {
          const kx = x - w / 2 + 6 + (i * (w - 12)) / n;
          ctx.fillStyle = PAPER.base;
          ctx.fillRect(kx, top + 112, (w - 12) / n - 2, 14);
        }
        ctx.fillStyle = BRASS.base;
        ctx.fillRect(x - 60, top + 40, 120, 3);
        if (open) drawGlow(ctx, GLOW, x, top + 60, 150, 0.35 + pop * 0.4);
        break;
      }
      case "safe": {
        const y = 300;
        const sh = 170;
        ctx.fillStyle = "#1c1d22";
        ctx.fillRect(x - w / 2 - 10, y - 10, w + 20, sh + 20);
        ctx.fillStyle = "#3a3d46";
        ctx.fillRect(x - w / 2, y, w, sh);
        if (open) {
          ctx.fillStyle = "#120d0a";
          ctx.fillRect(x - w / 2 + 14, y + 14, w - 28, sh - 28);
          drawGlow(ctx, GLOW, x, y + sh / 2, 120, 0.55);
          drawSymbol(ctx, "star", x, y + sh / 2, 26, GLOW);
        }
        this.drawDialStrip(h, st, x, y + sh - 40, 22);
        break;
      }
      case "door":
        this.drawDoor(world, slot, h);
        break;
    }
  }

  /** The little wheels on a lock, readable from across the room. */
  private drawDialStrip(h: Hotspot, st: SpotState, x: number, y: number, size: number) {
    if (h.device.kind !== "dials" || st.solved) return;
    const ctx = this.ctx;
    const n = h.device.solution.length;
    const gap = size * 1.25;
    st.values.forEach((v, i) => {
      const dx = x + (i - (n - 1) / 2) * gap;
      ctx.fillStyle = BRASS.dark;
      ctx.beginPath();
      ctx.roundRect(dx - size / 2, y - size / 2, size, size, size * 0.2);
      ctx.fill();
      drawSymbol(ctx, SYMBOLS[v], dx, y, size * 0.34, BRASS.light);
    });
  }

  private drawClockFace(x: number, y: number, r: number, hour: number, quarter: number, cursor: number) {
    const ctx = this.ctx;
    ctx.fillStyle = PAPER.base;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = BRASS.base;
    ctx.lineWidth = r * 0.08;
    ctx.stroke();
    ctx.fillStyle = PAPER.ink;
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12 - Math.PI / 2;
      const k = i % 3 === 0 ? 0.11 : 0.06;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, r * k * 0.5, 0, TAU);
      ctx.fill();
    }
    const minute = quarter * 15;
    const ha = ((hour % 12) + minute / 60) * (TAU / 12) - Math.PI / 2;
    const ma = minute * (TAU / 60) - Math.PI / 2;
    const hand = (a: number, len: number, width: number, hot: boolean) => {
      ctx.strokeStyle = hot ? GLOW : PAPER.ink;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    };
    hand(ma, r * 0.78, r * 0.06, cursor === 1);
    hand(ha, r * 0.5, r * 0.1, cursor === 0);
    ctx.fillStyle = BRASS.base;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.07, 0, TAU);
    ctx.fill();
  }

  private drawDoor(world: World, slot: Slot, h: Hotspot) {
    const ctx = this.ctx;
    const { x } = h;
    const dw = 150;
    const top = DOOR_TOP;
    const hinge = slot === 0 ? x + dw / 2 : x - dw / 2;
    // Frame and the warm crack under it.
    ctx.fillStyle = WOOD.dark;
    ctx.fillRect(x - dw / 2 - 16, top - 16, dw + 32, FLOOR_Y - top + 16);
    ctx.fillStyle = "#0e0907";
    ctx.fillRect(x - dw / 2, top, dw, FLOOR_Y - top);
    // Opening: the panel swings toward the hinge, light floods in.
    const open = this.opened;
    if (open > 0) {
      const g = ctx.createLinearGradient(0, top, 0, FLOOR_Y);
      g.addColorStop(0, rgba(GLOW, 0.5 * open));
      g.addColorStop(1, rgba(GLOW, 0.9 * open));
      ctx.fillStyle = g;
      ctx.fillRect(x - dw / 2, top, dw, FLOOR_Y - top);
      drawGlow(ctx, GLOW, x, FLOOR_Y - 140, 380 * open, 0.6 * open);
    }
    const panelW = dw * (1 - open * 0.85);
    const px = slot === 0 ? hinge - panelW : hinge;
    ctx.fillStyle = WOOD.mid;
    ctx.fillRect(px, top, panelW, FLOOR_Y - top);
    if (open < 0.6) {
      ctx.strokeStyle = rgba(WOOD.edge, 0.6);
      ctx.lineWidth = 3;
      ctx.strokeRect(px + panelW * 0.14, top + 30, panelW * 0.72, 110);
      ctx.strokeRect(px + panelW * 0.14, top + 170, panelW * 0.72, 120);
      // Handle and keyhole plate on the side away from the hinge.
      const kx = slot === 0 ? px + 24 : px + panelW - 24;
      const ky = keyholeY();
      ctx.fillStyle = BRASS.base;
      ctx.beginPath();
      ctx.roundRect(kx - 11, ky - 40, 22, 80, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(kx, ky - 22, 9, 0, TAU);
      ctx.fill();
      const partnerPeeking = world.players[slot === 0 ? 1 : 0].peek > 0;
      ctx.fillStyle = partnerPeeking ? PLAYER_COLORS[slot === 0 ? 1 : 0] : world.unlocked ? GLOW : INK;
      keyholePath(ctx, kx, ky + 12, 22);
      ctx.fill();
      if (world.unlocked || partnerPeeking) drawGlow(ctx, world.unlocked ? GLOW : PLAYER_COLORS[slot === 0 ? 1 : 0], kx, ky + 12, 60, 0.5 + 0.2 * Math.sin(this.clock * 3));
    }
    // Light leaking under the door.
    drawGlow(ctx, GLOW, x, FLOOR_Y - 2, 70, world.unlocked ? 0.45 : 0.18);

    // Both holding: a ring fills around the keyhole.
    const hold = Math.min(world.players[0].holding, world.players[1].holding);
    if (world.unlocked && !world.opened && world.players[slot].holding > 0) {
      const k = clamp(hold / DOOR_HOLD, 0, 1);
      ctx.strokeStyle = rgba(GLOW, 0.25);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, top - 50, 22, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = GLOW;
      ctx.beginPath();
      ctx.arc(x, top - 50, 22, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      ctx.stroke();
    }
  }

  // ─── People ─────────────────────────────────────────────────────────────────

  private drawCharacter(world: World, slot: Slot, alpha: number) {
    const ctx = this.ctx;
    const p = world.players[slot];
    const x = lerp(p.prevX, p.x, alpha);
    const color = PLAYER_COLORS[slot];
    const step = p.moving ? Math.sin(p.stride * TAU) : 0;
    const bob = p.moving ? Math.abs(step) * 5 : Math.sin(this.clock * 2) * 1.5;
    const f = FLOOR_Y;
    const lean = p.peek > 0 ? 0.12 * p.facing : 0;

    ctx.fillStyle = rgba(INK, 0.4);
    ctx.beginPath();
    ctx.ellipse(x, f + 4, 34, 8, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, f);
    ctx.rotate(lean);
    // Legs.
    ctx.strokeStyle = "#2a2230";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-10, -48);
    ctx.lineTo(-10 + step * 12, -8);
    ctx.moveTo(10, -48);
    ctx.lineTo(10 - step * 12, -8);
    ctx.stroke();
    // Body: a soft capsule in their colour.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-30, -CHARACTER_H + 50 - bob, 60, 70, 26);
    ctx.fill();
    ctx.fillStyle = rgba("#ffffff", 0.14);
    ctx.beginPath();
    ctx.roundRect(-22, -CHARACTER_H + 56 - bob, 18, 50, 9);
    ctx.fill();
    // Head.
    const hy = -CHARACTER_H + 22 - bob;
    ctx.fillStyle = "#f2d6c2";
    ctx.beginPath();
    ctx.arc(0, hy, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = slot === 0 ? "#5a3328" : "#2d2a3e";
    ctx.beginPath();
    ctx.arc(0, hy - 6, 27, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();
    // Eyes look where they're facing; shut while peeking (one eye to the hole).
    ctx.fillStyle = "#2a2230";
    const ex = p.facing * 9;
    if (p.peek > 0) {
      ctx.fillRect(ex - 5 - p.facing * 9, hy + 2, 8, 2.5);
    } else {
      const blink = Math.sin(this.clock * 0.9 + slot * 3) > 0.985 ? 0.3 : 1;
      for (const o of [-8, 8]) {
        ctx.beginPath();
        ctx.ellipse(ex + o * 0.8, hy + 2, 3, 4 * blink, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = rgba("#ff8a9d", 0.45);
    ctx.beginPath();
    ctx.arc(ex - 14, hy + 10, 4, 0, TAU);
    ctx.arc(ex + 14, hy + 10, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    // What they're carrying, held up.
    const last = p.items.at(-1);
    if (last) {
      const ay = f - CHARACTER_H - 40 - bob + Math.sin(this.clock * 3) * 3;
      drawGlow(ctx, GLOW, x + p.facing * 34, ay, 40, 0.4);
      drawItem(ctx, last, x + p.facing * 34, ay, 18);
    }

    // A thought, out loud.
    if (p.say) {
      ctx.font = `500 22px ${this.font}`;
      const tw = ctx.measureText(p.say.text).width;
      const bx = clamp(x, tw / 2 + 30, ROOM_W - tw / 2 - 30);
      const by = f - CHARACTER_H - 90;
      ctx.fillStyle = rgba(CREAM, 0.95);
      ctx.beginPath();
      ctx.roundRect(bx - tw / 2 - 18, by - 26, tw + 36, 48, 24);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 8, by + 20);
      ctx.lineTo(x + 8, by + 20);
      ctx.lineTo(x, by + 34);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.fillText(p.say.text, bx, by + 6);
    }
  }

  /** What pressing Use would do, floating over the thing. */
  private drawPrompt(world: World, slot: Slot) {
    const p = world.players[slot];
    if (p.panel || p.peek > 0 || world.opened) return;
    const h = world.nearest(slot);
    if (!h) return;
    const st = world.spots[slot][h.id];
    let text = h.label;
    if (h.device.kind === "door") {
      const item = p.items.at(-1);
      text = item ? `Pass the ${ITEMS[item].label.toLowerCase()} through` : world.unlocked ? "Hold Use together" : "Peek through the keyhole";
    } else if (st.solved && h.device.kind !== "clue") return;
    else if (h.device.kind === "container" && p.items.includes(h.device.needs)) text = `Use the ${ITEMS[h.device.needs].label.toLowerCase()}`;
    const ctx = this.ctx;
    const y = h.device.kind === "door" ? DOOR_TOP - 60 : propTop(h) - 34;
    ctx.font = `600 20px ${this.font}`;
    const tw = ctx.measureText(text).width;
    const bob = Math.sin(this.clock * 3) * 3;
    const x = clamp(h.x, tw / 2 + 40, ROOM_W - tw / 2 - 40);
    ctx.fillStyle = rgba(INK, 0.72);
    ctx.beginPath();
    ctx.roundRect(x - tw / 2 - 40, y - 22 + bob, tw + 60, 42, 21);
    ctx.fill();
    ctx.fillStyle = PLAYER_COLORS[slot];
    ctx.beginPath();
    ctx.arc(x - tw / 2 - 18, y - 1 + bob, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 12px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillText("A", x - tw / 2 - 18, y + 3 + bob);
    ctx.fillStyle = CREAM;
    ctx.font = `600 20px ${this.font}`;
    ctx.textAlign = "left";
    ctx.fillText(text, x - tw / 2 - 2, y + 6 + bob);
  }

  // ─── Through the keyhole ────────────────────────────────────────────────────

  private drawPeek(world: World, slot: Slot, vp: Viewport, k: number, alpha: number) {
    const ctx = this.ctx;
    const other: Slot = slot === 0 ? 1 : 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = rgba(INK, 0.92 * k);
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);

    const hh = Math.min(vp.h * 0.78, vp.w * 1.1) * (0.85 + 0.15 * k);
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;
    ctx.save();
    keyholePath(ctx, cx, cy, hh);
    ctx.clip();
    // Their room, framed by the hole, following them around it.
    const room = world.chapter.rooms[other];
    const them = world.players[other];
    const view: Viewport = { slot: other, x: cx - hh * 0.6, y: cy - hh / 2, w: hh * 1.2, h: hh };
    const span = ROOM_W * 0.5;
    const lookX = clamp(lerp(them.prevX, them.x, alpha), span / 2, ROOM_W - span / 2);
    fitTransform(ctx, view, this.dpr, span, ROOM_H * 0.5, lookX, FLOOR_Y - ROOM_H * 0.2, "cover");
    ctx.globalAlpha = k;
    this.drawRoom(world, other, room, THEMES[room.theme], alpha, false);
    this.drawCharacter(world, other, alpha);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.strokeStyle = rgba(BRASS.base, 0.8 * k);
    ctx.lineWidth = 3;
    keyholePath(ctx, cx, cy, hh);
    ctx.stroke();
    // Eye to eye: a heart where the two looks meet.
    if (this.eyes > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.eyes * 2) * k;
      drawSymbol(ctx, "heart", cx, cy - hh * 0.2, hh * 0.12, PLAYER_COLORS[other]);
      drawGlow(ctx, PLAYER_COLORS[other], cx, cy - hh * 0.2, hh * 0.3, 0.6);
      ctx.restore();
    }
    ctx.globalAlpha = k;
    ctx.font = `500 13px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(CREAM, 0.6);
    ctx.fillText(`${room.name} — ${this.names[other] || "next door"}`.toUpperCase(), cx, cy + hh / 2 + 28);
    ctx.globalAlpha = 1;
  }

  // ─── Close-ups ──────────────────────────────────────────────────────────────

  private drawPanel(world: World, slot: Slot, vp: Viewport, id: string, k: number) {
    const h = world.hotspot(slot, id);
    if (!h) return;
    const ctx = this.ctx;
    const st = world.spots[slot][id];
    const p = world.players[slot];
    const fx = this.fx[slot];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = rgba(INK, 0.7 * k);
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h);

    const pw = Math.min(vp.w - 48, 620);
    const ph = Math.min(vp.h - 140, 360);
    const shake = fx.wrong < 0.4 ? Math.sin(fx.wrong * 60) * 10 * (1 - fx.wrong / 0.4) : 0;
    const px = vp.x + (vp.w - pw) / 2 + shake;
    const py = vp.y + (vp.h - ph) / 2 + (1 - k) * 30;
    ctx.globalAlpha = k;
    ctx.fillStyle = "#17121a";
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 24);
    ctx.fill();
    ctx.strokeStyle = rgba(CREAM, 0.08);
    ctx.lineWidth = 1;
    ctx.stroke();

    const cx = px + pw / 2;
    const cy = py + ph / 2 - 10;
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(CREAM, 0.5);
    ctx.font = `600 11px ${this.font}`;
    ctx.fillText(h.label.toUpperCase(), cx, py + 34);

    const unit = Math.min(pw / 7, ph / 4.2);
    const d = h.device;
    let footer = "Use or Back to close";
    if (d.kind === "clue") {
      const art = d.art;
      if (art.kind === "symbols") {
        const n = art.symbols.length;
        art.symbols.forEach((s, i) => {
          const sx = cx + (i - (n - 1) / 2) * unit * 1.35;
          drawGlow(ctx, GLOW, sx, cy, unit * 0.9, 0.18);
          drawSymbol(ctx, s, sx, cy, unit * 0.45, CREAM);
        });
        this.caption(art.caption, cx, py + ph - 60);
      } else if (art.kind === "colors") {
        const n = art.colors.length;
        art.colors.forEach((c, i) => {
          const sx = cx + (i - (n - 1) / 2) * unit * 1.35;
          ctx.fillStyle = COLOR_HEX[c];
          ctx.beginPath();
          ctx.arc(sx, cy, unit * 0.36, 0, TAU);
          ctx.fill();
          drawGlow(ctx, COLOR_HEX[c], sx, cy, unit, 0.35);
          ctx.fillStyle = rgba(CREAM, 0.45);
          ctx.font = `500 12px ${this.font}`;
          ctx.fillText(String(i + 1), sx, cy + unit * 0.75);
        });
        this.caption(art.caption, cx, py + ph - 60);
      } else if (art.kind === "note") {
        ctx.fillStyle = PAPER.base;
        ctx.beginPath();
        ctx.roundRect(cx - pw * 0.32, py + 56, pw * 0.64, ph - 120, 6);
        ctx.fill();
        ctx.fillStyle = PAPER.ink;
        ctx.font = `italic 400 ${Math.round(unit * 0.32)}px ${this.display}`;
        art.lines.forEach((line, i) => ctx.fillText(line, cx, py + 100 + i * unit * 0.48));
      } else if (art.kind === "melody") {
        const sw = pw * 0.7;
        const top = cy - unit * 0.6;
        const gap = unit * 0.3;
        ctx.strokeStyle = rgba(CREAM, 0.35);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - sw / 2, top + i * gap);
          ctx.lineTo(cx + sw / 2, top + i * gap);
          ctx.stroke();
        }
        const n = art.notes.length;
        const playing = Math.floor(((this.clock * 2.5) % (n + 3)));
        art.notes.forEach((note, i) => {
          const nx = cx - sw / 2 + ((i + 0.75) * sw) / (n + 0.5);
          const ny = top + (4 - note) * gap;
          const hot = i === playing;
          ctx.fillStyle = hot ? GLOW : CREAM;
          ctx.beginPath();
          ctx.ellipse(nx, ny, gap * 0.62, gap * 0.45, -0.35, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = hot ? GLOW : CREAM;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(nx + gap * 0.55, ny);
          ctx.lineTo(nx + gap * 0.55, ny - gap * 3);
          ctx.stroke();
          if (hot) drawGlow(ctx, GLOW, nx, ny, gap * 2.4, 0.5);
        });
        this.caption(art.caption, cx, py + ph - 60);
      }
    } else if (d.kind === "dials") {
      const n = d.solution.length;
      footer = "◀ ▶ choose a wheel · ▲ ▼ turn it · B back";
      st.values.forEach((v, i) => {
        const sx = cx + (i - (n - 1) / 2) * unit * 1.4;
        const on = p.cursor === i;
        ctx.fillStyle = on ? "#2a2130" : "#211a26";
        ctx.beginPath();
        ctx.roundRect(sx - unit * 0.55, cy - unit * 1.05, unit * 1.1, unit * 2.1, unit * 0.3);
        ctx.fill();
        if (on) {
          ctx.strokeStyle = PLAYER_COLORS[slot];
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        const prev = SYMBOLS[(v + SYMBOLS.length - 1) % SYMBOLS.length];
        const next = SYMBOLS[(v + 1) % SYMBOLS.length];
        drawSymbol(ctx, next, sx, cy - unit * 0.68, unit * 0.17, rgba(CREAM, 0.22));
        drawSymbol(ctx, SYMBOLS[v], sx, cy, unit * 0.36, on ? BRASS.light : CREAM);
        drawSymbol(ctx, prev, sx, cy + unit * 0.68, unit * 0.17, rgba(CREAM, 0.22));
      });
    } else if (d.kind === "clock") {
      footer = "◀ ▶ hour or minute hand · ▲ ▼ turn · B back";
      this.drawClockFace(cx, cy, unit * 1.05, st.values[0], st.values[1], p.cursor);
      ctx.fillStyle = rgba(CREAM, 0.7);
      ctx.font = `600 12px ${this.font}`;
      ctx.fillText(p.cursor === 0 ? "HOUR HAND" : "MINUTE HAND", cx, py + ph - 60);
    } else if (d.kind === "sequence") {
      footer = "◀ ▶ choose · A press · B back";
      const n = d.keys.length;
      const done = st.entered;
      d.keys.forEach((key, i) => {
        const sx = cx + (i - (n - 1) / 2) * unit * 1.15;
        const on = p.cursor === i;
        const flash = fx.keys.get(i) ?? 9;
        const lit = flash < 0.35;
        if (d.style === "lamps") {
          const color = COLOR_HEX[key as ColorId];
          ctx.fillStyle = lit || done.includes(i) ? color : rgba(color, 0.3);
          ctx.beginPath();
          ctx.arc(sx, cy, unit * 0.36, 0, TAU);
          ctx.fill();
          if (lit || done.includes(i)) drawGlow(ctx, color, sx, cy, unit * 1.1, 0.5);
        } else {
          ctx.fillStyle = lit ? GLOW : PAPER.base;
          ctx.beginPath();
          ctx.roundRect(sx - unit * 0.45, cy - unit * 0.9, unit * 0.9, unit * 1.9, [4, 4, 12, 12]);
          ctx.fill();
          if (lit) drawGlow(ctx, GLOW, sx, cy, unit, 0.4);
        }
        if (on) {
          ctx.fillStyle = PLAYER_COLORS[slot];
          ctx.beginPath();
          ctx.moveTo(sx - 8, cy + unit * 1.2);
          ctx.lineTo(sx + 8, cy + unit * 1.2);
          ctx.lineTo(sx, cy + unit * 1.05);
          ctx.fill();
        }
      });
      // How far along you are, as small dots.
      const total = d.solution.length;
      for (let i = 0; i < total; i++) {
        ctx.fillStyle = i < done.length ? GLOW : rgba(CREAM, 0.18);
        ctx.beginPath();
        ctx.arc(cx + (i - (total - 1) / 2) * 16, py + ph - 60, 4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = rgba(CREAM, 0.4);
    ctx.font = `500 12px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillText(footer, cx, py + ph - 24);
    ctx.globalAlpha = 1;
  }

  private caption(text: string, x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = rgba(CREAM, 0.6);
    ctx.font = `italic 400 16px ${this.display}`;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y);
  }

  // ─── Screen chrome ──────────────────────────────────────────────────────────

  private drawChrome(world: World, slot: Slot, vp: Viewport, intro: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const room = world.chapter.rooms[slot];
    const color = PLAYER_COLORS[slot];
    const name = this.names[slot];
    const p = world.players[slot];

    // Room chip, bottom-right (bottom-centre belongs to key hints).
    ctx.font = `600 11px ${this.font}`;
    ctx.textAlign = "left";
    const chip = `${room.name.toUpperCase()}${name ? ` · ${name.toUpperCase()}` : ""}`;
    const tw = ctx.measureText(chip).width;
    const x = vp.x + vp.w - tw - 54;
    const y = vp.y + vp.h - 44;
    ctx.fillStyle = rgba(INK, 0.55);
    ctx.beginPath();
    ctx.roundRect(x, y - 15, tw + 34, 26, 13);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 13, y - 2, 3.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(CREAM, 0.85);
    ctx.fillText(chip, x + 24, y + 2);

    // Pockets, bottom-left.
    if (p.items.length) {
      const arrived = this.fx[slot].arrived;
      let ix = vp.x + 28;
      for (const item of p.items) {
        const label = ITEMS[item].label;
        ctx.font = `500 12px ${this.font}`;
        const lw = ctx.measureText(label).width;
        const pop = arrived < 0.5 && item === p.items.at(-1) ? 1 + Math.sin((arrived / 0.5) * Math.PI) * 0.15 : 1;
        ctx.fillStyle = rgba(INK, 0.6);
        ctx.beginPath();
        ctx.roundRect(ix, y - 17, (lw + 52) * pop, 30, 15);
        ctx.fill();
        drawItem(ctx, item, ix + 18, y - 2, 10 * pop);
        ctx.fillStyle = rgba(CREAM, 0.85);
        ctx.textAlign = "left";
        ctx.fillText(label, ix + 34, y + 2);
        ix += lw + 64;
      }
    }

    if (intro <= 0.01) return;
    const partner = this.names[slot === 0 ? 1 : 0];
    ctx.textAlign = "center";
    const mx = vp.x + vp.w / 2;
    // Over the wall, clear of the furniture and the people.
    const my = vp.y + vp.h * 0.5;
    ctx.fillStyle = rgba(INK, 0.5 * intro);
    ctx.beginPath();
    ctx.roundRect(mx - Math.min(vp.w * 0.45, 260), my - 46, Math.min(vp.w * 0.9, 520), 84, 18);
    ctx.fill();
    ctx.fillStyle = rgba(color, intro);
    ctx.font = `italic 400 ${vp.w < 520 ? 22 : 28}px ${this.display}`;
    ctx.fillText(`You're in the ${room.name.toLowerCase()}`, mx, my - 8);
    ctx.fillStyle = rgba(CREAM, 0.75 * intro);
    ctx.font = `400 ${vp.w < 520 ? 12 : 14}px ${this.font}`;
    ctx.fillText(`${partner || "Your partner"} is on the other side of the door.`, mx, my + 20, vp.w * 0.86);
  }
}

const keyholeY = () => FLOOR_Y - 170;

/** Roughly where a prop's top edge is, for prompts and sparkles. */
function propTop(h: Hotspot): number {
  switch (h.prop) {
    case "painting":
    case "starchart":
      return 230;
    case "note":
      return 270;
    case "safe":
      return 290;
    case "clock":
      return FLOOR_Y - 440;
    case "cabinet":
      return FLOOR_Y - 370;
    case "lamps":
      return FLOOR_Y - 230;
    case "flower":
      return FLOOR_Y - 350;
    case "piano":
      return FLOOR_Y - 240;
    case "desk":
      return FLOOR_Y - 260;
    case "door":
      return DOOR_TOP;
    default:
      return FLOOR_Y - 200;
  }
}
