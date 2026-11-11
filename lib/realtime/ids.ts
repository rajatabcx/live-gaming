/** randomUUID needs a secure context; LAN dev over plain http doesn't have one. */
export function randomId(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bump when the wire protocol changes incompatibly — old and new clients land in different topics. */
const NAMESPACE = "duet-v2";
export const roomTopic = (code: string) => `${NAMESPACE}:room:${code.toLowerCase()}`;
