import type { GameDefinition } from "./types";

/**
 * The catalogue. Order is display order. A game without `load` shows as
 * "coming soon" — add `load: () => import("./<id>/game")` once it ships.
 */
export const GAMES: GameDefinition[] = [
  {
    id: "tongue-tied",
    title: "Tongue Tied",
    tagline: "Two frogs. One tongue each. No way up alone.",
    description:
      "A co-op platformer where one of you anchors with a sticky tongue while the other swings, climbs and catapults. Every ledge needs both of you.",
    mood: "co-op",
    minutes: "20–40 min",
    palette: ["#7ee0a1", "#2f7a5b"],
  },
  {
    id: "lanterns",
    title: "Lanterns",
    tagline: "Drift through the night. Light the sky together.",
    description:
      "A calm, wordless journey. Guide two paper lanterns through the dark — stars only ignite when you reach them side by side.",
    mood: "chill",
    minutes: "10–20 min",
    palette: ["#ffc58a", "#7a4a8f"],
  },
  {
    id: "night-kitchen",
    title: "Night Kitchen",
    tagline: "A tiny late-night diner. A rush of orders.",
    description:
      "One of you preps, one of you cooks and plates. Split the jobs, shout across the counter, keep the regulars happy.",
    mood: "co-op",
    minutes: "15–30 min",
    palette: ["#ff8a7a", "#a33b4f"],
  },
  {
    id: "in-sync",
    title: "In Sync",
    tagline: "How well do you really know each other?",
    description:
      "Answer questions about each other in secret on your phones. The screen reveals where you matched — and where you very much didn't.",
    mood: "talk",
    minutes: "10–15 min",
    palette: ["#f4b8d4", "#5b5bd6"],
  },
  {
    id: "bump",
    title: "Bump",
    tagline: "A shrinking island. Push them off first.",
    description:
      "Fast, silly, best-of-five. Dash into each other on a floating island that gets smaller every round.",
    mood: "versus",
    minutes: "5 min",
    palette: ["#8fb8ff", "#2b3f8f"],
  },
];

export const getGame = (id: string | null | undefined) => GAMES.find((g) => g.id === id) ?? null;
