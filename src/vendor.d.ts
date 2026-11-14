declare module 'utif' {
  const UTIF: {
    decode(data: ArrayBuffer): Array<{ width: number; height: number }>;
    decodeImage(data: ArrayBuffer, ifd: unknown): void;
    toRGBA8(ifd: unknown): Uint8Array;
  };
  export default UTIF;
}
