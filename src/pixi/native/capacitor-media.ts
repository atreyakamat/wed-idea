/** Stand-in for @capacitor-community/media. Photo albums exist only on the phone app. */
const refused = (name: string) => async (): Promise<never> => {
  throw new Error(`Media.${name} is not available on the web.`);
};

export const Media = {
  getAlbums: refused("getAlbums") as () => Promise<{ albums: { name: string; identifier: string }[] }>,
  createAlbum: refused("createAlbum") as (o: { name: string }) => Promise<void>,
  getAlbumsPath: refused("getAlbumsPath") as () => Promise<{ path: string }>,
  savePhoto: refused("savePhoto") as (o: { path: string; albumIdentifier?: string; fileName: string }) => Promise<unknown>,
  saveVideo: refused("saveVideo") as (o: { path: string; albumIdentifier?: string; fileName: string }) => Promise<unknown>,
};
