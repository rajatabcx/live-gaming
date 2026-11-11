import type { GameDefinition } from "./types";

/** The catalogue: shipped games only. Order is display order. */
export const GAMES: GameDefinition[] = [
  {
    id: "tongue-tied",
    title: "Tongue Tied",
    tagline: "Two frogs. One tongue each. No way up alone.",
    description:
      "A co-op platformer on a moonlit pond. Stack up, swing from lanterns, hold the gate, and be each other's bridge — every ledge needs both of you.",
    mood: "co-op",
    minutes: "10–20 min",
    palette: ["#7ee0a1", "#2f7a5b"],
    load: () => import("./tongue-tied/game"),
  },
  {
    id: "wobble-run",
    title: "Wobble Run",
    tagline: "A candy obstacle course. First to the flag.",
    description:
      "Jelly-legged runners on a sugary gauntlet of windmills, thumpers and crumbling biscuit bridges. Best of three heats — dive to shove, bounce to climb, don't look down.",
    mood: "versus",
    minutes: "5–10 min",
    palette: ["#ffd36e", "#ff6fa5"],
    load: () => import("./wobble-run/game"),
  },
  {
    id: "lanterns",
    title: "Lanterns",
    tagline: "Drift through the night. Light the sky together.",
    description:
      "A calm, wordless journey. Guide two paper lanterns through the dark — stars only ignite when you reach them side by side.",
    mood: "chill",
    minutes: "5–10 min",
    palette: ["#ffc58a", "#7a4a8f"],
    load: () => import("./lanterns/game"),
  },
  {
    id: "lighthouse",
    title: "Lighthouse",
    tagline: "One keeps the light. One sails home through the fog.",
    description:
      "Made for two screens. The keeper sees the whole sea but not the boat; the sailor sees only what the beam touches. Talk each other home across three foggy nights — then swap.",
    mood: "co-op",
    minutes: "15–20 min",
    palette: ["#ffd9a0", "#1d3a5c"],
    twoScreens: true,
    load: () => import("./lighthouse/game"),
  },
  {
    id: "keyhole",
    title: "Keyhole",
    tagline: "Two rooms, one locked door. Every clue is on the other side.",
    description:
      "Made for two screens. You each wake up in a different room of the same old house. Describe what you see, pass things through the keyhole, and open the door between you — three chapters, no solving it alone.",
    mood: "co-op",
    minutes: "20–30 min",
    palette: ["#ffc58a", "#33222a"],
    twoScreens: true,
    load: () => import("./keyhole/game"),
  },
];

export const getGame = (id: string | null | undefined) => GAMES.find((g) => g.id === id) ?? null;
