import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { redisClient } from '../utils/redis-client.js';

export interface ModelJobData {
	jobId: string;
	modelId: string;
	imageUrl: string;
	requestId: string;
	externalUserId: string;
}

export const modelQueue = new Queue<ModelJobData>('model-generation', {
	connection: redisClient.getClient(),
	// Redis 集群模式下，使用 hash tag 确保所有相关的 key 在同一个槽
	// 格式：{queueName} - 花括号内的内容用于计算哈希槽
	prefix: '{model-generation}',
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
