# Duet design system

**Figma (source of truth):** https://www.figma.com/design/ADSyRYkzjDSAqSlKyV2zvw

- **Foundations** page: color, type ramp, radius
- **Components** page: Button, Badge, Input, Seat, Panel
- **Brand** page: name options, logo mark, hero illustration

Behaviour and accessibility come from [Radix primitives](https://www.radix-ui.com/primitives) (`radix-ui`). The look comes from our tokens. No shadcn.

## Figma → code mapping

| Figma | Code |
| --- | --- |
| Variable `color/fg/primary` | CSS `--color-fg-primary` · Tailwind `text-fg-primary` / `bg-fg-primary` |
| Variable `ink/900` (primitive) | CSS `--ink-900` (never used directly in components) |
| Variable `radius/md` | CSS `--radius-md` · Tailwind `rounded-md` |
| Variable `space/4` | CSS `--space-4` · Tailwind `p-4` / `gap-4` (same 4px grid) |
| Text style `Display/XL` | `.type-display-xl` · `<Text variant="display-xl">` |
| Component `Button` (Variant, Size) | `<Button variant="primary\|ghost" size="md\|lg">` |
| Component `Badge` (Tone) | `<Badge tone="neutral\|p1\|p2\|glow">` |
| Component `Input` | `<Input>` + `<Field>` (Radix Label) |
| Component `Panel` | `<Panel>` |

Every Figma variable has its **WEB code syntax** set to the CSS name, so Dev Mode shows the exact `var(--…)` to paste.

## Updating

1. Change it in Figma.
2. Change the same line in `tokens.css` / `typography.css`, or the matching component file. Names never change on one side only.
3. Canvas games can't read CSS variables, so mirror player and accent colors in `palette.ts`.

## Rules

- Screens import UI only from `@/design-system`.
- No raw hex in components; use tokens. `palette.ts` is the only exception, for canvas.
- New component: build it in Figma with variants bound to variables, then add `components/<name>.tsx` and export it from `index.ts`.
