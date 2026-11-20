/**
 * Pictures of a document (![alt](name)), kept in the browser's IndexedDB: pictures are too
 * large for localStorage. One record per document: { name: data URI }. Without IndexedDB the
 * pictures live only until the page is closed; pictures of documents kept in memory (from a
 * page) never go into IndexedDB.
 *
 * The review test imports this file with the ?v= the editor's own
 * modules import it with, slows assets.set() down and reads assets.get(), and the shared
 * rename test calls assets.set() through window.mdEditor: every write goes through
 * assets.set, and these names stay.
 */

const DATABASE = 'mdeditor';
const STORE = 'assets';
const DATABASE_VERSION = 1;
const DEFAULT_PICTURE_NAME = 'picture.png';
const DEFAULT_EXTENSION = '.png';

/** The pictures of each document read or written in this page, by document id. */
const memory = new Map();
let databasePromise = null;
/**
 * Tells whether a document keeps its pictures in memory only; set by setMemoryOnlyRule().
 * @param {string} id - the document's id.
 * @returns {boolean} true for a document kept in memory only.
 */
let isMemoryOnly = () => false;
/**
 * Runs when a write did not reach IndexedDB; set by setNotStoredHandler().
 * @param {string} id - the document's id.
 * @returns {void}
 */
let handleNotStored = () => {};

/**
 * Returns the database, opened once.
 * @returns {Promise<IDBDatabase|null>} the database, null without IndexedDB.
 */
function getDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(openDatabase);
    return databasePromise;
}

/**
 * Opens the database, creating its store the first time, and hands it on (the executor of
 * getDatabase's Promise).
 * @param {function(IDBDatabase|null): void} resolve - takes the database, null when it cannot be opened.
 * @returns {void}
 */
function openDatabase(resolve) {
    try {
        const request = indexedDB.open(DATABASE, DATABASE_VERSION);
        request.addEventListener('upgradeneeded', () => request.result.createObjectStore(STORE));
        request.addEventListener('success', () => resolve(request.result));
        request.addEventListener('error', () => resolve(null));
        request.addEventListener('blocked', () => resolve(null));
    } catch (e) { resolve(null); }
}

/**
 * Runs a request in a transaction of the store.
 * @param {string} mode - "readonly" or "readwrite".
 * @param {function(IDBObjectStore): (IDBRequest|undefined)} run - makes the request.
 * @returns {Promise<*>} the request's result (true without a request), null when it failed or there is no database.
 */
async function runTransaction(mode, run) {
    const database = await getDatabase();
    if (!database) return null;
    return new Promise(resolve => startTransaction(database, mode, run, resolve));
}

/**
 * Runs a request in a transaction of the store and hands on its result (the executor of
 * runTransaction's Promise).
 * @param {IDBDatabase} database - the database.
 * @param {string} mode - "readonly" or "readwrite".
 * @param {function(IDBObjectStore): (IDBRequest|undefined)} run - makes the request.
 * @param {function(*): void} resolve - takes the request's result (true without a request), null when it failed.
 * @returns {void}
 */
function startTransaction(database, mode, run, resolve) {
    try {
        const transaction = database.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        transaction.addEventListener('complete', () => resolve(request ? request.result : true));
        transaction.addEventListener('error', () => resolve(null));
        transaction.addEventListener('abort', () => resolve(null));
    } catch (e) { resolve(null); }
}

/**
 * The pictures of the documents.
 */
export const assets = {
    /**
     * Returns all pictures of a document. The name is the one the tests call.
     * A query that fills a cache.
     * @param {string} id - the document's id.
     * @returns {Promise<Object<string, string>>} name -> data URI, empty when it has none.
     */
    async get(id) {
        if (memory.has(id) || isMemoryOnly(id)) return memory.get(id) || {};
        const pictures = (await runTransaction('readonly', objectStore => objectStore.get(id))) || {};
        memory.set(id, pictures);
        return pictures;
    },

    /**
     * Returns the pictures of a document as far as this page has read them.
     * @param {string} id - the document's id.
     * @returns {Object<string, string>} name -> data URI.
     */
    getCached(id) {
        return memory.get(id) || {};
    },

    /**
     * Sets which documents keep their pictures in memory only.
     * @param {function(string): boolean} test - true for a document kept in memory only.
     * @returns {void}
     */
    setMemoryOnlyRule(test) {
        isMemoryOnly = test;
    },

    /**
     * Sets what happens when a write does not reach IndexedDB (storage full or blocked): the
     * pictures are then in memory only.
     * @param {function(string): void} handler - gets the document's id.
     * @returns {void}
     */
    setNotStoredHandler(handler) {
        handleNotStored = handler;
    },

    /**
     * Sets all pictures of a document. The name is the one the tests call and replace
     * to slow writing down, so every write goes through it.
     * @param {string} id - the document's id.
     * @param {Object<string, string>} pictures - name -> data URI.
     * @returns {Promise<void>} settles when the pictures are stored (or kept in memory).
     */
    async set(id, pictures) {
        memory.set(id, pictures);
        if (!isMemoryOnly(id) && (await runTransaction('readwrite', objectStore => objectStore.put(pictures, id))) === null) handleNotStored(id);
    },

    /**
     * Adds or replaces one picture of a document. A command that returns the new set, as the
     * caller shows it.
     * @param {string} id - the document's id.
     * @param {string} name - the picture's name.
     * @param {string} dataUrl - its content.
     * @returns {Promise<Object<string, string>>} all pictures of the document.
     */
    async add(id, name, dataUrl) {
        const pictures = { ...(await this.get(id)) };
        pictures[name] = dataUrl;
        await this.set(id, pictures);
        return pictures;
    },

    /**
     * Removes one picture of a document. A command that returns the new set, as the caller
     * shows it.
     * @param {string} id - the document's id.
     * @param {string} name - the picture's name.
     * @returns {Promise<Object<string, string>>} the pictures left.
     */
    async remove(id, name) {
        const pictures = { ...(await this.get(id)) };
        delete pictures[name];
        await this.set(id, pictures);
        return pictures;
    },

    /**
     * Removes all pictures of a document.
     * @param {string} id - the document's id.
     * @returns {Promise<void>} settles when they are removed.
     */
    async removeDocument(id) {
        memory.delete(id);
        if (!isMemoryOnly(id)) await runTransaction('readwrite', objectStore => objectStore.delete(id));
    },

    /**
     * Copies all pictures of one document to another.
     * @param {string} from - the id of the document copied from.
     * @param {string} to - the id of the document copied to.
     * @returns {Promise<void>} settles when the copy is stored.
     */
    async copy(from, to) {
        await this.set(to, { ...(await this.get(from)) });
    },
};

/**
 * Returns a file name that is not taken yet: "logo.png", "logo-2.png" …
 * @param {Object<string, *>} pictures - the pictures by name.
 * @param {string} name - the wanted name; characters other than letters, digits, ".", "-" and
 *   "_" become "-", a name without an extension gets ".png".
 * @returns {string} the free name.
 */
export function getFreeName(pictures, name) {
    let clean = String(name || DEFAULT_PICTURE_NAME).replace(/[^\w.\-]+/g, '-').replace(/^-+/, '') || DEFAULT_PICTURE_NAME;
    if (!/\.[a-z0-9]+$/i.test(clean)) clean += DEFAULT_EXTENSION;
    if (!pictures[clean]) return clean;
    const stem = clean.replace(/(\.[a-z0-9]+)$/i, ''), extension = /(\.[a-z0-9]+)$/i.exec(clean)[1];
    for (let k = 2; ; k++) if (!pictures[`${stem}-${k}${extension}`]) return `${stem}-${k}${extension}`;
}

/**
 * Reads a file as a data URI.
 * @param {Blob} file - the file.
 * @returns {Promise<string>} the data URI.
 * @throws {Error} when the file cannot be read (the Promise rejects).
 */
export function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', () => reject(new Error('The picture could not be read')));
        reader.readAsDataURL(file);
    });
}

/**
 * Returns the bytes of a data URI.
 * @param {string} dataUrl - the data URI, base64 or URL-encoded.
 * @returns {Uint8Array} its bytes.
 */
export function getDataUrlBytes(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const isBase64 = /;base64/.test(dataUrl.slice(0, comma));
    const data = dataUrl.slice(comma + 1);
    if (!isBase64) return new TextEncoder().encode(decodeURIComponent(data));
    const binary = atob(data);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}
