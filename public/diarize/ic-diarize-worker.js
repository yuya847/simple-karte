// IC を声で記録, 声での分離 — a Web Worker that tells speakers apart by the voice inside this browser.
// It runs sherpa-onnx's speaker diarization built for WebAssembly (Apache-2.0; pyannote segmentation 3.0 +
// 3D-Speaker ERes2Net speaker embedding, packed in the .data file; see README.md here). The voice never
// leaves the device: the window hands this worker 16 kHz samples and gets back stretches of time with a
// speaker number. The model (about 58 MB) is fetched only when the worker is made, i.e. when the person
// turns 声でも分ける on, and the browser keeps it in its cache.
//
// In:  { id, samples: Float32Array }            (16 kHz, mono)
// Out: { type: "progress", loaded, total }      (while the model downloads)
//      { type: "ready", sampleRate }
//      { type: "result", id, segments: [{ start, end, speaker }] }   (seconds; speaker 0, 1, …)
//      { type: "error", id?, message }

const base = new URL(".", self.location.href).href;
let sd = null;

const CONFIG = {
  // The 10-second window moves by a quarter (0.1 in the sample): about twice as fast, the same speakers in tests.
  segmentation: { pyannote: { model: "./segmentation.onnx", windowShiftRatio: 0.25 }, numThreads: 1, debug: 0 },
  embedding: { model: "./embedding.onnx", numThreads: 1, debug: 0 },
  // The number of speakers is not known: clusters are cut by this threshold (larger = fewer speakers).
  clustering: { numClusters: -1, threshold: 0.5 },
  minDurationOn: 0.3,
  minDurationOff: 0.5,
};

self.Module = {
  locateFile: (path) => base + path,
  setStatus: (s) => {
    const m = /\((\d+)\/(\d+)\)/.exec(String(s));
    if (m) self.postMessage({ type: "progress", loaded: Number(m[1]), total: Number(m[2]) });
  },
  print: () => {},
  printErr: () => {},
  onRuntimeInitialized: () => {
    try {
      // createOfflineSpeakerDiarization comes from sherpa-onnx-speaker-diarization.js.
      sd = createOfflineSpeakerDiarization(self.Module, CONFIG);
      self.postMessage({ type: "ready", sampleRate: sd.sampleRate });
    } catch (e) {
      self.postMessage({ type: "error", message: String(e) });
    }
  },
};

self.onmessage = (e) => {
  const { id, samples } = e.data || {};
  if (!sd) {
    self.postMessage({ type: "error", id, message: "not ready" });
    return;
  }
  try {
    const segments = (samples && samples.length ? sd.process(samples) : null) || [];
    self.postMessage({ type: "result", id, segments: segments.map((s) => ({ start: s.start, end: s.end, speaker: s.speaker })) });
  } catch (err) {
    self.postMessage({ type: "error", id, message: String(err) });
  }
};

try {
  importScripts(base + "sherpa-onnx-speaker-diarization.js", base + "sherpa-onnx-wasm-main-speaker-diarization.js");
} catch (e) {
  self.postMessage({ type: "error", message: String(e) });
}
