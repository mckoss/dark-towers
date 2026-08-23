/**
 * Minimal ZIP reader: enough to pull named entries (stored or deflated) out
 * of an archive held in memory. No zip64, no encryption — the FAA NASR
 * extracts are plain ~20 MB archives.
 */
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
	name: string;
	method: number;
	compressedSize: number;
	size: number;
	localHeaderOffset: number;
}

export function listZip(buf: Buffer): ZipEntry[] {
	// End of central directory record: scan back for its signature.
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error('not a zip file');
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	const out: ZipEntry[] = [];
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
		const method = buf.readUInt16LE(p + 10);
		const compressedSize = buf.readUInt32LE(p + 20);
		const size = buf.readUInt32LE(p + 24);
		const nameLen = buf.readUInt16LE(p + 28);
		const extraLen = buf.readUInt16LE(p + 30);
		const commentLen = buf.readUInt16LE(p + 32);
		const localHeaderOffset = buf.readUInt32LE(p + 42);
		const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
		out.push({ name, method, compressedSize, size, localHeaderOffset });
		p += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}

export function readZipEntry(buf: Buffer, e: ZipEntry): Buffer {
	const p = e.localHeaderOffset;
	if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('bad local header');
	const nameLen = buf.readUInt16LE(p + 26);
	const extraLen = buf.readUInt16LE(p + 28);
	const start = p + 30 + nameLen + extraLen;
	const data = buf.subarray(start, start + e.compressedSize);
	if (e.method === 0) return Buffer.from(data);
	if (e.method === 8) return inflateRawSync(data);
	throw new Error(`unsupported zip method ${e.method}`);
}

/** Parse RFC 4180-style CSV (quoted fields, doubled quotes, CRLF) into rows of strings. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
		} else field += c;
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
