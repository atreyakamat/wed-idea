/** Stand-in for @capacitor/app. Back button and app-state events come from the phone only. */
export const App = {
  addListener: async (_event: string, _listener: (state: { isActive: boolean }) => void): Promise<{ remove: () => Promise<void> }> => ({ remove: async () => undefined }),
  minimizeApp: async (): Promise<void> => undefined,
};
