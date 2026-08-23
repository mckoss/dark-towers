import { building } from '$app/environment';
import { SCHEDULER_ENABLED } from '$lib/server/config';
import { startScheduler } from '$lib/server/scheduler';
import type { ServerInit } from '@sveltejs/kit';

export const init: ServerInit = async () => {
	if (building || !SCHEDULER_ENABLED) return;
	startScheduler((m) => console.log(`[pipeline] ${m}`));
};
