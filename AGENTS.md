<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working rules (from the project owner)

- **Never create git worktrees.** Work directly in this checkout on the current branch.
- **Commit in small, structured chunks** — one coherent section per commit (e.g. "design tokens", "realtime transport", "controller page"). No giant commits.
- Code should read like a senior engineer with game-dev experience wrote it: clear module boundaries, typed protocols, no game logic in React render paths.
- Product bar: modern, minimal, premium aesthetic ("premium couples"). It gets posted on social, so every screen must look finished.
- Make taste/UX calls on your own when you're confident they're better; ask the owner only when genuinely torn between options.
- Owner prefers short bullet-point answers.
- **UI comes only from `@/design-system`** (Radix primitives + our tokens, no shadcn). Figma file "Duet — Design System" is the source of truth; names map 1:1 to code. See `design-system/README.md` before touching styles.

## Architecture (high level)

- **Host screen** (laptop/TV): `/room/[code]` — runs the game loop, renders the game, shows QR + join link.
- **Controller** (phone): `/play/[code]` — sends input only; never runs game logic.
- **Realtime**: Supabase Realtime channel per room (`lib/realtime/signaling.ts`) for presence + WebRTC handshake. Phones then talk to the host over a direct WebRTC data channel; if that fails (strict NAT), messages relay through Supabase broadcast (`lib/realtime/link.ts`). No game server; Vercel serves static pages. Games only see the narrow `GameRoom` interface (`games/types.ts`), never the transport. Add `?relay` to a controller URL to test the fallback.
- **Env**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public) in `.env.local` and on Vercel. `DATABASE_URL` is server-only — never import it into client code.
- **Games** live in `games/<id>/` and register in `games/registry.ts`. A game gets a typed input stream + player list from the room; it owns its own loop and canvas.
  - Shape (see `games/tongue-tied/`): `sim/` is pure TS (no DOM, fixed step, deterministic) · `render/` draws it · `session.ts` runs the loop and feeds a HUD store · `game.tsx` only mounts canvas + HUD.
  - Playtest without phones at `/dev/<id>` (dev builds only; keyboard room, two players on one keyboard).
  - `pnpm playtest` runs headless bots through every Tongue Tied level, Wobble Run course and Lanterns chapter — run it after touching sim tuning or level/course/chapter data. `TRACE=1` on the Wobble Run script prints a per-step trace.
