import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { redisClient } from '../utils/redis-client.js';

export interface ImageJobData {
	jobId: string;
	imageId: string;
	prompt: string;
	requestId: string;
	userId: string;
}

export const imageQueue = new Queue<ImageJobData>('image-generation', {
	connection: redisClient.getClient(),
	defaultJobOptions: {
		attempts: config.queue.maxRetries,
		backoff: {
			type: 'exponential',
			delay: 5000,
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
