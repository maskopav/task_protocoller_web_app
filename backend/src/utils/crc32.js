// backend/src/utils/crc32.js
// Standard CRC-32 (zlib/PKZIP polynomial 0xEDB88320), computed
// incrementally over one or more chunks -- used by zipStreamWriter.js so
// zip entries can be built without any external dependency.
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

// `state` carries the running checksum between chunks -- start with
// INITIAL_CRC_STATE, feed every chunk through crc32Update in order, then
// pass the final state through crc32Finish to get the real CRC-32.
export const INITIAL_CRC_STATE = 0xffffffff;

export function crc32Update(buffer, state = INITIAL_CRC_STATE) {
  let c = state;
  for (let i = 0; i < buffer.length; i++) {
    c = TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return c >>> 0;
}

export function crc32Finish(state) {
  return (state ^ 0xffffffff) >>> 0;
}
