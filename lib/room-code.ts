/**
 * Room codes: short enough to read across a room, long enough not to be guessed.
 *
 * - 28 symbols: letters + digits minus look-alikes (no 0/O, 1/I, 2/Z, 5/S).
 * - 5 characters → 28^5 ≈ 17.2M codes. At 1,000 live rooms a random guess hits
 *   one ~0.006% of the time, vs ~0.4% with 4 letters.
 * - Collisions are still possible in theory; HostRoom retries and the host
 *   screen re-rolls the code if the id is genuinely taken.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY346789";
export const ROOM_CODE_LENGTH = 5;

export function createRoomCode(): string {
  // Rejection sampling: 256 isn't a multiple of 28, so drop the biased tail.
  const limit = 256 - (256 % ALPHABET.length);
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH * 2))) {
      if (b < limit && code.length < ROOM_CODE_LENGTH) code += ALPHABET[b % ALPHABET.length];
    }
  }
  return code;
}

/** Accepts user input ("k7m 4q", "K7M4Q") and returns a canonical code, or null. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}
