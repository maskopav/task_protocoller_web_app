import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { encodeFlac } from './flacEncoder';
import { setVorbisComments, readVorbisComments } from './flacTags';

// Real libFLAC output, loaded the Node way (see flacEncoder.test.js).
const require = createRequire(import.meta.url);
let flac;

beforeAll(async () => {
  const Flac = require('libflacjs')('min');
  flac = await new Promise((resolve) => { Flac.onready = () => resolve(Flac); });
}, 20000);

function decode(bytes) {
  const { Decoder } = require('libflacjs/lib/decoder');
  const decoder = new Decoder(flac, {});
  decoder.decode(bytes);
  const [channel] = decoder.getSamples();
  decoder.destroy();
  return new Int16Array(channel.buffer, channel.byteOffset, channel.byteLength / 2);
}

function noise(n) {
  const out = new Int16Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out[i] = (x % 20000) - 10000; }
  return out;
}

// Metadata blocks as [type, isLast] pairs.
function blockLayout(bytes) {
  const layout = [];
  let i = 4;
  for (;;) {
    const len = (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
    layout.push([bytes[i] & 0x7f, !!(bytes[i] & 0x80)]);
    if (bytes[i] & 0x80) return layout;
    i += 4 + len;
  }
}

describe('setVorbisComments', () => {
  const comments = ['NEUROSHARE_TIMING=audio-timing-v1', 'SEGMENT={"startSample":0,"endSample":4800}', 'SEGMENT={"startSample":4800,"endSample":9600}'];

  it('writes the comments and leaves the audio bit-exact', () => {
    const pcm = noise(9600);
    const tagged = setVorbisComments(encodeFlac(flac, pcm, 48000), comments);

    expect(readVorbisComments(tagged)).toEqual(comments);
    expect(Array.from(decode(tagged))).toEqual(Array.from(pcm));
  });

  it('replaces libFLAC\'s empty comment block instead of adding a second one', () => {
    const plain = encodeFlac(flac, noise(4800), 48000);
    expect(blockLayout(plain)).toEqual([[0, false], [4, true]]);
    const tagged = setVorbisComments(plain, comments);
    expect(blockLayout(tagged)).toEqual([[0, false], [4, true]]);
    // Tagging again replaces, not appends.
    expect(readVorbisComments(setVorbisComments(tagged, ['A=1']))).toEqual(['A=1']);
  });

  it('keeps non-ASCII values intact (UTF-8)', () => {
    const tagged = setVorbisComments(encodeFlac(flac, noise(480), 48000), ['NOTE=pohádka čeština']);
    expect(readVorbisComments(tagged)).toEqual(['NOTE=pohádka čeština']);
  });

  it('rejects invalid input instead of writing a broken file', () => {
    const plain = encodeFlac(flac, noise(480), 48000);
    expect(() => setVorbisComments(plain, ['no equals sign'])).toThrow(/Invalid Vorbis comment/);
    expect(() => setVorbisComments(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), ['A=1'])).toThrow(/Not a FLAC/);
    expect(() => setVorbisComments(plain.subarray(0, 20), ['A=1'])).toThrow(/Truncated/);
  });
});
