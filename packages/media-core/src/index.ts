export interface AudioLevel {
  rms: number;
  peak: number;
}

export interface AudioLevelEnvelopeOptions {
  attack: number;
  release: number;
  silenceThreshold: number;
}

export interface LipSyncEnvelopeOptions extends AudioLevelEnvelopeOptions {
  gain: number;
}

export interface VoiceActivityDetectorOptions {
  startThreshold: number;
  stopThreshold: number;
  holdFrames: number;
}

export interface VoiceActivityState {
  active: boolean;
  changed: boolean;
}

export function analyzePcmLevel(samples: ArrayLike<number>): AudioLevel {
  if (samples.length === 0) {
    return { rms: 0, peak: 0 };
  }
  let sumSquares = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const value = Math.abs(sample);
    sumSquares += sample * sample;
    peak = Math.max(peak, value);
  }
  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak
  };
}

export class AudioLevelEnvelope {
  private value = 0;

  constructor(private readonly options: AudioLevelEnvelopeOptions) {}

  next(input: number): number {
    const target = input < this.options.silenceThreshold ? 0 : clamp01(input);
    const coefficient = target > this.value ? this.options.attack : this.options.release;
    this.value += (target - this.value) * coefficient;
    return clamp01(this.value);
  }

  reset(): void {
    this.value = 0;
  }
}

export class LipSyncEnvelope {
  private readonly envelope: AudioLevelEnvelope;

  constructor(private readonly options: LipSyncEnvelopeOptions) {
    this.envelope = new AudioLevelEnvelope(options);
  }

  next(level: AudioLevel): number {
    return this.envelope.next(level.rms * this.options.gain);
  }

  reset(): void {
    this.envelope.reset();
  }
}

export class VoiceActivityDetector {
  private active = false;
  private belowThresholdFrames = 0;

  constructor(private readonly options: VoiceActivityDetectorOptions) {}

  next(level: number): VoiceActivityState {
    const wasActive = this.active;
    if (!this.active && level >= this.options.startThreshold) {
      this.active = true;
      this.belowThresholdFrames = 0;
    } else if (this.active && level < this.options.stopThreshold) {
      this.belowThresholdFrames += 1;
      if (this.belowThresholdFrames >= this.options.holdFrames) {
        this.active = false;
      }
    } else if (this.active) {
      this.belowThresholdFrames = 0;
    }
    return { active: this.active, changed: wasActive !== this.active };
  }
}

export class AudioLevelAnalyzer {
  private readonly analyser: AnalyserNode;
  private readonly buffer: Float32Array<ArrayBuffer>;

  constructor(audioContext: AudioContext, source: AudioNode, fftSize = 1024) {
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.buffer = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);
  }

  read(): AudioLevel {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return analyzePcmLevel(this.buffer);
  }

  disconnect(): void {
    this.analyser.disconnect();
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
