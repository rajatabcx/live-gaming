"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Renders a QR as inline SVG in the brand colors. */
export function QrCode({ value, className = "" }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0a0d", light: "#00000000" },
    }).then((s) => !cancelled && setSvg(s));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      className={`aspect-square [&>svg]:h-full [&>svg]:w-full ${className}`}
      // Generated locally by the qrcode lib from our own URL.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
