// utils/audioLevels.js
//
// Signal levels of a finished recording, logged with every take (see
// useVoiceRecorder.js's "recording_finalized") so recordings can be screened
// before acoustic analysis: clipped, too quiet, too noisy, or with a noise
// floor too close to the 16-bit quantization noise.
//
// Method: split the recording into short frames, measure each frame's rms
// (with its DC offset removed), then take the quietest frames as the
// background noise and the loudest frames as the speech level.
//
// Units: dBFS = dB relative to full-scale amplitude (32768 LSB), so a sample
// at full scale is 0 dBFS and everything quieter is negative. (The AES17
// convention references a full-scale sine instead; add 3.01 dB to rms values
// to convert.) LSB (least significant bit) = one 16-bit quantization step.
//
// Reading noiseFloorLsb: rounding to 16 bits adds 1/sqrt(12) ~= 0.29 LSB rms
// of noise. A noise floor of ~3 LSB or more (20 dB above that) means
// quantization is negligible; ~1 LSB or less means it is a real part of the
// noise floor.

const FULL_SCALE = 32768;       // =2^16/2 largest Int16 magnitude (-32768) = 0 dBFS
const FRAME_SEC = 0.05;         // 50 ms frames: long enough for a stable rms, short enough to fit inside pauses
const NOISE_PERCENTILE = 0.1;   // quietest 10% of frames = background noise
const SPEECH_PERCENTILE = 0.9;  // loudest 10% of frames = speech level

const round = (x, decimals) => Math.round(x * 10 ** decimals) / 10 ** decimals;
const toDbfs = (amplitude) => (amplitude > 0 ? round(20 * Math.log10(amplitude / FULL_SCALE), 1) : null);
const percentile = (sorted, p) => sorted[Math.floor(p * (sorted.length - 1))];

// rms around the frame's mean: removes DC offset, which would otherwise count as noise.
const acRms = (sum, sumSq, n) => Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2));

/**
 * @param {Int16Array} samples - mono PCM of the whole recording
 * @param {number} sampleRate
 * @returns {{ peakDbfs, fullScaleSamples, speechLevelDbfs, noiseFloorDbfs, noiseFloorLsb, snrDb }}
 *
 * The noise floor needs pauses: a recording with phonation from the first
 * sample has no background-only frames, so its noise floor errs high (and
 * its SNR low) -- the safe direction for screening.
 */
export function measureLevels(samples, sampleRate) {
    if (!samples?.length) {
        return { peakDbfs: null, fullScaleSamples: 0, speechLevelDbfs: null, noiseFloorDbfs: null, noiseFloorLsb: null, snrDb: null };
    }

    // A recording shorter than one frame is measured as a single frame.
    const frameLen = Math.min(samples.length, Math.max(1, Math.round(sampleRate * FRAME_SEC)));
    const frameRms = [];
    let peak = 0, fullScaleSamples = 0;
    let sum = 0, sumSq = 0, count = 0;

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        peak = Math.max(peak, Math.abs(s));
        if (s === 32767 || s === -32768) fullScaleSamples++;

        sum += s;
        sumSq += s * s;
        if (++count === frameLen) {  // a trailing partial frame is dropped
            frameRms.push(acRms(sum, sumSq, frameLen));
            sum = sumSq = count = 0;
        }
    }

    frameRms.sort((a, b) => a - b);
    const noise = percentile(frameRms, NOISE_PERCENTILE);
    const speech = percentile(frameRms, SPEECH_PERCENTILE);

    return {
        peakDbfs: toDbfs(peak),
        fullScaleSamples,
        speechLevelDbfs: toDbfs(speech),
        noiseFloorDbfs: toDbfs(noise),
        noiseFloorLsb: round(noise, 2),
        snrDb: noise > 0 && speech > 0 ? round(20 * Math.log10(speech / noise), 1) : null,
    };
}
