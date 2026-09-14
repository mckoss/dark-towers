import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	counts: vi.fn(() => ({ nights: 40, flights: 100, incidents: 2 })),
	remove: vi.fn(() => ({ nights: 40, flights: 100, incidents: 2 })),
	job: vi.fn<() => { finishedAt: number | null } | null>(() => null)
}));
vi.mock('$lib/server/db', () => ({ airportDataCounts: mocks.counts, deleteAirportData: mocks.remove }));
vi.mock('$lib/server/jobs', () => ({ currentJob: mocks.job }));
vi.mock('$lib/server/airports-store', () => ({
	getAirport: (code: string) => code === 'SEA' ? { code: 'SEA', icao: 'KSEA', name: 'Seattle' } : undefined,
	listAirports: () => []
}));
const { actions } = await import('../../src/routes/admin/data/remove/+page.server');
function event(values: Record<string, string>) {
	return { request: new Request('https://example.test/admin/data/remove', { method: 'POST', body: new URLSearchParams(values) }), locals: { user: { email: 'admin@example.com' } } } as never;
}
beforeEach(() => { vi.clearAllMocks(); mocks.job.mockReturnValue(null); });

describe('admin removal actions', () => {
	it('previews SEA without removing data', async () => {
		const result = await actions.preview(event({ airport: 'SEA', scope: 'all' }));
		expect(result).toMatchObject({ preview: { code: 'SEA', airport: 'KSEA', from: null, to: null, nights: 40 } });
		expect(mocks.remove).not.toHaveBeenCalled();
	});
	it('requires the selected airport code as confirmation', async () => {
		const result = await actions.remove(event({ airport: 'SEA', scope: 'all', confirm: 'PAE' }));
		expect(result).toMatchObject({ status: 400 });
		expect(mocks.remove).not.toHaveBeenCalled();
	});
	it('blocks deletion while collection is running', async () => {
		mocks.job.mockReturnValue({ finishedAt: null });
		const result = await actions.remove(event({ airport: 'SEA', scope: 'all', confirm: 'SEA' }));
		expect(result).toMatchObject({ status: 409 });
		expect(mocks.remove).not.toHaveBeenCalled();
	});
	it('rejects unknown airports and missing scope', async () => {
		for (const input of [{ airport: 'BAD', scope: 'all', confirm: 'BAD' }, { airport: 'SEA', scope: '', confirm: 'SEA' }]) {
			expect(await actions.remove(event(input))).toMatchObject({ status: 400 });
		}
		expect(mocks.remove).not.toHaveBeenCalled();
	});
	it('removes only the confirmed SEA selection', async () => {
		const result = await actions.remove(event({ airport: 'SEA', scope: 'range', from: '2026-08-01', to: '2026-08-31', confirm: 'SEA' }));
		expect(mocks.remove).toHaveBeenCalledWith({ airport: 'KSEA', code: 'SEA', name: 'Seattle', from: '2026-08-01', to: '2026-08-31' });
		expect(result).toMatchObject({ removed: { code: 'SEA', nights: 40 } });
	});
});
