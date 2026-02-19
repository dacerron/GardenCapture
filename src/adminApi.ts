import { fetchAuthSession } from "aws-amplify/auth";

const BASE = import.meta.env.VITE_API_URL as string;

export type CreateFieldPayload = {
  FieldID: string;
  Name: string;
  Description?: string;
  File?: string;
  Latitude?: number;
  Longitude?: number;
  Thumbnail?: string;
  ThumbnailAlt?: string;
  markers?: unknown;
};

async function authHeader() {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

export async function listFields() {
  const headers = await authHeader();
  const res = await fetch(`${BASE}/admin/api/fields`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ items: any[] }>;
}

export async function createField(payload: CreateFieldPayload) {
  const headers = await authHeader();
  const res = await fetch(`${BASE}/admin/api/fields`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ item: any }>;
}
