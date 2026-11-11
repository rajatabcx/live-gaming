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
- **UI comes only from `@/design-system`** (Radix primitives + our tokens, no shadcn). Figma file "Tandem — Design System" is the source of truth; names map 1:1 to code. See `design-system/README.md` before touching styles.

## Architecture (high level)

- **Host screen** (laptop/TV): `/room/[code]` — runs the game loop, renders the game, shows QR + join link.
- **Controller** (phone): `/play/[code]` — sends input only; never runs game logic.
- **Realtime**: WebRTC data channels, host ↔ each phone (peer-to-peer). Signaling via PeerJS broker. No game server needed, so Vercel serves only static pages. Transport lives behind `lib/realtime/` interfaces so it can be swapped (e.g. for a managed provider) without touching games.
- **Games** live in `games/<id>/` and register in `games/registry.ts`. A game gets a typed input stream + player list from the room; it owns its own loop and canvas.
