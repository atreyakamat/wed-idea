import { Caveat, Cormorant_Garamond, DM_Mono, Great_Vibes } from "next/font/google";

// Fonts used inside polaroid cards. Browsers only download a font when a
// page actually uses it, so loading these app-wide is cheap.
const script = Great_Vibes({ variable: "--font-polaroid-script", subsets: ["latin"], weight: "400" });
const serif = Cormorant_Garamond({
  variable: "--font-polaroid-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});
const hand = Caveat({ variable: "--font-polaroid-hand", subsets: ["latin"], weight: ["500", "600"] });
const mono = DM_Mono({ variable: "--font-polaroid-mono", subsets: ["latin"], weight: "500" });

export const polaroidFontVariables = `${script.variable} ${serif.variable} ${hand.variable} ${mono.variable}`;
