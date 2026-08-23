/**
 * Seed the raw cache from the committed test fixture (a few KPAE nights) and
 * rebuild the database. Used by CI and for a fresh clone. Never overwrites
 * files already in data/raw, so it is safe to run on a machine with real data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR } from '../src/lib/server/config';

const FIXTURE = path.resolve('tests/fixtures/raw');
let copied = 0;
function walk(dir: string) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const from = path.join(dir, entry.name);
		const to = path.join(RAW_DIR, path.relative(FIXTURE, from));
		if (entry.isDirectory()) walk(from);
		else if (!fs.existsSync(to)) {
			fs.mkdirSync(path.dirname(to), { recursive: true });
			fs.copyFileSync(from, to);
			copied++;
		}
	}
}
walk(FIXTURE);
console.log(`seeded ${copied} file(s) into ${RAW_DIR}`);
await import('./rebuild');
