import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

class RedisClient {
	private client: Redis;
	private isConnected = false;

	constructor() {
		this.client = new Redis({
			host: config.redis.host,
			port: config.redis.port,
			password: config.redis.password,
			db: config.redis.db,
			retryStrategy: (times) => {
				const delay = Math.min(times * 50, 2000);
				logger.warn(`Redis retry attempt ${times}, delay: ${delay}ms`);
				return delay;
			},
			maxRetriesPerRequest: null, // BullMQ 要求必须为 null
		});

		this.client.on('connect', () => {
			this.isConnected = true;
			logger.info('✅ Redis connected successfully');
		});

		this.client.on('ready', () => {
			logger.info('Redis client ready');
		});

		this.client.on('error', (err) => {
			this.isConnected = false;
			logger.error({ err }, '❌ Redis error');
		});

		this.client.on('close', () => {
			this.isConnected = false;
			logger.warn('Redis connection closed');
		});

		this.client.on('reconnecting', () => {
			logger.info('Redis reconnecting...');
		});
	}

	getClient(): Redis {
		return this.client;
	}

	isReady(): boolean {
		return this.isConnected;
	}

	async disconnect(): Promise<void> {
		await this.client.quit();
		logger.info('Redis client disconnected');
	}

	async ping(): Promise<boolean> {
		try {
			const result = await this.client.ping();
			return result === 'PONG';
		} catch (error) {
			logger.error({ error }, 'Redis ping failed');
			return false;
		}
	}
}

// 单例模式
export const redisClient = new RedisClient();
