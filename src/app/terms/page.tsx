import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/site/legal-page";
import { BRAND_NAME, LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of service", description: `The terms for using ${BRAND_NAME}.` };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="12 November 2026">
      <p>
        These terms are an agreement between {LEGAL_NAME} (&ldquo;we&rdquo;) and the studio or photographer who creates an
        account (&ldquo;you&rdquo;). By using {BRAND_NAME} you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        {BRAND_NAME} lets you upload and auto-edit event photos, share them in private galleries, and run a live polaroid
        corner at events. Features can change as we improve the product; we will tell you before removing anything you rely
        on.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or older and give accurate details.</li>
        <li>Keep your password and any PC app keys safe. You are responsible for what happens under your account.</li>
        <li>You decide who is on your team and what they can do.</li>
      </ul>

      <h2>Your photos and your clients</h2>
      <ul>
        <li>You keep all rights to your photos. You give us permission to store, process, edit and show them only to run the service for you.</li>
        <li>
          You confirm you have the right to upload them, and that you collect guests&apos; details (such as WhatsApp numbers)
          lawfully and tell guests how they will be used. Our <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link> explains our part.
        </li>
        <li>You will pass on and act on requests from people who want photos of themselves removed.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use the service to upload unlawful content, content you have no right to share, or to harm, harass or spam anyone, or try to break or overload it.</p>

      <h2>Plans and payment</h2>
      <ul>
        <li>Plans are monthly and paid in advance; prices are on the <Link href="/pricing" className="underline underline-offset-4">Pricing</Link> page. GST is added where it applies.</li>
        <li>The free trial lets you try the service on a small shoot.</li>
        <li>
          If a payment is late, you have 7 days of grace; after that you can&apos;t start new shoots until it is settled.
          Live galleries stay open for guests.
        </li>
        <li>Fees already paid are not refunded, except where the law requires.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We work to keep the service available and your photos safe, but we can&apos;t promise it will never be interrupted.
        Keep your original files: the service stores web-size copies, not your originals.
      </p>

      <h2>Ending</h2>
      <p>
        You can close your account at any time by writing to us. We may suspend accounts that break these terms or don&apos;t pay. After an
        account closes, we delete its data as described in the Privacy policy.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect losses, and our total liability is limited to the fees
        you paid us in the three months before the claim.
      </p>

      <h2>Law and contact</h2>
      <p>
        These terms are governed by the laws of India, and the courts at Goa have jurisdiction. Questions: <Contact email={SUPPORT_EMAIL} />.
      </p>
    </LegalPage>
  );
}
