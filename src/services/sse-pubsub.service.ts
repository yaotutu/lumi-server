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
	private isSubscribed = false; // 添加订阅状态标记

	/**
	 * 初始化 Redis 连接（完整版本 - 用于 API Server）
	 */
	async initialize(): Promise<void> {
		logger.info('🚀 开始初始化 SSE Pub/Sub 服务 (完整模式)...');
		const redisConfig = {
			host: config.redis.host,
			port: config.redis.port,
			db: config.redis.db,
			hasPassword: !!config.redis.password,
			connectTimeout: '20000ms',
			commandTimeout: '20000ms',
		};
		logger.info('📋 Redis 配置: ' + JSON.stringify(redisConfig));

		if (this.publisher && this.subscriber) {
			logger.warn('⚠️ SSE Pub/Sub 已经初始化，跳过重复初始化');
			return;
		}

		// 创建发布者连接 - 使用更保守的服务器配置
		logger.info('📡 创建 Redis Publisher 连接...');
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

		// 监听发布者连接事件
		this.publisher.on('connect', () => {
			logger.info('✅ Redis Publisher 连接成功');
		});

		this.publisher.on('ready', () => {
			logger.info('✅ Redis Publisher 就绪');
		});

		this.publisher.on('close', () => {
			logger.warn('⚠️ Redis Publisher 连接关闭');
		});

		this.publisher.on('reconnecting', () => {
			logger.info('🔄 Redis Publisher 重新连接中...');
		});

		this.publisher.on('error', (error) => {
			logger.error({
				error: error.message,
				errorName: error.name,
				errorStack: error.stack?.substring(0, 500) // 限制堆栈长度
			}, '❌ Redis Publisher 错误');
		});

		// 创建订阅者连接（订阅者需要独立的连接）
		logger.info('📡 创建 Redis Subscriber 连接...');
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

		// 监听订阅者连接事件
		this.subscriber.on('connect', () => {
			logger.info('✅ Redis Subscriber 连接成功');
		});

		this.subscriber.on('ready', () => {
			logger.info('✅ Redis Subscriber 就绪');
		});

		this.subscriber.on('close', () => {
			logger.warn('⚠️ Redis Subscriber 连接关闭');
		});

		this.subscriber.on('reconnecting', () => {
			logger.info('🔄 Redis Subscriber 重新连接中...');
		});

		this.subscriber.on('error', (error) => {
			logger.error({
				error: error.message,
				errorName: error.name,
				errorStack: error.stack?.substring(0, 500) // 限制堆栈长度
			}, '❌ Redis Subscriber 错误');
		});

		logger.info('✅ SSE Pub/Sub 服务初始化完成 (完整模式 - publisher + subscriber)');
	}

	/**
	 * 仅初始化发布者连接（用于 Worker 进程）
	 * Worker 进程只需要发送消息，不需要订阅
	 */
	async initializePublisherOnly(): Promise<void> {
		if (this.publisher) {
			logger.warn('SSE publisher already initialized');
			return;
		}

		// 只创建发布者连接 - 使用更保守的服务器配置
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

		// 监听发布者错误
		this.publisher.on('error', (error) => {
			logger.error({ error }, 'Redis publisher error');
		});

		logger.info('SSE Pub/Sub service initialized (publisher only - Worker mode)');
	}

	/**
	 * 订阅 SSE 事件（API Server 调用）
	 *
	 * @param handler 事件处理函数
	 */
	async subscribe(handler: (message: SSEEventMessage) => void): Promise<void> {
		logger.info('🔔 开始订阅 SSE 事件...');

		if (!this.subscriber) {
			const error = new Error('SSE Pub/Sub not initialized - subscriber is null');
			logger.error({ error: error.message }, '❌ SSE 订阅失败: 服务未初始化');
			throw error;
		}

		// 检查 subscriber 连接状态
		logger.info('📡 检查 Subscriber 连接状态...');
		const subscriberStatus = this.subscriber.status;
		logger.info('📊 Subscriber 状态: ' + subscriberStatus);

		if (subscriberStatus !== 'ready') {
			logger.warn('⚠️ Subscriber 状态不是 ready，当前状态: ' + subscriberStatus);
		}

		// 保存处理器
		const handlerId = Math.random().toString(36).substring(7);
		this.eventHandlers.set(handlerId, handler);
		logger.info(`📝 注册事件处理器 ID: ${handlerId}，总处理器数量: ${this.eventHandlers.size}`);

		// 如果是第一次订阅，设置消息监听器（只设置一次！）
		if (this.eventHandlers.size === 1) {
			logger.info('🔍 首次订阅，设置消息监听器...');

			// 设置消息监听器（只设置一次）
			this.subscriber.on('message', (channel, message) => {
				const timestamp = new Date().toISOString();
				logger.debug({
					timestamp,
					channel,
					messageLength: message?.length || 0,
					messagePreview: message?.substring(0, 100)
				}, '📡 收到 Redis 消息');

				if (channel !== SSE_CHANNEL) {
					logger.warn({
						timestamp,
						expectedChannel: SSE_CHANNEL,
						actualChannel: channel
					}, '⚠️ 收到非预期的频道消息');
					return;
				}

				try {
					const event: SSEEventMessage = JSON.parse(message);
					logger.info({
						timestamp,
						taskId: event.taskId,
						eventType: event.eventType,
						dataKeys: Object.keys(event.data || {})
					}, '🎯 解析 SSE 事件成功');

					// 调用所有处理器
					const handlerCount = this.eventHandlers.size;
					let successCount = 0;
					let errorCount = 0;

					for (const [handlerId, h] of this.eventHandlers.entries()) {
						try {
							h(event);
							successCount++;
							logger.debug(`✅ 处理器 ${handlerId} 执行成功`);
						} catch (err) {
							errorCount++;
							const error = err as Error;
							logger.error({
								timestamp,
								handlerId,
								error: error.message,
								errorName: error.name,
								event
							}, '❌ SSE 事件处理器执行失败');
						}
					}

					logger.info({
						timestamp,
						handlerCount,
						successCount,
						errorCount
					}, '📊 SSE 事件处理器执行统计');

				} catch (err) {
					const error = err as Error;
					logger.error({
						timestamp,
						error: error.message,
						errorName: error.name,
						message: message?.substring(0, 200) // 限制消息长度
					}, '❌ 解析 SSE 消息失败');
				}
			});

			logger.info({ channel: SSE_CHANNEL }, '✅ SSE 消息监听器设置完成');
		} else {
			logger.info(`📝 已有 ${this.eventHandlers.size} 个处理器，跳过重复设置监听器`);
		}

		// 订阅频道
		logger.info(`📢 准备订阅频道: ${SSE_CHANNEL}`);

		try {
			// 增加订阅超时时间以适应 AWS 环境
			const subscribePromise = this.subscriber.subscribe(SSE_CHANNEL);
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => {
					reject(new Error('SSE 订阅超时 (30秒) - 可能的原因:\n' +
						   '1. AWS MemoryDB 连接建立需要更长时间\n' +
						   '2. 网络延迟较高\n' +
						   '3. Redis 服务器负载高\n' +
						   '4. 安全组或 VPC 配置问题'));
				}, 30000); // 30秒超时
			});

			const subscribeResult = await Promise.race([subscribePromise, timeoutPromise]);
			this.isSubscribed = true;

			logger.info({
				channel: SSE_CHANNEL,
				subscribeResult,
				handlersCount: this.eventHandlers.size,
				timestamp: new Date().toISOString()
			}, '✅ SSE 频道订阅成功 (超时修复版)');

		} catch (err) {
			const error = err as Error;
			logger.error({
				channel: SSE_CHANNEL,
				error: error.message,
				errorName: error.name,
				errorStack: error.stack?.substring(0, 500),
				handlersCount: this.eventHandlers.size,
				subscriberStatus: this.subscriber?.status,
				timestamp: new Date().toISOString(),
				fixAttempted: true
			}, '❌ SSE 频道订阅失败 (使用超时修复)');

			// 不抛出错误，而是记录并继续
			logger.warn('⚠️ SSE 订阅失败但不阻止服务器启动，将在后台重试');
			this.isSubscribed = false;

			// 5秒后自动重试
			setTimeout(async () => {
				try {
					logger.info('🔄 后台重试 SSE 订阅...');
					if (this.subscriber) {
						await this.subscriber.subscribe(SSE_CHANNEL);
						this.isSubscribed = true;
						logger.info('✅ 后台 SSE 订阅重试成功');
					} else {
						logger.warn('❌ Subscriber 连接已丢失，无法重试');
					}
				} catch (retryError) {
					const error = retryError as Error;
					logger.error({
						error: error.message,
						errorName: error.name,
						timestamp: new Date().toISOString()
					}, '❌ 后台 SSE 订阅重试也失败');
				}
			}, 5000);
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
		logger.info({
			timestamp: new Date().toISOString(),
			taskId,
			eventType,
			dataKeys: Object.keys(data)
		}, '📤 准备发布 SSE 事件...');

		if (!this.publisher) {
			const error = new Error('SSE Pub/Sub not initialized - publisher is null');
			logger.error({
				timestamp: new Date().toISOString(),
				error: error.message,
				taskId,
				eventType
			}, '❌ SSE 发布失败: 服务未初始化');
			throw error;
		}

		// 检查 publisher 连接状态
		const publisherStatus = this.publisher.status;
		logger.debug({
			timestamp: new Date().toISOString(),
			taskId,
			publisherStatus
		}, '📊 Publisher 状态检查');

		const message: SSEEventMessage = {
			taskId,
			eventType,
			data,
		};

		const messageString = JSON.stringify(message);
		logger.debug({
			timestamp: new Date().toISOString(),
			taskId,
			eventType,
			messageLength: messageString.length,
			messagePreview: messageString.substring(0, 100)
		}, '📝 SSE 消息序列化完成');

		try {
			logger.debug({
				timestamp: new Date().toISOString(),
				channel: SSE_CHANNEL,
				taskId,
				eventType
			}, '🚀 开始发布到 Redis...');

			const publishResult = await this.publisher.publish(SSE_CHANNEL, messageString);

			logger.info({
				timestamp: new Date().toISOString(),
				channel: SSE_CHANNEL,
				taskId,
				eventType,
				publishResult,
				messageLength: messageString.length
			}, '✅ SSE 事件发布成功');

		} catch (err) {
			const error = err as Error;
			logger.error({
				timestamp: new Date().toISOString(),
				channel: SSE_CHANNEL,
				error: error.message,
				errorName: error.name,
				errorStack: error.stack?.substring(0, 500),
				taskId,
				eventType,
				messageLength: messageString.length
			}, '❌ SSE 事件发布失败');
			throw error;
		}
	}

	/**
	 * 关闭连接
	 */
	async close(): Promise<void> {
		logger.info('🔚 开始关闭 SSE Pub/Sub 服务...');

		const handlerCount = this.eventHandlers.size;
		logger.info(`📊 当前有 ${handlerCount} 个事件处理器需要清理`);

		if (this.subscriber) {
			logger.info('📡 关闭 Subscriber 连接...');
			try {
				await this.subscriber.quit();
				this.subscriber = null;
				logger.info('✅ Subscriber 连接已关闭');
			} catch (err) {
				const error = err as Error;
				logger.error({
					error: error.message,
					errorName: error.name
				}, '❌ 关闭 Subscriber 连接时出错');
			}
		} else {
			logger.info('⚠️ Subscriber 连接不存在，跳过关闭');
		}

		if (this.publisher) {
			logger.info('📡 关闭 Publisher 连接...');
			try {
				await this.publisher.quit();
				this.publisher = null;
				logger.info('✅ Publisher 连接已关闭');
			} catch (err) {
				const error = err as Error;
				logger.error({
					error: error.message,
					errorName: error.name
				}, '❌ 关闭 Publisher 连接时出错');
			}
		} else {
			logger.info('⚠️ Publisher 连接不存在，跳过关闭');
		}

		this.eventHandlers.clear();
		const previousSubscribed = this.isSubscribed;
		this.isSubscribed = false;

		logger.info({
			timestamp: new Date().toISOString(),
			handlerCount,
			wasSubscribed: previousSubscribed
		}, '✅ SSE Pub/Sub 服务关闭完成');
	}
}

/**
 * 导出单例
 */
export const ssePubSubService = new SSEPubSubService();
