// src/utils/audioAnalysis.js
import { logToServer } from "./frontendLogger";

const FALLBACK_DURATION_MS = 5000;

/**
 * Main entry point for SNR calculation
 */
export async function calculateSNR(audioUrl, speechSegments, recordingStartTime, fallbackDurationMs = FALLBACK_DURATION_MS) {
  try {
    // 1. Fetch and decode the audio
    const audioBuffer = await fetchAndDecodeAudio(audioUrl);
    if (audioBuffer.error) return audioBuffer; // Return early if file is completely empty

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // 2. Check for dead mic (hardware mute)
    const maxAmplitude = getMaxAmplitude(channelData);
    if (maxAmplitude < 0.001) {
      logToServer("Audio is completely silent (Max Amplitude:", maxAmplitude, ")");
      return { snr: 0, error: 'muted', debugData: { maxAmplitude } };
    }

    // 3. Determine if we use VAD segments or the manual fallback (based on instructions)
    const { activeSegments, usedFallback } = determineSpeechSegments(speechSegments, recordingStartTime, fallbackDurationMs);

    // 4. Convert time segments into audio array indices
    const speechIndices = convertSegmentsToIndices(activeSegments, recordingStartTime, sampleRate);

    // 5. Run the actual math
    const metrics = computeSNRMetrics(channelData, speechIndices);

    // 6. Compile debug data
    const debugData = {
      sampleRate,
      totalDurationSec: channelData.length / sampleRate,
      maxAmplitude,
      speechSegmentsExtracted: speechSegments ? speechSegments.length : 0,
      usedFallback,
      speechIndices,
      ...metrics
    };

    // 7. Handle final math errors (e.g., pure silence during "noise" phase)
    if (metrics.error) {
        return { snr: metrics.snr || 0, error: metrics.error, debugData };
    }

    const snrDb = 20 * Math.log10(metrics.signalRms / metrics.noiseRms);
    return { snr: snrDb, error: null, debugData };

  } catch (error) {
    logToServer("Error analyzing audio SNR:", error);
    if (error.name === 'EncodingError' || String(error).includes('decode')) {
       return { snr: 0, error: 'muted', debugData: null };
    }
    return { snr: 0, error: 'processing-error', debugData: null };
  }
}

// --- HELPER FUNCTIONS ---

async function fetchAndDecodeAudio(audioUrl) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    if (arrayBuffer.byteLength < 500) {
       logToServer("Audio file is empty. Likely hardware mute or OS-level block.");
       return { error: 'muted', snr: 0, debugData: { byteLength: arrayBuffer.byteLength } };
    }
    return await audioCtx.decodeAudioData(arrayBuffer);
}

function getMaxAmplitude(channelData) {
    let max = 0;
    for (let i = 0; i < channelData.length; i++) {
        const absValue = Math.abs(channelData[i]);
        if (absValue > max) max = absValue;
    }
    return max;
}

function determineSpeechSegments(speechSegments, recordingStartTime, fallbackDurationMs) {
    if (!speechSegments || speechSegments.length === 0) {
        logToServer("VAD missed speech or failed. Applying manual fallback rule.");
        return {
            usedFallback: true,
            activeSegments: [{
                startTime: recordingStartTime,
                endTime: recordingStartTime + fallbackDurationMs
            }]
        };
    }
    return { usedFallback: false, activeSegments: speechSegments };
}

function convertSegmentsToIndices(segments, recordingStartTime, sampleRate) {
    return segments.map(seg => {
        const startMs = Math.max(0, seg.startTime - recordingStartTime);
        const endMs = Math.max(0, seg.endTime - recordingStartTime);
        return {
            startIdx: Math.floor((startMs / 1000) * sampleRate),
            endIdx: Math.floor((endMs / 1000) * sampleRate),
            startSec: (startMs / 1000).toFixed(2),
            endSec: (endMs / 1000).toFixed(2)
        };
    });
}

function computeSNRMetrics(channelData, speechIndices) {
    let signalSum = 0; let signalCount = 0;
    let noiseSum = 0; let noiseCount = 0;

    for (let i = 0; i < channelData.length; i++) {
        const isSpeech = speechIndices.some(range => i >= range.startIdx && i <= range.endIdx);
        const power = channelData[i] * channelData[i];

        if (isSpeech) {
            signalSum += power;
            signalCount++;
        } else {
            noiseSum += power;
            noiseCount++;
        }
    }

    if (noiseCount === 0 || noiseSum === 0) return { error: 'no-noise', snr: 100 }; 
    if (signalCount === 0) return { error: 'no-speech', snr: 0 };

    return {
        signalSum, signalCount,
        noiseSum, noiseCount,
        signalRms: Math.sqrt(signalSum / signalCount),
        noiseRms: Math.sqrt(noiseSum / noiseCount)
    };
}