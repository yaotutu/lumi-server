/**
 * SSE Redis Pub/Sub 服务
 *
 * 职责：
 * - 解决 API Server 和 Worker Server 进程隔离问题
 * - Worker 通过 Redis 发布事件
 * - API Server 订阅 Redis 事件并推送给 SSE 连接
 *
 * 架构：
 * Worker (进程A) → Redis Pub/Sub → API Server (进程B) → SSE 连接 → 前端
 */

import Redis from 'ioredis';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import type { SSEEventType } from './sse-connection-manager.js';

/**
 * SSE 事件消息格式
 */
export interface SSEEventMessage {
	taskId: string;
	eventType: SSEEventType;
	data: Record<string, any>;
}

/**
 * SSE Pub/Sub 频道名称
 */
const SSE_CHANNEL = 'sse:events';

/**
 * SSE Pub/Sub 服务类
 */
class SSEPubSubService {
	private publisher: Redis | null = null;
	private subscriber: Redis | null = null;
	private eventHandlers: Map<string, (message: SSEEventMessage) => void> = new Map();

	/**
	 * 初始化 Redis 连接
	 */
	async initialize(): Promise<void> {
		if (this.publisher && this.subscriber) {
			logger.warn('SSE Pub/Sub already initialized');
			return;
		}

		// 创建发布者连接 - 使用更保守的服务器配置
		this.publisher = new Redis({
			host: config.redis.host,
			port: config.redis.port,
			password: config.redis.password || undefined,
			db: config.redis.db,
			// 增加超时时间以适应服务器环境
			connectTimeout: 20000,
			commandTimeout: 20000,
			// 使用更宽松的重试配置
			maxRetriesPerRequest: null, // BullMQ 要求
			lazyConnect: true,
			// 移除可能有问题的配置以提高服务器兼容性
		});

		// 创建订阅者连接（订阅者需要独立的连接）
		this.subscriber = new Redis({
			host: config.redis.host,
			port: config.redis.port,
			password: config.redis.password || undefined,
			db: config.redis.db,
			connectTimeout: 20000,
			commandTimeout: 20000,
			maxRetriesPerRequest: null,
			lazyConnect: true,
		});

		// 监听发布者错误
		this.publisher.on('error', (error) => {
			logger.error({ error }, 'Redis publisher error');
		});

		// 监听订阅者错误
		this.subscriber.on('error', (error) => {
			logger.error({ error }, 'Redis subscriber error');
		});

		logger.info('SSE Pub/Sub service initialized');
	}

	/**
	 * 订阅 SSE 事件（API Server 调用）
	 *
	 * @param handler 事件处理函数
	 */
	async subscribe(handler: (message: SSEEventMessage) => void): Promise<void> {
		if (!this.subscriber) {
			throw new Error('SSE Pub/Sub not initialized');
		}

		// 保存处理器
		const handlerId = Math.random().toString(36).substring(7);
		this.eventHandlers.set(handlerId, handler);

		// 如果是第一次订阅，开始监听
		if (this.eventHandlers.size === 1) {
			await this.subscriber.subscribe(SSE_CHANNEL);

			this.subscriber.on('message', (channel, message) => {
				if (channel !== SSE_CHANNEL) return;

				try {
					const event: SSEEventMessage = JSON.parse(message);

					// 调用所有处理器
					for (const h of this.eventHandlers.values()) {
						try {
							h(event);
						} catch (error) {
							logger.error({ error, event }, 'SSE event handler error');
						}
					}
				} catch (error) {
					logger.error({ error, message }, 'Failed to parse SSE message');
				}
			});

			logger.info({ channel: SSE_CHANNEL }, 'Subscribed to SSE channel');
		}
	}

	/**
	 * 发布 SSE 事件（Worker 调用）
	 *
	 * @param taskId 任务 ID
	 * @param eventType 事件类型
	 * @param data 事件数据
	 */
	async publish(taskId: string, eventType: SSEEventType, data: Record<string, any>): Promise<void> {
		if (!this.publisher) {
			throw new Error('SSE Pub/Sub not initialized');
		}

		const message: SSEEventMessage = {
			taskId,
			eventType,
			data,
		};

		try {
			await this.publisher.publish(SSE_CHANNEL, JSON.stringify(message));

			logger.debug(
				{
					taskId,
					eventType,
					dataKeys: Object.keys(data),
				},
				'Published SSE event to Redis',
			);
		} catch (error) {
			logger.error({ error, taskId, eventType }, 'Failed to publish SSE event');
			throw error;
		}
	}

	/**
	 * 关闭连接
	 */
	async close(): Promise<void> {
		if (this.subscriber) {
			await this.subscriber.quit();
			this.subscriber = null;
		}

		if (this.publisher) {
			await this.publisher.quit();
			this.publisher = null;
		}

		this.eventHandlers.clear();

		logger.info('SSE Pub/Sub service closed');
	}
}

/**
 * 导出单例
 */
export const ssePubSubService = new SSEPubSubService();
