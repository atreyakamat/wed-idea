/** A guest as the capture screen needs them. */
export type CaptureGuest = {
  id: string;
  code: string;
  phone: string;
  name: string | null;
  accessToken: string;
  photoCount: number;
  linkSentAt: string | null;
};

export type StartGuestState = {
  error: string | null;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  guest?: CaptureGuest;
  /** True when the number was already a guest at this event. */
  returning?: boolean;
};
