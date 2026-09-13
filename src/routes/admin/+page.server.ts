import { listAirports } from '$lib/server/airports-store';
import { requestCount, nightCounts, runActivity } from '$lib/server/db';
import { config } from '$lib/server/config';
import { currentJob } from '$lib/server/jobs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
 const counts = nightCounts();
 const job = currentJob();
 return {
  trackedAirports: listAirports().filter(a => a.tracked).length,
  nights: counts.reduce((total, row) => total + row.nights, 0),
  incomplete: counts.reduce((total, row) => total + row.nights - row.complete, 0),
  pendingRequests: requestCount(),
  schedulerOn: config().scheduler,
  activity: runActivity(Date.now() - 24 * 3600_000),
  job: job ? { name: job.name, finishedAt: job.finishedAt, ok: job.ok } : null
 };
};
