/**
 * AWS MemoryDB 集群模式专用调试脚本
 * 专门测试AWS MemoryDB集群环境下的Pub/Sub问题
 */

const Redis = require('ioredis');
const { Cluster } = require('ioredis');
require('dotenv').config();

const logger = console;

function loadConfig() {
	return {
		host: process.env.REDIS_HOST,
		port: parseInt(process.env.REDIS_PORT) || 6379,
		password: process.env.REDIS_PASSWORD,
		tls: process.env.REDIS_TLS === 'true',
		clusterMode: process.env.REDIS_CLUSTER_MODE === 'true',
	};
}

class MemoryDBClusterDebugger {
	constructor() {
		this.config = loadConfig();
	}

	logSection(title) {
		logger.info('\n' + '='.repeat(70));
		logger.info(`🔍 ${title}`);
		logger.info('='.repeat(70));
	}

	// 测试1: 直接连接单个节点（忽略集群模式）
	async testDirectNodeConnection() {
		this.logSection('测试1: 直接连接单个MemoryDB节点');

		try {
			const redis = new Redis({
				host: this.config.host,
				port: this.config.port,
				password: this.config.password,
				tls: this.config.tls ? { rejectUnauthorized: false } : undefined,
				connectTimeout: 30000,
				commandTimeout: 30000,
				maxRetriesPerRequest: null,
			});

			const ping = await redis.ping();
			logger.info('✅ 直接节点连接成功:', ping);

			const info = await redis.info('server');
			logger.info('📋 服务器信息:', info.split('\r\n').slice(0, 3).join(' | '));

			// 测试订阅
			const startTime = Date.now();
			const subscribeResult = await redis.subscribe('sse:events');
			const subscribeTime = Date.now() - startTime;

			logger.info(`✅ 直接节点订阅成功: ${subscribeTime}ms, 结果: ${subscribeResult}`);

			await redis.quit();
			return { success: true, subscribeTime };

		} catch (error) {
			logger.error('❌ 直接节点连接失败:', error.message);
			return { success: false, error: error.message };
		}
	}

	// 测试2: ioredis集群模式连接
	async testClusterModeConnection() {
		this.logSection('测试2: ioredis集群模式连接');

		try {
			const tlsOptions = this.config.tls ? { rejectUnauthorized: false } : undefined;

			const cluster = new Cluster(
				[{ host: this.config.host, port: this.config.port }],
				{
					redisOptions: {
						password: this.config.password,
						tls: tlsOptions,
						connectTimeout: 30000,
						commandTimeout: 30000,
						maxRetriesPerRequest: null,
						lazyConnect: true,
					},
					enableReadyCheck: true,
					scaleReads: 'slave',
				}
			);

			cluster.on('connect', () => logger.info('   📡 集群连接成功'));
			cluster.on('error', (error) => logger.error('   ❌ 集群错误:', error.message));

			const ping = await cluster.ping();
			logger.info('✅ 集群PING成功:', ping);

			// 测试集群订阅
			const startTime = Date.now();
			const subscribePromise = new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('集群订阅超时'));
				}, 25000);

				cluster.subscribe('sse:events', (err, count) => {
					clearTimeout(timeout);
					if (err) reject(err);
					else resolve(count);
				});
			});

			const subscribeResult = await subscribePromise;
			const subscribeTime = Date.now() - startTime;

			logger.info(`✅ 集群订阅成功: ${subscribeTime}ms, 结果: ${subscribeResult}`);

			await cluster.quit();
			return { success: true, subscribeTime };

		} catch (error) {
			logger.error('❌ 集群模式连接失败:', error.message);
			return { success: false, error: error.message };
		}
	}

	// 测试3: 内存优化的集群连接
	async testOptimizedClusterConnection() {
		this.logSection('测试3: 内存优化的集群连接配置');

		try {
			const tlsOptions = this.config.tls ? { rejectUnauthorized: false } : undefined;

			// AWS MemoryDB推荐配置
			const cluster = new Cluster(
				[{ host: this.config.host, port: this.config.port }],
				{
					redisOptions: {
						password: this.config.password,
						tls: tlsOptions,
						connectTimeout: 45000,      // 增加连接超时
						commandTimeout: 45000,     // 增加命令超时
						maxRetriesPerRequest: null,
						lazyConnect: true,
						// AWS MemoryDB特殊配置
						family: 4,                  // IPv4
						keepAlive: 30000,          // 保持连接
					},
					enableReadyCheck: true,
					// 禁用一些可能导致问题的功能
					scaleReads: false,
					redisOptions: {
						password: this.config.password,
						tls: tlsOptions,
						connectTimeout: 45000,
						commandTimeout: 45000,
						maxRetriesPerRequest: null,
						lazyConnect: true,
					}
				}
			);

			const ping = await cluster.ping();
			logger.info('✅ 优化集群PING成功:', ping);

			// 测试订阅
			const startTime = Date.now();
			const subscribeResult = await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('优化集群订阅超时')), 30000);

				cluster.subscribe('sse:events', (err, count) => {
					clearTimeout(timeout);
					if (err) reject(err);
					else resolve(count);
				});
			});

			const subscribeTime = Date.now() - startTime;
			logger.info(`✅ 优化集群订阅成功: ${subscribeTime}ms, 结果: ${subscribeResult}`);

			await cluster.quit();
			return { success: true, subscribeTime };

		} catch (error) {
			logger.error('❌ 优化集群连接失败:', error.message);
			return { success: false, error: error.message };
		}
	}

	// 测试4: 发现集群节点
	async testClusterNodeDiscovery() {
		this.logSection('测试4: 集群节点发现');

		try {
			const redis = new Redis({
				host: this.config.host,
				port: this.config.port,
				password: this.config.password,
				tls: this.config.tls ? { rejectUnauthorized: false } : undefined,
				connectTimeout: 30000,
				commandTimeout: 30000,
			});

			// 获取集群节点信息
			const clusterInfo = await redis.info('cluster');
			logger.info('📋 集群信息:');
			const lines = clusterInfo.split('\r\n');
			lines.forEach(line => {
				if (line.startsWith('cluster_')) {
					logger.info(`   ${line}`);
				}
			});

			// 尝试获取节点列表
			try {
				const nodes = await redis.cluster('nodes');
				logger.info('🌐 集群节点:');
				nodes.split('\n').forEach(node => {
					if (node.trim()) {
						logger.info(`   ${node}`);
					}
				});
			} catch (nodeError) {
				logger.warn('⚠️ 无法获取集群节点信息:', nodeError.message);
			}

			await redis.quit();
			return { success: true };

		} catch (error) {
			logger.error('❌ 集群发现失败:', error.message);
			return { success: false, error: error.message };
		}
	}

	// 测试5: Pub/Sub消息传递
	async testPubSubMessageDelivery() {
		this.logSection('测试5: Pub/Sub消息传递测试');

		try {
			// 使用直接连接进行测试
			const subscriber = new Redis({
				host: this.config.host,
				port: this.config.port,
				password: this.config.password,
				tls: this.config.tls ? { rejectUnauthorized: false } : undefined,
				connectTimeout: 30000,
				commandTimeout: 30000,
			});

			const publisher = new Redis({
				host: this.config.host,
				port: this.config.port,
				password: this.config.password,
				tls: this.config.tls ? { rejectUnauthorized: false } : undefined,
				connectTimeout: 30000,
				commandTimeout: 30000,
			});

			let messageReceived = false;
			let receivedMessage = null;

			// 设置消息监听
			subscriber.on('message', (channel, message) => {
				logger.info(`📨 收到消息: ${channel}`);
				messageReceived = true;
				receivedMessage = message;
			});

			// 订阅频道
			await subscriber.subscribe('sse:events');
			logger.info('📢 订阅频道: sse:events');

			// 等待订阅生效
			await new Promise(resolve => setTimeout(resolve, 1000));

			// 发布消息
			const testMessage = JSON.stringify({
				taskId: 'memorydb-test-123',
				eventType: 'TEST_EVENT',
				data: { message: 'AWS MemoryDB集群测试' },
				timestamp: new Date().toISOString()
			});

			const publishResult = await publisher.publish('sse:events', testMessage);
			logger.info(`📤 发布消息结果: ${publishResult}`);

			// 等待消息接收
			await new Promise(resolve => setTimeout(resolve, 2000));

			const success = messageReceived && receivedMessage;
			logger.info(success ? '✅ 消息传递测试成功' : '❌ 消息未收到');
			if (receivedMessage) {
				logger.info('📨 接收到的消息:', receivedMessage.substring(0, 100) + '...');
			}

			await subscriber.quit();
			await publisher.quit();

			return { success, messageReceived };

		} catch (error) {
			logger.error('❌ 消息传递测试失败:', error.message);
			return { success: false, error: error.message };
		}
	}

	// 主测试函数
	async runAllTests() {
		logger.info('🚀 AWS MemoryDB 集群模式专项调试');
		logger.info('📋 配置信息:', this.config);

		const results = {};

		// 执行所有测试
		results.directNode = await this.testDirectNodeConnection();
		await new Promise(resolve => setTimeout(resolve, 1000));

		results.clusterMode = await this.testClusterModeConnection();
		await new Promise(resolve => setTimeout(resolve, 1000));

		results.optimizedCluster = await this.testOptimizedClusterConnection();
		await new Promise(resolve => setTimeout(resolve, 1000));

		results.nodeDiscovery = await this.testClusterNodeDiscovery();
		await new Promise(resolve => setTimeout(resolve, 1000));

		results.pubSubMessage = await this.testPubSubMessageDelivery();

		// 输出总结
		this.printSummary(results);
	}

	printSummary(results) {
		logger.info('\n' + '='.repeat(70));
		logger.info('📊 AWS MemoryDB 测试总结');
		logger.info('='.repeat(70));

		const tests = [
			{ name: '直接节点连接', key: 'directNode', unit: 'ms' },
			{ name: '集群模式连接', key: 'clusterMode', unit: 'ms' },
			{ name: '优化集群连接', key: 'optimizedCluster', unit: 'ms' },
			{ name: '节点发现', key: 'nodeDiscovery' },
			{ name: 'Pub/Sub消息传递', key: 'pubSubMessage' },
		];

		tests.forEach(test => {
			const result = results[test.key];
			const status = result.success ? '✅' : '❌';
			let timeInfo = '';

			if (result.success && result.subscribeTime) {
				timeInfo = ` (${result.subscribeTime}${test.unit})`;
			}

			logger.info(`${status} ${test.name}: ${result.success ? '成功' : result.error}${timeInfo}`);
		});

		// 提供建议
		this.generateRecommendations(results);
	}

	generateRecommendations(results) {
		logger.info('\n💡 修复建议:');

		if (!results.directNode.success) {
			logger.info('❌ 基础连接失败，请检查:');
			logger.info('   - MemoryDB集群状态');
			logger.info('   - VPC和安全组配置');
			logger.info('   - 认证信息');
			return;
		}

		if (results.directNode.success && !results.clusterMode.success) {
			logger.info('🎯 问题定位: 集群模式连接失败，但直接连接成功');
			logger.info('💡 建议解决方案:');
			logger.info('   1. 使用直接连接模式而不是集群模式');
			logger.info('   2. 检查集群配置是否正确');
			logger.info('   3. 考虑连接到主节点而非集群端点');
			return;
		}

		if (results.clusterMode.success && results.clusterMode.subscribeTime > 5000) {
			logger.info('⚠️ 集群模式订阅时间过长 (>5秒)');
			logger.info('💡 优化建议:');
			logger.info('   1. 增加连接和命令超时时间');
			logger.info('   2. 使用连接池优化');
			logger.info('   3. 考虑预热连接');
		}

		if (results.pubSubMessage.success) {
			logger.info('✅ Pub/Sub功能正常，建议在实际应用中使用与成功的测试相同的配置');
		} else {
			logger.info('❌ Pub/Sub消息传递失败，需要进一步调试');
		}
	}
}

// 执行测试
async function main() {
	const debugger = new MemoryDBClusterDebugger();

	try {
		await debugger.runAllTests();
	} catch (error) {
		logger.error('🚨 调试脚本执行失败:', error);
		process.exit(1);
	}
}

main();