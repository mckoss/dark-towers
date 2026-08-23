import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

const SCRATCH = process.env.TEST_SCRATCH_DIR ?? path.join(os.tmpdir(), 'dark-towers-tests');

/**
 * Point DATA_DIR (read by src/lib/server/config.ts at import time) at a fresh
 * temp directory. Must be called BEFORE the server modules are imported, so
 * test files that use it import those modules dynamically.
 */
export function freshDataDir(name: string): string {
	fs.mkdirSync(SCRATCH, { recursive: true });
	const dir = fs.mkdtempSync(path.join(SCRATCH, `${name}-`));
	vi.stubEnv('DATA_DIR', dir);
	vi.stubEnv('DB_PATH', path.join(dir, 'db', 'test.sqlite'));
	vi.stubEnv('SCHEDULER', 'off');
	return dir;
}
