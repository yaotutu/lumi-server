import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config();

export default defineConfig({
	schema: './src/db/schema',
	out: './src/db/migrations',
	dialect: 'mysql',
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is required
		url: process.env.DATABASE_URL!,
	},
	verbose: true,
	strict: true,
});
