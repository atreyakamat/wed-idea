// Project gallery links and the message that carries them.

export const PROJECT_TOKEN_PATTERN = /^[0-9a-f]{48}$/;

export function projectGalleryUrl(siteUrl: string, accessToken: string): string {
  let base = siteUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/p/${accessToken}`;
}

const expiryFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

export function projectShareMessage({ projectName, studioName, url, expiresAt }: { projectName: string; studioName: string; url: string; expiresAt: string }): string {
  return [
    `Your photos from ${projectName} are ready 📸`,
    "",
    url,
    "",
    `From ${studioName}. They'll be here until ${expiryFormat.format(new Date(expiresAt))}, so save your favourites.`,
  ].join("\n");
}

/** WhatsApp share link with no number: the sender picks the chat or group. */
export function whatsappShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
