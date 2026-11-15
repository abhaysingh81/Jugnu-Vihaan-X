class JugnuAudioWindow extends AudioWorkletProcessor {
  constructor() {
    super();
    this.window = new Float32Array(Math.ceil(sampleRate * 0.98));
    this.hop = Math.floor(this.window.length / 2);
    this.offset = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    let index = 0;
    while (index < samples.length) {
      const count = Math.min(this.window.length - this.offset, samples.length - index);
      this.window.set(samples.subarray(index, index + count), this.offset);
      this.offset += count;
      index += count;
      if (this.offset === this.window.length) {
        const frame = this.window.slice();
        this.port.postMessage(frame, [frame.buffer]);
        this.window.copyWithin(0, this.hop);
        this.offset -= this.hop;
      }
    }
    return true;
  }
}

registerProcessor("jugnu-audio-window", JugnuAudioWindow);
