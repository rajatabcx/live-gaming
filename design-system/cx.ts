/** Join class names, skipping falsy values. Tiny on purpose — no clsx/cva dependency. */
export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
