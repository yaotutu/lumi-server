/**
 * SSE (Server-Sent Events) 连接管理器
 *
 * 职责：
 * - 管理所有活跃的 SSE 连接（按 taskId 分组）
 * - 提供事件推送接口给 Worker 调用
 * - 自动清理断开的连接
 *
 * 架构：
 * - 单例模式，全局唯一实例
 * - 支持一个 taskId 对应多个客户端连接（例如多个标签页）
 */

import type { FastifyReply } from 'fastify';
import { logger } from '@/utils/logger.js';
import { ssePubSubService } from './sse-pubsub.service.js';

/**
 * SSE 事件类型
 */
export type SSEEventType =
	// 图片生成事件
	| 'image:generating' // 图片开始生成
	| 'image:completed' // 图片生成完成
	| 'image:failed' // 图片生成失败
	// 模型生成事件
	| 'model:generating' // 模型开始生成
	| 'model:progress' // 模型生成进度更新
	| 'model:completed' // 模型生成完成
	| 'model:failed' // 模型生成失败
	// 任务事件
	| 'task:init' // 任务初始状态（连接建立后立即发送）
	| 'task:updated'; // 任务状态更新（兜底）

/**
 * SSE 连接类型
 * - 每个连接对应一个客户端（浏览器标签页）
 */
interface SSEConnection {
	taskId: string; // 任务 ID
	reply: FastifyReply; // Fastify reply 对象
	connectedAt: Date; // 连接建立时间
}

/**
 * SSE 连接管理器（单例）
 */
class SSEConnectionManager {
	// 存储所有连接：Map<taskId, Set<Connection>>
	private connections = new Map<string, Set<SSEConnection>>();

	// 实例 ID（用于调试，验证是否是同一个实例）
	private readonly instanceId = Math.random().toString(36).substring(7);

	// 定时清理任务的 Timer ID
	private cleanupTimer: NodeJS.Timeout | null = null;

	// 连接超时时间（1 小时）
	private readonly CONNECTION_TIMEOUT_MS = 60 * 60 * 1000;

	// 清理检查间隔（1 分钟）
	private readonly CLEANUP_INTERVAL_MS = 60 * 1000;

	// 优雅关闭等待时间（5 秒）
	// 发送关闭通知后，等待前端主动关闭的时间
	private readonly GRACEFUL_CLOSE_WAIT_MS = 5000;

	constructor() {
		// 启动定时清理任务
		this.startCleanupTimer();
		logger.info({ msg: 'SSE 连接管理器已初始化，定时清理任务已启动' });
	}

	/**
	 * 启动定时清理任务
	 * 每分钟检查一次，清理超过 1 小时的连接
	 */
	private startCleanupTimer(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanupStaleConnections();
		}, this.CLEANUP_INTERVAL_MS);

		logger.info({
			msg: '定时清理任务已启动',
			intervalMs: this.CLEANUP_INTERVAL_MS,
			timeoutMs: this.CONNECTION_TIMEOUT_MS,
		});
	}

	/**
	 * 清理过期的连接
	 * 采用"优雅关闭 + 强制关闭"策略：
	 * 1. 先发送 connection:timeout 事件通知前端
	 * 2. 等待 5 秒让前端主动关闭
	 * 3. 如果前端没有响应（连接仍存在），强制关闭
	 */
	private cleanupStaleConnections(): void {
		const now = Date.now();
		let notifiedCount = 0;

		for (const [taskId, taskConnections] of this.connections) {
			for (const connection of taskConnections) {
				const age = now - connection.connectedAt.getTime();

				// 如果连接超过 1 小时，开始清理流程
				if (age > this.CONNECTION_TIMEOUT_MS) {
					logger.warn({
						msg: '检测到过期的 SSE 连接，开始优雅关闭流程',
						taskId,
						ageMs: age,
						ageHours: (age / (60 * 60 * 1000)).toFixed(2),
					});

					// 步骤 1: 发送关闭通知给前端
					try {
						connection.reply.raw.write('event: connection:timeout\n');
						connection.reply.raw.write(
							`data: ${JSON.stringify({
								message: '连接已超时，请主动关闭',
								ageMs: age,
								gracefulCloseWaitMs: this.GRACEFUL_CLOSE_WAIT_MS,
							})}\n\n`,
						);

						logger.info({
							msg: '已发送 connection:timeout 事件通知前端',
							taskId,
						});

						notifiedCount++;
					} catch (error) {
						// 如果发送失败，说明连接已经断开，直接移除
						logger.warn({
							msg: '发送关闭通知失败，连接可能已断开',
							taskId,
							error,
						});
						this.removeConnection(connection);
						continue;
					}

					// 步骤 2: 等待前端主动关闭（5 秒）
					setTimeout(() => {
						// 检查连接是否还存在于 Map 中
						const taskConnections = this.connections.get(taskId);
						if (!taskConnections) {
							// 任务的所有连接都已关闭
							logger.info({
								msg: '✅ 前端已主动关闭连接（任务连接集合已清空）',
								taskId,
							});
							return;
						}

						// 检查当前连接是否还在
						if (!taskConnections.has(connection)) {
							// 前端已经主动关闭了这个连接
							logger.info({
								msg: '✅ 前端已主动关闭连接',
								taskId,
							});
							return;
						}

						// 步骤 3: 连接仍然存在，说明前端没有响应，强制关闭
						logger.warn({
							msg: '⚠️ 前端未响应关闭通知，执行强制关闭',
							taskId,
							waitedMs: this.GRACEFUL_CLOSE_WAIT_MS,
						});

						try {
							connection.reply.raw.end();
						} catch (error) {
							// 忽略关闭错误
							logger.debug({
								msg: '强制关闭连接时出错（可能已关闭）',
								taskId,
								error,
							});
						}

						// 从内存中移除
						this.removeConnection(connection);

						logger.info({
							msg: '✅ 强制关闭完成',
							taskId,
						});
					}, this.GRACEFUL_CLOSE_WAIT_MS);
				}
			}
		}

		// 记录清理统计
		if (notifiedCount > 0) {
			logger.info({
				msg: '✅ 过期连接清理流程已启动',
				notifiedCount,
				gracefulCloseWaitMs: this.GRACEFUL_CLOSE_WAIT_MS,
				currentConnections: this.getStats().totalConnections,
			});
		}
	}

	/**
	 * 停止定时清理任务（用于测试或关闭服务器）
	 */
	stopCleanupTimer(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
			logger.info({ msg: '定时清理任务已停止' });
		}
	}

	/**
	 * 添加 SSE 连接
	 * @param taskId 任务 ID
	 * @param reply Fastify reply 对象
	 * @returns 连接对象
	 */
	addConnection(taskId: string, reply: FastifyReply): SSEConnection {
		// 创建连接对象
		const connection: SSEConnection = {
			taskId,
			reply,
			connectedAt: new Date(),
		};

		// 获取或创建该任务的连接集合
		if (!this.connections.has(taskId)) {
			this.connections.set(taskId, new Set());
		}

		// 添加连接
		this.connections.get(taskId)?.add(connection);

		logger.info({
			msg: 'SSE 连接已建立',
			taskId,
			processId: process.pid, // 记录进程 ID
			instanceId: this.instanceId, // 记录实例 ID
			totalConnections: this.connections.get(taskId)?.size,
		});

		return connection;
	}

	/**
	 * 移除 SSE 连接
	 * @param connection 连接对象
	 */
	removeConnection(connection: SSEConnection): void {
		const { taskId } = connection;

		// 从集合中移除
		const taskConnections = this.connections.get(taskId);
		if (taskConnections) {
			taskConnections.delete(connection);

			// 如果该任务没有连接了，删除整个集合
			if (taskConnections.size === 0) {
				this.connections.delete(taskId);
				logger.info({
					msg: '任务的所有 SSE 连接已关闭',
					taskId,
					processId: process.pid,
				});
			} else {
				logger.info({
					msg: 'SSE 连接已移除',
					taskId,
					processId: process.pid,
					remainingConnections: taskConnections.size,
				});
			}
		} else {
			logger.warn({
				msg: '尝试移除不存在的连接',
				taskId,
				processId: process.pid,
				当前所有连接: Array.from(this.connections.keys()),
			});
		}
	}

	/**
	 * 向指定任务的所有连接推送事件
	 *
	 * **重要**: 此方法通过 Redis Pub/Sub 发布事件
	 * - Worker 进程调用此方法时，事件会通过 Redis 发布
	 * - API Server 订阅 Redis 事件后，会调用 sendToLocalConnections 推送给实际的 SSE 连接
	 *
	 * @param taskId 任务 ID
	 * @param eventType 事件类型
	 * @param data 事件数据（将被序列化为 JSON）
	 */
	async broadcast(taskId: string, eventType: SSEEventType, data: unknown): Promise<void> {
		logger.info({
			msg: '📡 SSE 推送',
			requestId: taskId,
			eventType,
			dataKeys: typeof data === 'object' && data !== null ? Object.keys(data) : undefined,
		});

		try {
			// 通过 Redis Pub/Sub 发布事件
			await ssePubSubService.publish(taskId, eventType, data as Record<string, any>);
		} catch (error) {
			logger.error(
				{
					error,
					taskId,
					eventType,
				},
				'Failed to publish SSE event via Redis',
			);

			// 如果 Redis 发布失败，尝试本地推送（作为降级方案）
			this.sendToLocalConnections(taskId, eventType, data);
		}
	}

	/**
	 * 直接向本地连接推送事件（不经过 Redis）
	 *
	 * **用途**:
	 * - API Server 接收到 Redis Pub/Sub 事件后调用此方法
	 * - task:init 事件（连接建立时立即发送，不经过 Redis）
	 *
	 * @param taskId 任务 ID
	 * @param eventType 事件类型
	 * @param data 事件数据
	 */
	sendToLocalConnections(taskId: string, eventType: SSEEventType, data: unknown): void {
		const taskConnections = this.connections.get(taskId);

		if (!taskConnections || taskConnections.size === 0) {
			logger.debug({
				msg: '没有找到任务的本地 SSE 连接',
				taskId,
				eventType,
				processId: process.pid,
				instanceId: this.instanceId,
			});
			return;
		}

		logger.info({
			msg: '✅ 推送到本地 SSE 连接',
			taskId,
			eventType,
			processId: process.pid,
			instanceId: this.instanceId,
			connectionCount: taskConnections.size,
		});

		// 构造 SSE 消息
		const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

		// 向所有连接推送
		const failedConnections: SSEConnection[] = [];

		for (const connection of taskConnections) {
			try {
				connection.reply.raw.write(message);
			} catch (error) {
				logger.error({
					msg: '推送失败，连接可能已断开',
					error,
					taskId,
					eventType,
				});
				failedConnections.push(connection);
			}
		}

		// 清理失败的连接
		for (const connection of failedConnections) {
			this.removeConnection(connection);
		}
	}

	/**
	 * 发送心跳（保持连接活跃）
	 * @param connection 连接对象
	 */
	sendHeartbeat(connection: SSEConnection): void {
		try {
			connection.reply.raw.write(':keep-alive\n\n');
		} catch (error) {
			logger.error({
				msg: '心跳发送失败，连接可能已断开',
				error,
				taskId: connection.taskId,
			});
			this.removeConnection(connection);
		}
	}

	/**
	 * 获取所有活跃连接的统计信息
	 */
	getStats(): { totalTasks: number; totalConnections: number } {
		let totalConnections = 0;
		for (const taskConnections of this.connections.values()) {
			totalConnections += taskConnections.size;
		}

		return {
			totalTasks: this.connections.size,
			totalConnections,
		};
	}
}

// 导出单例实例（使用 global 确保热重载时保持同一实例）
const GLOBAL_KEY = '__sseConnectionManager__';
const globalStore = global as unknown as Record<string, SSEConnectionManager>;

if (!globalStore[GLOBAL_KEY]) {
	globalStore[GLOBAL_KEY] = new SSEConnectionManager();
	logger.info({ msg: '创建新的 SSE 连接管理器实例' });
} else {
	logger.info({ msg: '复用已有的 SSE 连接管理器实例' });
}

export const sseConnectionManager = globalStore[GLOBAL_KEY];
