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

	/**
	 * 检查 Redis 连接是否可用（通过 PING 命令实时验证）
	 * @returns Promise<boolean> - 连接是否可用
	 */
	async isReady(): Promise<boolean> {
		try {
			const result = await this.client.ping();
			const isReady = result === 'PONG';
			this.isConnected = isReady; // 更新内部状态
			return isReady;
		} catch (error) {
			this.isConnected = false;
			logger.warn({ error }, '⚠️ Redis 连接检查失败');
			return false;
		}
	}

	/**
	 * 同步检查连接状态（仅检查内部标志，不执行网络请求）
	 * @returns boolean - 连接状态标志
	 */
	isConnectedSync(): boolean {
		return this.isConnected;
	}

	async disconnect(): Promise<void> {
		await this.client.quit();
		logger.info('Redis client disconnected');
	}

	/**
	 * @deprecated 使用 isReady() 替代，该方法会实时验证连接
	 */
	async ping(): Promise<boolean> {
		return this.isReady();
	}
}

// 单例模式
export const redisClient = new RedisClient();

// 导出连接供 BullMQ 使用
export const redisConnection = redisClient.getClient();
