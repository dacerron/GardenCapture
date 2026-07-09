/** True when bytes look like an ASCII PLY header (not HTML/XML/error text). */
export function looksLikePlyHeader(bytes: ArrayBuffer | Uint8Array): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length < 4) return false;
  const head = new TextDecoder().decode(view.slice(0, Math.min(view.length, 64)));
  if (!head.startsWith("ply")) return false;
  const third = head.charCodeAt(3);
  return third === 0x0a || third === 0x0d || third === 0x20;
}

/** GET first bytes and verify PLY magic (more reliable than HEAD alone). */
export async function urlLooksLikePly(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-63" },
    });
    if (!res.ok && res.status !== 206) return false;
    return looksLikePlyHeader(await res.arrayBuffer());
  } catch {
    return false;
  }
}
