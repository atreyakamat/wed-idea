import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@/components/site/analytics";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
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

const DESCRIPTION =
  "Drop a shoot's folder: every photo is auto-edited to suit its light and shared in one private gallery on WhatsApp, within the hour. For wedding and event photographers.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: `${BRAND_NAME}: ${BRAND_TAGLINE}`, template: `%s · ${BRAND_NAME}` },
  description: DESCRIPTION,
  applicationName: BRAND_NAME,
  openGraph: { type: "website", siteName: BRAND_NAME, title: BRAND_NAME, description: DESCRIPTION, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: BRAND_NAME, description: DESCRIPTION },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${polaroidFontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
