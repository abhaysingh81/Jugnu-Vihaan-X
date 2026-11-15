export type Coordinates = { lat: number; lng: number; timestamp: number };
export type Incident = {
  id: string;
  created: number;
  trigger: "manual" | "audio";
  state: "pending" | "active" | "resolved" | "interrupted";
  version?: number;
  location?: Coordinates;
  video?: boolean;
  summary?: string;
  review?: "benign" | "uncertain";
  callStatus?: string;
  demo?: boolean;
};

export function policeDraft(incident: Incident) {
  const trigger = incident.trigger === "manual" ? "SOS started" : "Possible distress detected";
  const start = `Jugnu demo. ${trigger} at ${new Date(incident.created).toLocaleTimeString()}. Please check on the person.`;
  const position = incident.location ? ` Last known location: ${locationLink(incident.location)}.` : " Location is unavailable.";
  return start + position + (incident.summary ? ` Scene observation: ${incident.summary}` : " The camera view is unavailable or has not been assessed.");
}

type Evidence = { id: string; clip: Blob };
function openEvidence() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("jugnu-evidence", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("clips", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function evidenceTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openEvidence();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("clips", mode);
      const request = action(transaction.objectStore("clips"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || new Error("Evidence access interrupted"));
    });
  } finally { db.close(); }
}

export async function saveEvidence(id: string, clip: Blob) {
  await evidenceTransaction("readwrite", store => store.put({ id, clip } satisfies Evidence));
}
export async function readEvidence(id: string): Promise<Blob | undefined> {
  const evidence = await evidenceTransaction<Evidence | undefined>("readonly", store => store.get(id));
  return evidence?.clip;
}
export async function deleteEvidence(id: string) {
  await evidenceTransaction("readwrite", store => store.delete(id));
}

export function locationLink(position: Coordinates) {
  return `https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`;
}
