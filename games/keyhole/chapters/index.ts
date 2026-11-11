import type { ChapterData } from "../sim/chapter";

/**
 * Three evenings, two rooms each, one door between them. Every clue lives on
 * the other side of the wall from the lock it opens, so nothing gets solved
 * without describing it out loud. Items cross through the keyhole.
 *
 * Room 0's door is on its right wall (x ≈ 1500), room 1's on its left (x ≈ 100).
 */
export const CHAPTERS: ChapterData[] = [
  {
    name: "The Study",
    subtitle: "Somebody locked the door between you",
    hint: "Walk up to things and press Use. Small things fit through the keyhole.",
    rooms: [
      {
        name: "Study",
        theme: "study",
        hotspots: [
          {
            id: "painting",
            x: 470,
            w: 220,
            prop: "painting",
            label: "Painting",
            device: { kind: "clue", art: { kind: "symbols", symbols: ["moon", "star", "heart"], caption: "Three marks, left to right" } },
          },
          { id: "desk", x: 900, w: 260, prop: "desk", label: "Desk", device: { kind: "container", needs: "brass-key" }, reveals: "letter" },
          {
            id: "letter",
            x: 1130,
            w: 90,
            prop: "letter",
            label: "Letter",
            hidden: true,
            device: { kind: "clue", art: { kind: "colors", colors: ["gold", "rose", "sky", "sage"], caption: "Light them like this, my love" } },
          },
          { id: "door", x: 1500, w: 120, prop: "door", label: "Door", device: { kind: "door" } },
        ],
      },
      {
        name: "Parlour",
        theme: "parlour",
        hotspots: [
          { id: "door", x: 100, w: 120, prop: "door", label: "Door", device: { kind: "door" } },
          { id: "chest", x: 560, w: 220, prop: "chest", label: "Chest", device: { kind: "dials", solution: ["moon", "star", "heart"] }, gives: "brass-key" },
          {
            id: "lamps",
            x: 1120,
            w: 420,
            prop: "lamps",
            label: "Lamps",
            device: { kind: "sequence", style: "lamps", keys: ["rose", "gold", "sky", "sage", "plum"], solution: [1, 0, 2, 3] },
          },
        ],
      },
    ],
    doorNeeds: ["1:lamps"],
  },
  {
    name: "Half Past Late",
    subtitle: "A clock that stopped, a garden that didn't",
    hint: "Use the door with empty hands to peek through the keyhole.",
    rooms: [
      {
        name: "Clock room",
        theme: "clock",
        hotspots: [
          { id: "clock", x: 520, w: 200, prop: "clock", label: "Grandfather clock", device: { kind: "clock", solution: { h: 7, m: 15 } }, gives: "seeds" },
          { id: "cabinet", x: 1020, w: 240, prop: "cabinet", label: "Cabinet", device: { kind: "dials", solution: ["sun", "leaf", "bird", "wave"] } },
          { id: "door", x: 1500, w: 120, prop: "door", label: "Door", device: { kind: "door" } },
        ],
      },
      {
        name: "Greenhouse",
        theme: "greenhouse",
        hotspots: [
          { id: "door", x: 100, w: 120, prop: "door", label: "Door", device: { kind: "door" } },
          {
            id: "note",
            x: 480,
            w: 100,
            prop: "note",
            label: "Note",
            device: { kind: "clue", art: { kind: "note", lines: ["Meet me when the", "big hand points east", "and the little one", "sits on seven."] } },
          },
          { id: "pot", x: 950, w: 180, prop: "pot", label: "Empty pot", device: { kind: "container", needs: "seeds" }, reveals: "flower" },
          {
            id: "flower",
            x: 1220,
            w: 120,
            prop: "flower",
            label: "Bloom",
            hidden: true,
            device: { kind: "clue", art: { kind: "symbols", symbols: ["sun", "leaf", "bird", "wave"], caption: "Petals, from the top, clockwise" } },
          },
        ],
      },
    ],
    doorNeeds: ["0:cabinet"],
  },
  {
    name: "Our Song",
    subtitle: "Somewhere up there, a tune you both know",
    hint: "The music box plays when you open it. Hum it to each other.",
    rooms: [
      {
        name: "Attic",
        theme: "attic",
        hotspots: [
          {
            id: "musicbox",
            x: 430,
            w: 140,
            prop: "musicbox",
            label: "Music box",
            device: { kind: "clue", art: { kind: "melody", notes: [2, 0, 3, 1, 4], caption: "Five notes, low to high on the lines" } },
          },
          { id: "telescope", x: 900, w: 200, prop: "telescope", label: "Telescope", device: { kind: "container", needs: "lens" }, reveals: "starchart" },
          {
            id: "starchart",
            x: 1200,
            w: 180,
            prop: "starchart",
            label: "Star chart",
            hidden: true,
            device: { kind: "clue", art: { kind: "symbols", symbols: ["star", "moon", "bird", "key"], caption: "What the lens found tonight" } },
          },
          { id: "door", x: 1500, w: 120, prop: "door", label: "Door", device: { kind: "door" } },
        ],
      },
      {
        name: "Music room",
        theme: "music",
        hotspots: [
          { id: "door", x: 100, w: 120, prop: "door", label: "Door", device: { kind: "door" } },
          {
            id: "piano",
            x: 600,
            w: 340,
            prop: "piano",
            label: "Piano",
            device: { kind: "sequence", style: "piano", keys: [0, 1, 2, 3, 4], solution: [2, 0, 3, 1, 4] },
            gives: "lens",
          },
          { id: "safe", x: 1150, w: 200, prop: "safe", label: "Wall safe", device: { kind: "dials", solution: ["star", "moon", "bird", "key"] } },
        ],
      },
    ],
    doorNeeds: ["1:safe"],
  },
];
