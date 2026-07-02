"use client";

/**
 * Local cache of rendered PREMIUM (Isaac / paid-voice) recap videos, keyed by the
 * game's history id. Premium narration costs real ElevenLabs credits to render, so
 * once a user makes a premium video we keep the finished file here — re-opening the
 * game from history serves the saved video instead of re-rendering (and re-spending).
 *
 * Free-voice videos are NOT saved (they're cheap to recreate). Stored in IndexedDB
 * (handles multi-MB blobs; localStorage can't), capped + LRU-evicted by age so it
 * never grows unbounded. Per-device by nature — best-effort, never blocks anything.
 */

export type SavedVideoItem = { aspect: string; ext: string; mime: string; blob: Blob };
export type SavedVideo = { gameId: string; voice: string; branded: boolean; items: SavedVideoItem[]; createdAt: number };

const DB_NAME = "clunoid-videos";
const STORE = "videos";
const CAP = 10; // keep the 10 most recent premium videos
// v2: earlier versions cached short (8-flag-capped) recap clips. Bumping the DB
// version drops that store once, so every game — live AND replayed from history —
// re-renders at its FULL length under the new logic instead of serving a stale clip.
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Drop any pre-existing (short-clip) store, then recreate it fresh.
        if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
        const store = db.createObjectStore(STORE, { keyPath: "gameId" });
        store.createIndex("createdAt", "createdAt");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Save (or replace) the premium video for a game, then evict the oldest beyond CAP. */
export async function saveGameVideo(v: SavedVideo): Promise<void> {
  if (!v.gameId || !v.items.length) return;
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(v);
      // LRU evict: drop the oldest entries once we exceed CAP.
      const countReq = store.count();
      countReq.onsuccess = () => {
        let over = countReq.result - CAP;
        if (over <= 0) return;
        const cur = store.index("createdAt").openKeyCursor(null, "next"); // oldest first
        cur.onsuccess = () => {
          const c = cur.result;
          if (c && over > 0) {
            store.delete(c.primaryKey);
            over--;
            c.continue();
          }
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** The saved premium video for a game, or null. */
export async function loadGameVideo(gameId: string): Promise<SavedVideo | null> {
  if (!gameId) return null;
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<SavedVideo | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(gameId);
      req.onsuccess = () => resolve((req.result as SavedVideo) || null);
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

/** Game ids that currently have a saved premium video (for history badges). */
export async function listSavedVideoIds(): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return await new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]) || []);
      req.onerror = () => resolve([]);
    });
  } finally {
    db.close();
  }
}

/** Delete a game's saved video (e.g. when the game is deleted from history). */
export async function deleteGameVideo(gameId: string): Promise<void> {
  if (!gameId) return;
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}
