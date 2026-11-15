type Score = { categoryName: string; score: number };

export function distressSignals(frames: Score[][]) {
  const maximum = (names: string[]) => Math.max(0, ...frames.flat()
    .filter(({ categoryName }) => names.includes(categoryName))
    .map(({ score }) => score));
  return {
    scream: maximum(["Screaming"]),
    benign: maximum(["Laughter", "Giggle", "Baby laughter", "Music", "Cheering", "Applause"]),
  };
}

export function createDistressDetector() {
  let candidates = 0;
  return (signals: ReturnType<typeof distressSignals>) => {
    const { scream, benign } = signals;
    if (scream >= 0.28) return true;
    candidates = scream >= 0.08 && scream >= benign * 0.6 ? candidates + 1 : 0;
    return candidates >= 2;
  };
}

export async function monitorDistress(stream: MediaStream, context: AudioContext, trigger: () => void, onError: () => void, signal: AbortSignal) {
  const worker = new Worker("/jugnu/audio-classifier.js", { type: "module" });
  let input: MediaStreamAudioSourceNode | undefined;
  let worklet: AudioWorkletNode | undefined;
  const stop = () => {
    if (worklet) { worklet.port.onmessage = null; worklet.disconnect(); }
    input?.disconnect();
    worker.terminate();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    await Promise.all([
      context.audioWorklet.addModule("/jugnu/audio-window.js"),
      new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        function ready(error?: Error) {
          signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve();
        }
        worker.onerror = () => ready(new Error("Sound model failed to load"));
        worker.onmessage = ({ data }) => ready(data === "ready" ? undefined : new Error("Sound model unavailable"));
      }),
    ]);
    if (signal.aborted) return;
    input = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, "jugnu-audio-window", { numberOfOutputs: 0 });
    const detect = createDistressDetector();
    let classifying = false;
    worker.onerror = onError;
    worker.onmessage = ({ data }) => {
      classifying = false;
      if (data === "error") { onError(); return; }
      if (!signal.aborted && detect(distressSignals(data))) trigger();
    };
    worklet.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
      if (signal.aborted || classifying) return;
      classifying = true;
      worker.postMessage({ data, sampleRate: context.sampleRate }, [data.buffer]);
    };
    input.connect(worklet);
  } catch (error) {
    if (!signal.aborted) { signal.removeEventListener("abort", stop); stop(); }
    throw error;
  }
}
