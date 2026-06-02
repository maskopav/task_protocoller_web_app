// utils/audioUtils.js

export const exportWAV = (audioChunks, sampleRate) => {
    // 1. Flatten the array of Float32Arrays
    let totalLength = 0;
    for (let i = 0; i < audioChunks.length; i++) {
        totalLength += audioChunks[i].length;
    }
    
    const flattenedArray = new Float32Array(totalLength);
    let offset = 0;
    for (let i = 0; i < audioChunks.length; i++) {
        flattenedArray.set(audioChunks[i], offset);
        offset += audioChunks[i].length;
    }

    // 2. Create ArrayBuffer for WAV (44 bytes header + data)
    const buffer = new ArrayBuffer(44 + flattenedArray.length * 2);
    const view = new DataView(buffer);

    // 3. Write WAV Header
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + flattenedArray.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // Raw PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, flattenedArray.length * 2, true);

    // 4. Convert Float32 to 16-bit PCM
    let pcmOffset = 44;
    for (let i = 0; i < flattenedArray.length; i++, pcmOffset += 2) {
        let sample = Math.max(-1, Math.min(1, flattenedArray[i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pcmOffset, sample, true); // little-endian
    }

    return new Blob([view], { type: 'audio/wav' });
};