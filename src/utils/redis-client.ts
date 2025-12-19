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

			// AWS MemoryDB 需要的 TLS 配置
			const tlsOptions = config.redis.tls
				? {
						// AWS MemoryDB 使用自签名证书，需要禁用严格验证
						rejectUnauthorized: false,
					}
				: undefined;

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
						tls: tlsOptions, // 使用配置好的 TLS 选项
						// BullMQ 要求必须为 null
						maxRetriesPerRequest: null,
						// 连接超时设置（10 秒）
						connectTimeout: 10000,
						// 命令超时设置（5 秒）
						commandTimeout: 5000,
					},
					// 启用 TLS（集群级别）
					enableReadyCheck: true,
					// 集群节点发现时也使用 TLS
					natMap: undefined,
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
			// 单节点模式 - 适配服务器环境
			logger.info('使用 Redis 单节点模式');
			this.client = new Redis({
				host: config.redis.host,
				port: config.redis.port,
				password: config.redis.password,
				db: config.redis.db,
				tls: config.redis.tls ? {} : undefined,
				// 增加超时时间以适应服务器环境
				connectTimeout: 20000,
				commandTimeout: 20000,
				// 移除 keep-alive 以提高服务器兼容性
				// keepAlive: 30000, // 服务器环境可能不稳定
				// BullMQ 要求的配置
				maxRetriesPerRequest: null,
				// 更保守的重连策略
				retryStrategy: (times) => {
					if (times > 5) { // 增加重试次数
						logger.error('Redis 连接失败，已达到最大重试次数');
						return null;
					}
					const delay = Math.min(times * 2000, 10000); // 更长的延迟
					logger.warn(`Redis 重试第 ${times} 次，延迟 ${delay}ms`);
					return delay;
				},
				enableReadyCheck: true,
				lazyConnect: false,
				// 服务器环境稳定性配置 - 使用简化配置
			});
		}

		this.client.on('connect', () => {
			this.isConnected = true;
			logger.info('✅ Redis connected successfully');
		});

		this.client.on('ready', () => {
			logger.info('✅ Redis client ready');
			// 如果是集群模式，输出节点信息
			if (this.client instanceof Cluster) {
				const nodes = this.client.nodes('all');
				logger.info(
					{
						nodesCount: nodes.length,
						nodes: nodes.map((node) => `${node.options.host}:${node.options.port}`),
					},
					'Redis 集群节点信息',
				);
			}
		});

		this.client.on('error', (err) => {
			this.isConnected = false;
			logger.error(
				{
					err,
					errorName: err.name,
					errorMessage: err.message,
					errorStack: err.stack,
				},
				'❌ Redis error',
			);
		});

		this.client.on('close', () => {
			this.isConnected = false;
			logger.warn('Redis connection closed');
		});

		this.client.on('reconnecting', () => {
			logger.info('Redis reconnecting...');
		});

		// 集群模式特有事件
		if (this.client instanceof Cluster) {
			this.client.on('node error', (err, address) => {
				logger.error(
					{
						err,
						address,
						errorMessage: err.message,
					},
					'❌ Redis 集群节点错误',
				);
			});

			this.client.on('+node', (node) => {
				logger.info(
					{
						host: node.options.host,
						port: node.options.port,
					},
					'✅ Redis 集群新增节点',
				);
			});

			this.client.on('-node', (node) => {
				logger.warn(
					{
						host: node.options.host,
						port: node.options.port,
					},
					'⚠️ Redis 集群移除节点',
				);
			});
		}
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
