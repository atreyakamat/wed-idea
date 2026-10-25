import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { polaroidFontVariables } from "@/lib/polaroid/fonts";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
// Elegant italic serif for headings.
const heading = Instrument_Serif({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Cute Wedding Polaroid",
    template: "%s · Cute Wedding Polaroid",
  },
  description:
    "Polaroid moments for your wedding guests: photos on WhatsApp, prints delivered anywhere in India.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${polaroidFontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
