/** Stand-in for @capacitor/filesystem. Files are saved through the browser instead (see native.ts). */
const refused = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} is not available on the web.`);
};

export enum Directory { Documents = "DOCUMENTS", Cache = "CACHE", Data = "DATA" }

export const Filesystem = {
  writeFile: refused("Filesystem.writeFile") as (o: { path: string; data: string; directory: Directory; recursive?: boolean }) => Promise<{ uri: string }>,
  appendFile: refused("Filesystem.appendFile") as (o: { path: string; data: string; directory: Directory }) => Promise<void>,
  checkPermissions: refused("Filesystem.checkPermissions") as () => Promise<{ publicStorage: string }>,
  requestPermissions: refused("Filesystem.requestPermissions") as () => Promise<{ publicStorage: string }>,
};
