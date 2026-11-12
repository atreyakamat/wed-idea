// The product's name and contact details, in one place so a rename is one
// setting. Set NEXT_PUBLIC_BRAND_NAME, NEXT_PUBLIC_SUPPORT_EMAIL and
// NEXT_PUBLIC_LEGAL_NAME in the environment; the defaults are the working name.

export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Cute Wedding Polaroid";

/** Where customers and guests write to. Null until it's set. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;

/** The business that runs the service, as named in the Terms and Privacy policy. */
export const LEGAL_NAME = process.env.NEXT_PUBLIC_LEGAL_NAME?.trim() || BRAND_NAME;

export const BRAND_TAGLINE = "Edited event photos in your guests' hands within the hour.";
