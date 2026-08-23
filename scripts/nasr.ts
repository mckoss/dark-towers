/** Download (or reuse) the current FAA NASR cycle and print a few lookups. */
import { assessRequest } from '../src/lib/nasr';
import { updateNasr } from '../src/lib/server/nasr';

const data = await updateNasr({ log: console.log });
if (!data) {
	console.error('no NASR data');
	process.exit(1);
}
for (const q of process.argv.slice(2)) console.log(assessRequest(data, q).message);
