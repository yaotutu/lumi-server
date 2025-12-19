import Redis, { Cluster } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

class RedisClient {
	private client: Redis | Cluster;
	private isConnected = false;

	constructor() {
		// 输出 Redis 配置信息（用于调试）
		logger.info(
			{
				host: config.redis.host,
				port: config.redis.port,
				db: config.redis.db,
				tls: config.redis.tls,
				clusterMode: config.redis.clusterMode,
				hasPassword: !!config.redis.password,
			},
			'正在初始化 Redis 客户端...',
		);

		// 根据配置决定使用单节点还是集群模式
		if (config.redis.clusterMode) {
			// AWS MemoryDB 集群模式
			logger.info('使用 Redis 集群模式（MemoryDB/ElastiCache）');
			this.client = new Cluster(
				[
					{
						host: config.redis.host,
						port: config.redis.port,
					},
				],
				{
					redisOptions: {
						password: config.redis.password,
						tls: config.redis.tls ? {} : undefined, // 启用 TLS
						// BullMQ 要求必须为 null
						maxRetriesPerRequest: null,
						// 连接超时设置（10 秒）
						connectTimeout: 10000,
						// 命令超时设置（5 秒）
						commandTimeout: 5000,
					},
					// 启用读写分离（可选）
					scaleReads: 'slave',
					// 集群连接超时
					clusterRetryStrategy: (times) => {
						if (times > 3) {
							logger.error('Redis 集群连接失败，已达到最大重试次数');
							return null; // 停止重试
						}
						const delay = Math.min(times * 1000, 3000);
						logger.warn(`Redis 集群重试第 ${times} 次，延迟 ${delay}ms`);
						return delay;
					},
				},
			);
		} else {
			// 单节点模式
			logger.info('使用 Redis 单节点模式');
			this.client = new Redis({
				host: config.redis.host,
				port: config.redis.port,
				password: config.redis.password,
				db: config.redis.db,
				tls: config.redis.tls ? {} : undefined, // 启用 TLS
				// 连接超时设置（10 秒）
				connectTimeout: 10000,
				// 命令超时设置（5 秒）
				commandTimeout: 5000,
				retryStrategy: (times) => {
					if (times > 3) {
						logger.error('Redis 连接失败，已达到最大重试次数');
						return null; // 停止重试
					}
					const delay = Math.min(times * 1000, 3000);
					logger.warn(`Redis 重试第 ${times} 次，延迟 ${delay}ms`);
					return delay;
				},
				maxRetriesPerRequest: null, // BullMQ 要求必须为 null
			});
		}

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

	getClient(): Redis | Cluster {
		return this.client;
	}

	/**
	 * 检查 Redis 连接是否可用（通过 PING 命令实时验证）
	 * @returns Promise<boolean> - 连接是否可用
	 */
	async isReady(): Promise<boolean> {
		try {
			logger.info('正在测试 Redis 连接...');

			// 创建一个带超时的 Promise
			const pingPromise = this.client.ping();
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error('Redis ping 超时（15秒）'));
				}, 15000); // 15 秒超时
			});

			// 使用 Promise.race 实现超时
			const result = await Promise.race([pingPromise, timeoutPromise]);
			const isReady = result === 'PONG';
			this.isConnected = isReady; // 更新内部状态

			if (isReady) {
				logger.info('✅ Redis PING 成功');
			} else {
				logger.error({ result }, '❌ Redis PING 返回异常结果');
			}

			return isReady;
		} catch (error) {
			this.isConnected = false;
			logger.error(
				{
					error,
					errorMessage: error instanceof Error ? error.message : String(error),
					errorStack: error instanceof Error ? error.stack : undefined,
					redisConfig: {
						host: config.redis.host,
						port: config.redis.port,
						tls: config.redis.tls,
						clusterMode: config.redis.clusterMode,
					},
				},
				'❌ Redis 连接检查失败',
			);
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
