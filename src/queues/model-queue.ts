import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { redisClient } from '../utils/redis-client.js';

export interface ModelJobData {
	jobId: string;
	modelId: string;
	imageUrl: string;
	requestId: string;
	userId: string;
}

export const modelQueue = new Queue<ModelJobData>('model-generation', {
	connection: redisClient.getClient(),
	defaultJobOptions: {
		attempts: config.queue.maxRetries,
		backoff: {
			type: 'exponential',
			delay: 10000,
		},
		removeOnComplete: {
			count: 100,
			age: 3600, // 1 hour
		},
		removeOnFail: {
			count: 500,
		},
	},
});
