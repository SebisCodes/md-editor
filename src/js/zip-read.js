/**
 * Reading a ZIP file: its entries from the central directory and their content, stored or
 * deflated. A ZIP is refused when it is larger than 100 MB, holds more than 2000 files or
 * unpacks to more than 100 MB in all: a small ZIP can unpack to gigabytes and stop the tab.
 */

const MEGABYTE = 1024 * 1024;
/** The largest ZIP that is read, and the most it may unpack to in all, in bytes. */
const MAX_ZIP_SIZE = 100 * MEGABYTE;
const MAX_UNPACKED_SIZE = 100 * MEGABYTE;
const MAX_ENTRIES = 2000;
/** The signature of the end of the central directory. */
const END_SIGNATURE = 0x06054b50;
/** The size of the end record without its comment, and the longest comment. */
const END_RECORD_SIZE = 22;
const MAX_COMMENT_SIZE = 65535;
/** The size of a central directory entry and of a local header without their names and fields. */
const CENTRAL_ENTRY_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const STORED = 0;
/** Fields of the end record: the number of entries and where the central directory starts. */
const END_ENTRY_COUNT = 10;
const END_DIRECTORY_OFFSET = 16;
/** Fields of a central directory entry. */
const ENTRY_METHOD = 10;
const ENTRY_PACKED_SIZE = 20;
const ENTRY_NAME_LENGTH = 28;
const ENTRY_EXTRA_LENGTH = 30;
const ENTRY_COMMENT_LENGTH = 32;
const ENTRY_LOCAL_OFFSET = 42;
/** Fields of a local header: the lengths of its name and extra field. */
const LOCAL_NAME_LENGTH = 26;
const LOCAL_EXTRA_LENGTH = 28;

/**
 * An entry of a ZIP file.
 * @typedef {object} ZipEntry
 * @property {string} name - its path in the ZIP.
 * @property {number} method - 0 stored, 8 deflated.
 * @property {Uint8Array} data - its packed content.
 */

/**
 * Returns the entries of a ZIP file.
 * @param {Blob} file - the ZIP file.
 * @returns {Promise<ZipEntry[]>} the entries in the order of the central directory.
 * @throws {Error} with the reason, written to follow "could not be opened:", when the file is
 *   too large, no ZIP or holds too many files.
 */
export async function readZipEntries(file) {
    if (file.size > MAX_ZIP_SIZE) throw new Error('it is larger than 100 MB');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const end = findEndRecord(bytes, view);
    if (end < 0) throw new Error('it is not a ZIP file');
    const count = view.getUint16(end + END_ENTRY_COUNT, true);
    if (count > MAX_ENTRIES) throw new Error('it holds more than 2000 files');
    let position = view.getUint32(end + END_DIRECTORY_OFFSET, true);
    const entries = [];
    for (let k = 0; k < count; k++) {
        const method = view.getUint16(position + ENTRY_METHOD, true), packedSize = view.getUint32(position + ENTRY_PACKED_SIZE, true);
        const nameLength = view.getUint16(position + ENTRY_NAME_LENGTH, true), extraLength = view.getUint16(position + ENTRY_EXTRA_LENGTH, true);
        const commentLength = view.getUint16(position + ENTRY_COMMENT_LENGTH, true), offset = view.getUint32(position + ENTRY_LOCAL_OFFSET, true);
        const name = new TextDecoder().decode(bytes.subarray(position + CENTRAL_ENTRY_SIZE, position + CENTRAL_ENTRY_SIZE + nameLength));
        const start = offset + LOCAL_HEADER_SIZE + view.getUint16(offset + LOCAL_NAME_LENGTH, true) + view.getUint16(offset + LOCAL_EXTRA_LENGTH, true);
        entries.push({ name, method, data: bytes.subarray(start, start + packedSize) });
        position += CENTRAL_ENTRY_SIZE + nameLength + extraLength + commentLength;
    }
    return entries;
}

/**
 * Returns where the end of the central directory starts, looked for from the end of the file.
 * @param {Uint8Array} bytes - the file's bytes.
 * @param {DataView} view - a view of them.
 * @returns {number} the offset, -1 when there is none.
 */
function findEndRecord(bytes, view) {
    for (let i = bytes.length - END_RECORD_SIZE; i >= Math.max(0, bytes.length - END_RECORD_SIZE - MAX_COMMENT_SIZE); i--) if (view.getUint32(i, true) === END_SIGNATURE) return i;
    return -1;
}

/**
 * Creates the unpacker of one ZIP file, which counts what all its entries unpack to.
 * @returns {function(ZipEntry): Promise<Uint8Array>} unpacks an entry; rejects with an Error once
 *   the entries unpack to more than 100 MB in all.
 */
export function createUnpacker() {
    let left = MAX_UNPACKED_SIZE;
    /**
     * Returns the error of a ZIP that unpacks to too much.
     * @returns {Error} the error.
     */
    const createTooBigError = () => new Error('it unpacks to more than 100 MB');
    return expandEntry;

    /**
     * Returns the content of an entry and counts it against the limit (a reader that consumes
     * the limit as it goes).
     * @param {ZipEntry} entry - the entry.
     * @returns {Promise<Uint8Array>} its content.
     * @throws {Error} once the entries unpack to more than 100 MB in all (the Promise rejects).
     */
    async function expandEntry(entry) {
        if (entry.method === STORED) { left -= entry.data.length; if (left < 0) throw createTooBigError(); return entry.data; }
        const reader = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const parts = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            left -= value.length;
            if (left < 0) { reader.cancel(); throw createTooBigError(); }
            parts.push(value);
        }
        return joinParts(parts, size);
    }
}

/**
 * Returns byte arrays joined into one.
 * @param {Uint8Array[]} parts - the parts.
 * @param {number} size - their length in all.
 * @returns {Uint8Array} the joined bytes.
 */
function joinParts(parts, size) {
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
}
