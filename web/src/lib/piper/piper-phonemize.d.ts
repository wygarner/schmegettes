// piper_phonemize is an Emscripten build (espeak-ng + piper-phonemize) without types.
declare module "@diffusionstudio/piper-wasm/build/piper_phonemize.js" {
  const createPiperPhonemize: (options: Record<string, unknown>) => Promise<unknown>;
  export default createPiperPhonemize;
}
