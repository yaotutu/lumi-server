import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
	level: config.logger.level,
	transport: config.isDevelopment
		? {
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'HH:MM:ss Z',
					ignore: 'pid,hostname',
				},
			}
		: undefined,
	formatters: {
		level: (label) => {
			return { level: label };
		},
	},
	timestamp: pino.stdTimeFunctions.isoTime,
});
