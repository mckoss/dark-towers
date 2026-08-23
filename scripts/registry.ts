/** Download (or reuse) this month's FAA aircraft registry and print lookups for any tails given. */
import { lookupRegistry } from '../src/lib/registry';
import { updateRegistry } from '../src/lib/server/registry';

const data = await updateRegistry({ log: console.log });
if (!data) {
	console.error('no registry data');
	process.exit(1);
}
for (const tail of process.argv.slice(2)) console.log(tail, lookupRegistry(data, tail));
