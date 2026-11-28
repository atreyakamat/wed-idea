/** Stand-in for @capacitor/haptics. Haptics are only called on native, so on the web these do nothing. */
export enum ImpactStyle { Heavy = "HEAVY", Medium = "MEDIUM", Light = "LIGHT" }
export enum NotificationType { Success = "SUCCESS", Warning = "WARNING", Error = "ERROR" }

export const Haptics = {
  impact: async (_options?: { style?: ImpactStyle }): Promise<void> => undefined,
  notification: async (_options?: { type?: NotificationType }): Promise<void> => undefined,
};
