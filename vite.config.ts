import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes mode everywhere except node_modules.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ out: 'build' })
		})
	],
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node'
	}
});
