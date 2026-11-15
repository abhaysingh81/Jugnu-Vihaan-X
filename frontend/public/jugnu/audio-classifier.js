import { AudioClassifier, FilesetResolver } from "/api/audio-runtime/audio_bundle.mjs";

try {
  const fileset = await FilesetResolver.forAudioTasks("/api/audio-runtime", true);
  const classifier = await AudioClassifier.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/jugnu/yamnet.tflite" },
    categoryAllowlist: ["Screaming", "Laughter", "Giggle", "Baby laughter", "Music", "Cheering", "Applause"],
  });
  self.onmessage = ({ data: { data, sampleRate } }) => {
    try {
      const results = classifier.classify(data, sampleRate);
      self.postMessage(results.flatMap(result => result.classifications.map(group => group.categories)));
    } catch {
      self.postMessage("error");
    }
  };
  self.postMessage("ready");
} catch (error) {
  console.error("Jugnu sound model failed to initialize", error);
  self.postMessage("error");
}
