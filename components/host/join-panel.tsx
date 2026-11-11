"use client";

import { useState } from "react";
import { QrCode } from "./qr-code";

export function JoinPanel({ url, code }: { url: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const pretty = url.replace(/^https?:\/\//, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is visible anyway */
    }
  };

  return (
    <div className="w-full max-w-[340px] rounded-[28px] border border-line-subtle bg-surface-base/60 p-6 backdrop-blur-2xl">
      <div className="rounded-2xl bg-action-primary p-5">
        <QrCode value={url} />
      </div>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-tertiary">Scan with your phones</p>
      <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
        Or open <span className="text-fg-primary">{pretty.split("/play/")[0]}/join</span> and enter
      </p>
      <p className="mt-3 font-display text-6xl leading-none tracking-[0.12em]">{code}</p>
      <button
        onClick={copy}
        className="mt-6 w-full rounded-full border border-line-strong py-2.5 text-sm text-fg-secondary transition-colors hover:bg-fg-primary/5 hover:text-fg-primary"
      >
        {copied ? "Link copied" : "Copy invite link"}
      </button>
    </div>
  );
}
