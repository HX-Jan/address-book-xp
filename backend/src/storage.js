import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const dataDirectory = process.env.ADDRESS_BOOK_DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
export const legacyBookFile = process.env.ADDRESS_BOOK_DATA_FILE || join(dataDirectory, 'contacts.json');
export const accountBookFile = (id) => join(dataDirectory, 'books', `${id}.json`);

export function readJson(file, empty) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return empty;
    throw error;
  }
}

export function writeJson(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(temporary, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}
