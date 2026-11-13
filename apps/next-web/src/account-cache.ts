import type { RemoteItem, Material } from './live-api';
export type Snapshot = {
  owner: string;
  section: string;
  items: RemoteItem[];
  nextCursor: string | null;
  savedAt: number;
};
const database = 'zine-next-connected-v1';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  const connection = await db();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = connection.transaction('data', mode);
      const request = action(tx.objectStore('data'));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    connection.close();
  }
}
export const readSnapshot = (owner: string, section: string) =>
  transaction<Snapshot | undefined>('readonly', (s) => s.get(owner + ':feed:' + section));
export const writeSnapshot = (snapshot: Snapshot) =>
  transaction('readwrite', (s) => s.put(snapshot, snapshot.owner + ':feed:' + snapshot.section));
export const readItem = (owner: string, id: string) =>
  transaction<RemoteItem | undefined>('readonly', (s) => s.get(owner + ':item:' + id));
export const writeItem = (owner: string, item: RemoteItem) =>
  transaction('readwrite', (s) => s.put(item, owner + ':item:' + item.id));
export const readMaterial = (owner: string, id: string) =>
  transaction<Material | undefined>('readonly', (s) => s.get(owner + ':material:' + id));
export const writeMaterial = (owner: string, id: string, material: Material) =>
  transaction('readwrite', (s) => s.put(material, owner + ':material:' + id));
export const readOperation = (owner: string) =>
  transaction<{ key: string; body: unknown } | undefined>('readonly', (s) =>
    s.get(owner + ':pending-save')
  );
export const writeOperation = (owner: string, key: string, body: unknown) =>
  transaction('readwrite', (s) => s.put({ key, body }, owner + ':pending-save'));
export const clearOperation = (owner: string) =>
  transaction('readwrite', (s) => s.delete(owner + ':pending-save'));
export async function clearPrivateData() {
  localStorage.removeItem('zine-next-connected-owner');
  await transaction('readwrite', (s) => s.clear());
}

// A known server denial/deletion must also invalidate offline copies.
export const forgetMaterial = (owner: string, id: string) =>
  transaction('readwrite', (s) => s.delete(owner + ':material:' + id));
export async function forgetItem(owner: string, id: string) {
  await transaction('readwrite', (store) => {
    store.delete(owner + ':item:' + id);
    store.delete(owner + ':material:' + id);
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      if (String(row.key).startsWith(owner + ':feed:') && Array.isArray(row.value.items))
        row.update({
          ...row.value,
          items: row.value.items.filter((item: RemoteItem) => item.id !== id),
        });
      row.continue();
    };
    return cursor;
  });
}
