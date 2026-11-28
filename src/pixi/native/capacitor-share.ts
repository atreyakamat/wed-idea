/** Stand-in for @capacitor/share. The web uses the browser's own share sheet (see native.ts). */
export const Share = {
  share: async (_options: { text?: string; title?: string; url?: string; files?: string[]; dialogTitle?: string }): Promise<void> => {
    throw new Error("Share is not available on the web.");
  },
};
