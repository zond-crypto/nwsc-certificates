import { Client } from '../types';

const CLIENTS_STORAGE_KEY = 'nkana_clients';

export function loadClients(): Client[] {
  try {
    const raw = localStorage.getItem(CLIENTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load clients', e);
  }
  return [];
}

export function saveClients(clients: Client[]): void {
  try {
    localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients));
  } catch (e) {
    console.error('Failed to save clients', e);
  }
}

export function upsertClient(clients: Client[], clientData: Omit<Client, 'id' | 'createdAt'>): Client[] {
  const existingIndex = clients.findIndex(c => c.name.toLowerCase() === clientData.name.toLowerCase());
  if (existingIndex >= 0) {
    const updated = [...clients];
    updated[existingIndex] = {
      ...updated[existingIndex],
      ...clientData,
    };
    return updated;
  }

  const newClient: Client = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    ...clientData,
  };
  return [...clients, newClient];
}
