// Guest gallery links and the WhatsApp message that carries them.

export const GUEST_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function galleryUrl(siteUrl: string, accessToken: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/g/${accessToken}`;
}

const expiryFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

export function whatsappMessage({
  guestName,
  coupleNames,
  url,
  expiresAt,
}: {
  guestName: string | null;
  coupleNames: string;
  url: string;
  expiresAt: string;
}): string {
  const greeting = guestName?.trim() ? `Hi ${guestName.trim().split(/\s+/)[0]}!` : "Hi!";
  return [
    `${greeting} Your polaroids from ${coupleNames}'s wedding are ready 📸`,
    "",
    url,
    "",
    `They'll be here until ${expiryFormat.format(new Date(expiresAt))}, so save your favourites.`,
  ].join("\n");
}

/** Click-to-chat link that opens WhatsApp with the message ready to send. */
export function whatsappLink(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** "+919812345678" -> "+91 98123 45678" for display. */
export function formatPhone(phoneE164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phoneE164);
  return m ? `+91 ${m[1]} ${m[2]}` : phoneE164;
}
