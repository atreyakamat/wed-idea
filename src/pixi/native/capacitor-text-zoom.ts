/** Stand-in for @capacitor/text-zoom. The browser already follows the person's text size. */
export const TextZoom = {
  getPreferred: async (): Promise<{ value: number }> => ({ value: 1 }),
  set: async (_options: { value: number }): Promise<void> => undefined,
};
