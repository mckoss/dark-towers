/** Ask FlightAware whether this key allows extended history (data older than 10 days). One call. */
import { probeCapability } from '../src/lib/server/capability';

const cap = await probeCapability({ log: console.log });
if (!cap) {
	console.error('No answer (no key, or the API could not be reached).');
	process.exit(1);
}
console.log(`Extended history: ${cap.extendedHistory ? 'AVAILABLE' : 'not available'} on key ${cap.key} (${cap.detail})`);
