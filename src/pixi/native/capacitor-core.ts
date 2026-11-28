/**
 * Stand-in for @capacitor/core. Wedding Pola is a website, never a native shell, so the
 * platform is always "web" and every native call is refused. Ported Pixi code keeps its web
 * path, which is the only path this site runs.
 */
export const Capacitor = {
  isNativePlatform: (): boolean => false,
  getPlatform: (): string => "web",
};

const refused = (plugin: string) => () => Promise.reject(new Error(`${plugin} is not available on the web.`));

/** A plugin proxy whose every method refuses. Only reached if a native check were skipped. */
export function registerPlugin<T>(plugin: string): T {
  return new Proxy({}, { get: () => refused(plugin) }) as T;
}
