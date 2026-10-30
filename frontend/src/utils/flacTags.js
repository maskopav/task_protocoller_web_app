// utils/flacTags.js
//
// Writes Vorbis comments (FLAC's standard tags) into an encoded FLAC byte
// stream. The libflac.js build used here (flacEncoder.js) has no tag API, so
// the metadata block is spliced in directly. A FLAC file is "fLaC", then
// metadata blocks (4-byte header: last-block flag + 7-bit type, 24-bit
// big-endian length), then the audio frames. Only metadata changes: the
// audio frames are copied untouched, and nothing in them refers to byte
// offsets before the first frame.

const STREAMINFO = 0;
const VORBIS_COMMENT = 4;
const MAX_BLOCK_BYTES = 0xffffff;

function readBlocks(bytes) {
    if (bytes.length < 8 || bytes[0] !== 0x66 || bytes[1] !== 0x4c || bytes[2] !== 0x61 || bytes[3] !== 0x43) {
        throw new Error('Not a FLAC stream');
    }
    const blocks = [];
    let i = 4;
    for (;;) {
        if (i + 4 > bytes.length) throw new Error('Truncated FLAC metadata');
        const header = bytes[i];
        const length = (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
        if (i + 4 + length > bytes.length) throw new Error('Truncated FLAC metadata');
        blocks.push({ type: header & 0x7f, body: bytes.subarray(i + 4, i + 4 + length) });
        i += 4 + length;
        if (header & 0x80) return { blocks, audioStart: i };
    }
}

// Vendor string of an existing Vorbis comment block (little-endian length + UTF-8).
function vendorOf(body) {
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    return new TextDecoder().decode(body.subarray(4, 4 + view.getUint32(0, true)));
}

function vorbisCommentBody(vendor, comments) {
    const enc = new TextEncoder();
    const parts = [enc.encode(vendor), ...comments.map((c) => enc.encode(c))];
    const body = new Uint8Array(4 + 4 + parts.reduce((n, p) => n + 4 + p.length, 0));
    const view = new DataView(body.buffer);
    let o = 0;
    const put = (p) => { view.setUint32(o, p.length, true); body.set(p, o + 4); o += 4 + p.length; };
    put(parts[0]);
    view.setUint32(o, comments.length, true); o += 4;
    parts.slice(1).forEach(put);
    return body;
}

/**
 * Returns a copy of `bytes` whose Vorbis comment block holds `comments`
 * ("KEY=value" strings), replacing any existing one (its vendor string is
 * kept). Throws on input that isn't a well-formed FLAC stream.
 */
export function setVorbisComments(bytes, comments) {
    for (const c of comments) {
        if (!/^[\x20-\x3c\x3e-\x7d]+=/.test(c)) throw new Error(`Invalid Vorbis comment: ${c.slice(0, 40)}`);
    }
    const { blocks, audioStart } = readBlocks(bytes);
    if (blocks[0]?.type !== STREAMINFO) throw new Error('FLAC stream does not start with STREAMINFO');

    const existing = blocks.find((b) => b.type === VORBIS_COMMENT);
    const vendor = existing ? vendorOf(existing.body) : 'neuroSHARE';
    const comment = { type: VORBIS_COMMENT, body: vorbisCommentBody(vendor, comments) };
    if (comment.body.length > MAX_BLOCK_BYTES) throw new Error('Vorbis comments too large');

    const out = [blocks[0], comment, ...blocks.slice(1).filter((b) => b.type !== VORBIS_COMMENT)];
    const audio = bytes.subarray(audioStart);
    const result = new Uint8Array(4 + out.reduce((n, b) => n + 4 + b.body.length, 0) + audio.length);
    result.set(bytes.subarray(0, 4), 0);
    let o = 4;
    out.forEach((b, idx) => {
        const len = b.body.length;
        result[o] = (idx === out.length - 1 ? 0x80 : 0) | b.type;
        result[o + 1] = (len >> 16) & 0xff; result[o + 2] = (len >> 8) & 0xff; result[o + 3] = len & 0xff;
        result.set(b.body, o + 4);
        o += 4 + len;
    });
    result.set(audio, o);
    return result;
}

/** All Vorbis comments of a FLAC stream, in order (for tests and checks). */
export function readVorbisComments(bytes) {
    const block = readBlocks(bytes).blocks.find((b) => b.type === VORBIS_COMMENT);
    if (!block) return [];
    const view = new DataView(block.body.buffer, block.body.byteOffset, block.body.byteLength);
    const dec = new TextDecoder();
    let o = 4 + view.getUint32(0, true);
    const count = view.getUint32(o, true); o += 4;
    const comments = [];
    for (let k = 0; k < count; k++) {
        const len = view.getUint32(o, true);
        comments.push(dec.decode(block.body.subarray(o + 4, o + 4 + len)));
        o += 4 + len;
    }
    return comments;
}
