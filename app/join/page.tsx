import type { Metadata } from "next";
import { JoinForm } from "@/components/controller/join-form";
import { Wordmark } from "@/design-system";

export const metadata: Metadata = { title: "Join" };

export default function JoinPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col px-6 pb-10 pt-6">
      <Wordmark />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10">
        <div className="animate-fade-up">
          <h1 className="font-display text-5xl leading-[1.02]">Enter the room code</h1>
          <p className="mt-3 text-fg-secondary">It&apos;s the four letters on the big screen.</p>
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <JoinForm />
        </div>
      </div>
    </main>
  );
}
