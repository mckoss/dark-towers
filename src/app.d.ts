import type { SessionUser } from '$lib/server/session';

declare global {
	namespace App {
		interface Error {
			account?: string;
		}
		interface Locals {
			user: SessionUser | null;
		}
	}
}

export {};
