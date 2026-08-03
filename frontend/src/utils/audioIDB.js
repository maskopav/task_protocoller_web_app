// utils/audioIDB.js
// Stores batched Int16 PCM chunks in IndexedDB and assembles a WAV Blob on demand.

const DB_NAME = 'audio_recorder';
const DB_VERSION = 1;
const STORE = 'chunks';
const META_KEY = '__meta';

let dbPromise = null;
let idbAvailable = null;
let memoryChunks = [];
let memoryTotalSamples = 0;

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    return dbPromise;
}

function runTransaction(mode, executor) {
    return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;

        try {
            result = executor(store);
        } catch (err) {
            reject(err);
            return;
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    }));
}

function getReq(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function initSession() {
    if (idbAvailable === false) {
        memoryChunks = [];
        memoryTotalSamples = 0;
        return;
    }
    try {
        await runTransaction('readwrite', (store) => {
            store.clear();
            store.put({ totalSamples: 0, seq: 0 }, META_KEY);
        });
        idbAvailable = true;
    } catch (err) {
        // Covers both indexedDB.open() failing outright (disabled) and the
        // write itself failing (near-zero quota) — either way IndexedDB
        // isn't usable this session, so drop to the in-memory path instead
        // of leaving the caller with a rejected initSession() and a
        // recording that can never be saved.
        idbAvailable = false;
        memoryChunks = [];
        memoryTotalSamples = 0;
    }
}

export function appendChunk(int16Buffer) {
    // ── FALLBACK PATH ──
    if (idbAvailable === false) {
        memoryChunks.push(int16Buffer);
        memoryTotalSamples += (int16Buffer.byteLength >> 1);
        return Promise.resolve(); // Keep signature asynchronous
    }

    // ── INDEXEDDB PATH ──
    return runTransaction('readwrite', async (store) => {
        const meta = (await getReq(store.get(META_KEY))) || { totalSamples: 0, seq: 0 };
        const seq = meta.seq + 1;

        store.put(int16Buffer, seq);
        store.put({
            totalSamples: meta.totalSamples + (int16Buffer.byteLength >> 1),
            seq,
        }, META_KEY);
    });
}

function generateWAVHeader(sampleRate, totalSamples) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const write = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    write(0, 'RIFF');
    view.setUint32(4, 36 + totalSamples * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, totalSamples * 2, true);

    return header;
}

export function buildWAV(sampleRate) {
    // ── FALLBACK PATH ──
    if (idbAvailable === false) {
        if (memoryTotalSamples === 0) {
            return Promise.resolve(new Blob([], { type: 'audio/wav' }));
        }
        const header = generateWAVHeader(sampleRate, memoryTotalSamples);
        const parts = [header, ...memoryChunks];
        return Promise.resolve(new Blob(parts, { type: 'audio/wav' }));
    }

    // ── INDEXEDDB PATH ──
    return runTransaction('readonly', async (store) => {
        const meta = await getReq(store.get(META_KEY));
        if (!meta || meta.seq === 0) {
            return new Blob([], { type: 'audio/wav' });
        }

        const { totalSamples, seq } = meta;
        const header = generateWAVHeader(sampleRate, totalSamples);
        
        const chunks = await getReq(store.getAll(IDBKeyRange.bound(1, seq)));
        const parts = [header, ...chunks];

        return new Blob(parts, { type: 'audio/wav' });
    });
}

export function clearSession() {
    // ── FALLBACK PATH ──
    if (idbAvailable === false) {
        memoryChunks = [];
        memoryTotalSamples = 0;
        return Promise.resolve();
    }

    // ── INDEXEDDB PATH ──
    return runTransaction('readwrite', (store) => {
        store.clear();
    });
}