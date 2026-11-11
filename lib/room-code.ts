/**
 * Room codes are short, shoutable across a room, and avoid look-alike glyphs
 * (no I/1, O/0, S/5, Z/2).
 */
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY";
export const ROOM_CODE_LENGTH = 4;

export function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}
