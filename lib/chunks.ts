// Split a string into parts small enough for the platform keychain (see secureStorage.native.ts).

export const CHUNK_SIZE = 1800; // characters; stays under ~2 KB even with some multi-byte content
export const CHUNK_COUNT_SUFFIX = '.n';

export function chunkValue(value: string, size = CHUNK_SIZE): string[] {
  if (value.length === 0) return [''];
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts;
}
