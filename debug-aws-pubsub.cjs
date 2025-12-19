/**
 * AWS MemoryDB Pub/Sub 调试脚本
 * 用于测试AWS环境下的Pub/Sub连接问题
 */

import Redis, { Cluster } from 'ioredis';
import { config } from './dist/config/index.js';

const logger = console;

async function testAWSMemoryDBPubSub() {
	logger.info('🔍 测试 AWS MemoryDB Pub/Sub 连接...');
	logger.info('配置:', {
		host: config.redis.host,
		port: config.redis.port,
		clusterMode: config.redis.clusterMode,
		tls: config.redis.tls,
		hasPassword: !!config.redis.password
	});

	// 测试方案1：直接连接单节点（如果知道主节点地址）
	logger.info('\n=== 测试方案1：单节点连接 ===');
	try {
		const singleRedis = new Redis({
			host: config.redis.host,
			port: config.redis.port,
			password: config.redis.password,
			tls: config.redis.tls ? { rejectUnauthorized: false } : undefined,
			connectTimeout: 30000,
			commandTimeout: 30000,
		});

		singleRedis.on('connect', () => logger.info('✅ 单节点连接成功'));
		singleRedis.on('error', (error) => logger.error('❌ 单节点错误:', error.message));

		const result = await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('订阅超时')), 25000);

			singleRedis.subscribe('sse:events', (err, count) => {
				clearTimeout(timeout);
				if (err) reject(err);
				else resolve(count);
			});
		});

		logger.info('✅ 单节点订阅成功:', result);
		singleRedis.disconnect();

	} catch (error) {
		logger.error('❌ 单节点订阅失败:', error.message);
	}

	// 测试方案2：集群模式（如果配置为集群）
	if (config.redis.clusterMode) {
		logger.info('\n=== 测试方案2：集群模式 ===');
		try {
			const tlsOptions = config.redis.tls ? { rejectUnauthorized: false } : undefined;

			const cluster = new Cluster([
				{ host: config.redis.host, port: config.redis.port }
			], {
				redisOptions: {
					password: config.redis.password,
					tls: tlsOptions,
					connectTimeout: 30000,
					commandTimeout: 30000,
					maxRetriesPerRequest: null,
				},
				enableReadyCheck: true,
			});

			cluster.on('connect', () => logger.info('✅ 集群连接成功'));
			cluster.on('error', (error) => logger.error('❌ 集群错误:', error.message));

			const result = await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('集群订阅超时')), 25000);

				cluster.subscribe('sse:events', (err, count) => {
					clearTimeout(timeout);
					if (err) reject(err);
					else resolve(count);
				});
			});

			logger.info('✅ 集群订阅成功:', result);
			cluster.disconnect();

		} catch (error) {
			logger.error('❌ 集群订阅失败:', error.message);
		}
	}

	// 测试方案3：原生Redis CLI命令模拟
	logger.info('\n=== 测试方案3：基础连接测试 ===');
	try {
		const testRedis = new Redis({
			host: config.redis.host,
			port: config.redis.port,
			password: config.redis.password,
			tls: config.redis.tls ? { rejectUnauthorized: false } : undefined,
			connectTimeout: 30000,
			commandTimeout: 10000,
		});

		const ping = await testRedis.ping();
		logger.info('✅ PING 成功:', ping);

		const info = await testRedis.info('server');
		logger.info('✅ Redis 服务器信息:', info.split('\r\n').slice(0, 5).join(', '));

		// 测试基础Pub命令
		const pubResult = await testRedis.publish('test-channel', 'hello');
		logger.info('✅ PUBLISH 成功，订阅者数量:', pubResult);

		testRedis.disconnect();

	} catch (error) {
		logger.error('❌ 基础连接失败:', error.message);
	}

	logger.info('\n🏁 测试完成');
}

testAWSMemoryDBPubSub().catch(console.error);