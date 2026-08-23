import { clearSessionCookie } from '$lib/server/session';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = ({ cookies }) => {
	clearSessionCookie(cookies);
	redirect(303, '/');
};
