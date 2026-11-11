import type { Metadata } from "next";
import { JoinForm } from "@/components/controller/join-form";
import { Text, Wordmark } from "@/design-system";

export const metadata: Metadata = { title: "Join" };

export default function JoinPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col px-6 pb-10 pt-6">
      <Wordmark />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-10">
        <div className="animate-fade-up">
          <Text as="h1" variant="display-m">
            Enter the room code
          </Text>
          <Text variant="body-l" className="mt-3">
            It&apos;s the four letters on the big screen.
          </Text>
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <JoinForm />
        </div>
      </div>
    </main>
  );
}
