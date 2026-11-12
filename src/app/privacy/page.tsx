import type { Metadata } from "next";
import Link from "next/link";
import { Contact, LegalPage } from "@/components/site/legal-page";
import { BRAND_NAME, LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy policy", description: `How ${BRAND_NAME} handles studios', guests' and visitors' personal data.` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="12 November 2026">
      <p>
        {BRAND_NAME} is run by {LEGAL_NAME} (&ldquo;we&rdquo;). Photographers and studios use it to deliver event photos to
        their clients and guests. This policy explains what personal data we handle, why, and the choices you have. It is
        written to meet India&apos;s Digital Personal Data Protection Act, 2023 (the DPDP Act).
      </p>

      <h2>Who decides what</h2>
      <ul>
        <li>
          <strong>Studio accounts.</strong> For the people who sign up and their team, we decide how account data is used.
        </li>
        <li>
          <strong>Photos, guests and gallery visitors.</strong> The studio that ran the shoot decides what to collect and
          why, and we process it on the studio&apos;s behalf to deliver the photos. If you were photographed at an event,
          the studio is your first point of contact; we will help them answer you.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Studio accounts:</strong> email address, password (stored only as a secure hash), studio name and logo,
          team members, plan and payment records, and support messages.
        </li>
        <li>
          <strong>Photos:</strong> web-size copies (up to 2400 pixels) and thumbnails, and an auto-edited version when the
          studio uses editing. Location and camera data are removed before upload. The original full-size files stay on the
          photographer&apos;s own computer.
        </li>
        <li>
          <strong>Guests at a live polaroid corner:</strong> the WhatsApp number (and name, if given) the studio&apos;s
          operator enters so each guest gets their own photos.
        </li>
        <li>
          <strong>Gallery visitors:</strong> no account is needed. To remember your ❤ favourites, your browser keeps a random
          id; we store which photos that id loved, not who you are. Like any website we also process technical data such as
          your IP address and browser type, for security and to prevent abuse.
        </li>
        <li>
          <strong>Website analytics</strong>, if turned on: counted without cookies and without recording private gallery
          addresses.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To deliver photos to the people they were taken for, and to run studio accounts.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
        <li>To bill studios and keep the records the law requires.</li>
        <li>To answer questions and send account emails (sign-up, password resets).</li>
      </ul>
      <p>We do not sell personal data, show advertising, or use photos to train AI models for anyone else.</p>

      <h2>Who else handles it</h2>
      <p>
        We use trusted providers to run the service: our database and file storage provider, our hosting provider, our email
        provider for account emails, and, when online payments start, our payment provider. They process data only on our
        instructions. Their servers may be outside India.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Gallery photos</strong> are deleted within 30 days after the gallery closes (the closing date is shown on
          every gallery). Studios can delete photos or whole shoots earlier.
        </li>
        <li>
          <strong>Favourites</strong> are deleted with the photos.
        </li>
        <li>
          <strong>Studio account data</strong> is kept while the account is open and deleted within 90 days after it is
          closed, except records we must keep by law (such as invoices).
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>Under the DPDP Act you can:</p>
      <ul>
        <li>ask what personal data is held about you and how it is used;</li>
        <li>ask for it to be corrected, completed or erased (for example, a photo of you removed from a gallery);</li>
        <li>withdraw consent you gave, for the future;</li>
        <li>nominate someone to act for you; and</li>
        <li>raise a grievance with us, and if you are not satisfied, with the Data Protection Board of India.</li>
      </ul>
      <p>
        For a photo or gallery, write to the studio that shared it, or to us at <Contact email={SUPPORT_EMAIL} /> and we will
        pass it on and make sure it is handled. We reply as quickly as we can and within the time the law requires.
      </p>

      <h2>Children</h2>
      <p>
        Event photos can include children. Studios are responsible for having the consent of a parent or guardian where the
        law requires it. Studio accounts are for adults only.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Galleries open only with their private link and are hidden from search engines.
        Access inside a studio is limited by role, and our own admin access requires two-step sign-in.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If we change this policy we will update the date above and tell studios by email about important changes. Questions
        or grievances: <Contact email={SUPPORT_EMAIL} />. See also our <Link href="/terms" className="underline underline-offset-4">Terms</Link>.
      </p>
    </LegalPage>
  );
}
