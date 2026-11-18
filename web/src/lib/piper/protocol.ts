// Messages between the narrator (main thread) and the Piper worker.

/** The parts of a Piper voice config (`.onnx.json`) the worker reads. */
export interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  num_speakers?: number;
}

export type ToWorker =
  | { type: "load"; id: number; model: ArrayBuffer; config: PiperConfig }
  | { type: "synthesize"; id: number; text: string };

export type FromWorker =
  | { type: "loaded"; id: number }
  | { type: "audio"; id: number; samples: Float32Array; sampleRate: number }
  | { type: "error"; id: number; message: string };
