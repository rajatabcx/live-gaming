/**
 * The URL a phone should open to join. On localhost we swap in the LAN
 * address (dev only) so a phone on the same Wi-Fi can actually reach it.
 */
export function joinUrl(code: string): string {
  const { origin, hostname } = window.location;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const base = isLocal && process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN ? process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN : origin;
  return `${base}/play/${code}`;
}
