import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"] });

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
    <html lang="en" className={`${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
