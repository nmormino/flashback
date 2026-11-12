declare module 'wawoff2' {
  export function decompress(buffer: Uint8Array): Promise<Uint8Array>;
  export function compress(buffer: Uint8Array): Promise<Uint8Array>;
  const wawoff2: {
    decompress: (buffer: Uint8Array) => Promise<Uint8Array>;
    compress: (buffer: Uint8Array) => Promise<Uint8Array>;
  };
  export default wawoff2;
}
