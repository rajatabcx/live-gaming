"use client";

import { useState } from "react";
import { Panel, Text } from "@/design-system";
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
    <Panel className="w-full max-w-[340px] p-6">
      <div className="rounded-md bg-action-primary p-5">
        <QrCode value={url} />
      </div>
      <Text variant="overline" className="mt-6">
        Scan with your phones
      </Text>
      <Text variant="body-s" className="mt-2">
        Or open <span className="text-fg-primary">{pretty.split("/play/")[0]}/join</span> and enter
      </Text>
      <p className="mt-3 font-display text-6xl leading-none tracking-[0.12em]">{code}</p>
      <div className="mt-6 border-t border-line-subtle pt-5">
        <Text variant="overline">Far apart?</Text>
        <Text variant="body-s" className="mt-2">
          Send them the link. On a laptop it opens the whole game — they play with their keyboard.
        </Text>
        <button
          onClick={copy}
          className="mt-4 w-full rounded-full border border-line-strong py-2.5 text-sm text-fg-secondary transition-colors hover:bg-fg-primary/5 hover:text-fg-primary"
        >
          {copied ? "Link copied" : "Copy invite link"}
        </button>
      </div>
    </Panel>
  );
}
