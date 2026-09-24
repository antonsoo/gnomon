/**
 * Curated Latin sundial mottoes. Attributions are checked, not assumed:
 * most mottoes cut into real sundials are anonymous folk Latin with no
 * classical source, and claiming one for a Roman poet who never wrote it
 * is the single most common error in sundial literature. Where a phrase
 * genuinely traces to a classical text, the citation is exact (author,
 * work, line); otherwise it is marked "traditional".
 */

export interface Motto {
  latin: string;
  translation: string;
  attribution: string;
  note?: string;
}

export const MOTTOES: Motto[] = [
  {
    latin: "Horas non numero nisi serenas",
    translation: "I count only the sunny hours",
    attribution: "traditional",
    note: "The most common sundial motto in English and continental gardens; no classical source, despite frequent misattribution.",
  },
  {
    latin: "Pulvis et umbra sumus",
    translation: "We are dust and shadow",
    attribution: "Horace, Odes 4.7.16",
  },
  {
    latin: "Carpe diem",
    translation: "Seize the day",
    attribution: "Horace, Odes 1.11.8",
    note: "Full line: \"carpe diem, quam minimum credula postero\" (seize the day, trusting as little as possible in the next one).",
  },
  {
    latin: "Tempus fugit",
    translation: "Time flies",
    attribution: "traditional, condensed from Virgil",
    note: "Shortened from Virgil, Georgics 3.284: \"fugit inreparabile tempus\" (time flies, never to return).",
  },
  {
    latin: "Sine sole sileo",
    translation: "Without the sun I am silent",
    attribution: "traditional",
  },
  {
    latin: "Vulnerant omnes, ultima necat",
    translation: "Every hour wounds, the last one kills",
    attribution: "traditional",
    note: "Common on clock and sundial faces across Europe; refers to the hours, not the dial itself.",
  },
  {
    latin: "Ultima forsan",
    translation: "Perhaps the last [hour]",
    attribution: "traditional",
  },
  {
    latin: "Sic transit gloria mundi",
    translation: "Thus passes the glory of the world",
    attribution: "traditional, echoing Thomas a Kempis",
    note: "Compare Thomas a Kempis, De Imitatione Christi I.3.6: \"O quam cito transit gloria mundi.\"",
  },
];
