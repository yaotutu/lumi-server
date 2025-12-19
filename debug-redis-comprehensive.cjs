/**
 * 综合Redis连接调试脚本
 * 用于测试本地和AWS环境下的各种Redis配置和Pub/Sub行为
 *
 * 使用方法:
 * 1. 本地测试: npm run build && node debug-redis-comprehensive.cjs
 * 2. AWS测试: cp .env.remote .env && npm run build && node debug-redis-comprehensive.cjs
 */

const Redis = require('ioredis');
const { Cluster } = require('ioredis');

// 加载环境变量和配置
require('dotenv').config();

function loadConfig() {
	const config = {
		redis: {
			host: process.env.REDIS_HOST || 'localhost',
			port: parseInt(process.env.REDIS_PORT) || 6379,
			password: process.env.REDIS_PASSWORD || undefined,
			db: parseInt(process.env.REDIS_DB) || 0,
			tls: process.env.REDIS_TLS === 'true',
			clusterMode: process.env.REDIS_CLUSTER_MODE === 'true',
		}
	};
	return config;
}

const logger = console;

class RedisDebugger {
	constructor() {
		this.config = null;
		this.testResults = {};
	}

	logSection(title) {
		logger.info('\n' + '='.repeat(60));
		logger.info(`🔍 ${title}`);
		logger.info('='.repeat(60));
	}

	logTestResult(testName, success, message, data = {}) {
		this.testResults[testName] = { success, message, data };
		const status = success ? '✅' : '❌';
		logger.info(`${status} ${testName}: ${message}`);
		if (Object.keys(data).length > 0) {
			logger.info('   数据:', JSON.stringify(data, null, 2));
		}
	}

	async sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	// 测试1: 基础Redis连接
	async testBasicConnection(name, redisConfig) {
		this.logSection(`测试 ${name}: 基础连接`);

		try {
			const redis = new Redis(redisConfig);

			redis.on('connect', () => logger.info('   📡 事件: 连接成功'));
			redis.on('ready', () => logger.info('   📡 事件: 连接就绪'));
			redis.on('error', (error) => logger.error('   ❌ 事件: 连接错误:', error.message));

			await this.sleep(1000); // 等待连接事件

			const ping = await redis.ping();
			this.logTestResult(`${name}-ping`, true, 'PING成功', { result: ping });

			const info = await redis.info('server');
			const serverInfo = {
				version: info.match(/redis_version:([^\r\n]+)/)?.[1],
				mode: info.match(/redis_mode:([^\r\n]+)/)?.[1],
				role: info.match(/role:([^\r\n]+)/)?.[1],
				uptime: info.match(/uptime_in_seconds:([^\r\n]+)/)?.[1]
			};
			this.logTestResult(`${name}-info`, true, '服务器信息获取成功', serverInfo);

			await redis.quit();
			return true;

		} catch (error) {
			this.logTestResult(`${name}-basic`, false, `基础连接失败: ${error.message}`);
			return false;
		}
	}

	// 测试2: Redis发布功能
	async testPublish(name, redisConfig) {
		this.logSection(`测试 ${name}: 发布功能`);

		try {
			const publisher = new Redis(redisConfig);

			const publishResult = await publisher.publish('test-channel', 'hello-world');
			this.logTestResult(`${name}-publish`, true, '发布成功', {
				channel: 'test-channel',
				message: 'hello-world',
				subscriberCount: publishResult
			});

			await publisher.quit();
			return true;

		} catch (error) {
			this.logTestResult(`${name}-publish`, false, `发布失败: ${error.message}`);
			return false;
		}
	}

	// 测试3: Redis订阅功能（关键测试）
	async testSubscribe(name, redisConfig, timeoutMs = 25000) {
		this.logSection(`测试 ${name}: 订阅功能（关键测试）`);

		return new Promise(async (resolve) => {
			let testCompleted = false;
			const timeout = setTimeout(() => {
				if (!testCompleted) {
					testCompleted = true;
					this.logTestResult(`${name}-subscribe`, false, `订阅超时 (${timeoutMs}ms)`);
					subscriber.disconnect();
					resolve(false);
				}
			}, timeoutMs);

			try {
				const subscriber = new Redis(redisConfig);

				subscriber.on('connect', () => logger.info('   📡 订阅者: 连接成功'));
				subscriber.on('ready', () => logger.info('   📡 订阅者: 连接就绪'));
				subscriber.on('error', (error) => logger.error('   ❌ 订阅者错误:', error.message));

				// 设置消息监听
				subscriber.on('message', (channel, message) => {
					logger.info(`   📨 收到消息: ${channel} -> ${message}`);
				});

				// 执行订阅
				const startTime = Date.now();
				const subscribeResult = await subscriber.subscribe('sse:events', 'test-channel');
				const subscribeTime = Date.now() - startTime;

				if (!testCompleted) {
					testCompleted = true;
					clearTimeout(timeout);

					this.logTestResult(`${name}-subscribe`, true, '订阅成功', {
						subscribeResult,
						subscribeTime: `${subscribeTime}ms`,
						channels: ['sse:events', 'test-channel']
					});

					// 测试消息接收
					const publisher = new Redis(redisConfig);
					await publisher.publish('test-channel', 'test-message-123');
					await this.sleep(1000);
					await publisher.quit();

					await subscriber.quit();
					resolve(true);
				}

			} catch (error) {
				if (!testCompleted) {
					testCompleted = true;
					clearTimeout(timeout);
					this.logTestResult(`${name}-subscribe`, false, `订阅失败: ${error.message}`);
					resolve(false);
				}
			}
		});
	}

	// 测试4: 完整的Pub/Sub流程
	async testFullPubSub(name, redisConfig) {
		this.logSection(`测试 ${name}: 完整Pub/Sub流程`);

		try {
			// 创建订阅者
			const subscriber = new Redis(redisConfig);
			let messageReceived = false;

			subscriber.on('message', (channel, message) => {
				logger.info(`   📨 收到消息: ${channel} -> ${message}`);
				if (message.includes('lumi-test-456')) {
					messageReceived = true;
				}
			});

			// 订阅频道
			await subscriber.subscribe('sse:events');
			logger.info('   📢 订阅频道: sse:events');

			// 等待订阅生效
			await this.sleep(1000);

			// 创建发布者并发送消息
			const publisher = new Redis(redisConfig);
			const testMessage = JSON.stringify({
				taskId: 'test-task-123',
				eventType: 'TEST_EVENT',
				data: { message: 'lumi-test-456' },
				timestamp: new Date().toISOString()
			});

			const publishResult = await publisher.publish('sse:events', testMessage);
			logger.info(`   📤 发布消息，订阅者数量: ${publishResult}`);

			// 等待消息接收
			await this.sleep(2000);

			// 清理连接
			await publisher.quit();
			await subscriber.quit();

			this.logTestResult(`${name}-full-pubsub`, messageReceived,
				messageReceived ? '完整Pub/Sub流程成功' : '消息未收到');

			return messageReceived;

		} catch (error) {
			this.logTestResult(`${name}-full-pubsub`, false, `完整Pub/Sub失败: ${error.message}`);
			return false;
		}
	}

	// 主测试函数
	async runAllTests() {
		logger.info('🚀 开始综合Redis连接调试');
		logger.info('📋 配置信息:', {
			host: this.config.host,
			port: this.config.port,
			db: this.config.db,
			tls: this.config.tls,
			clusterMode: this.config.clusterMode,
			hasPassword: !!this.config.password
		});

		// 配置1: 单节点模式
		const singleNodeConfig = {
			host: this.config.host,
			port: this.config.port,
			password: this.config.password || undefined,
			db: this.config.db,
			tls: this.config.tls ? { rejectUnauthorized: false } : undefined,
			connectTimeout: 30000,
			commandTimeout: 30000,
			maxRetriesPerRequest: null,
			lazyConnect: true,
		};

		// 配置2: 集群模式
		const clusterConfig = {
			nodes: [{ host: this.config.host, port: this.config.port }],
			options: {
				redisOptions: {
					password: this.config.password,
					tls: this.config.tls ? { rejectUnauthorized: false } : undefined,
					connectTimeout: 30000,
					commandTimeout: 30000,
					maxRetriesPerRequest: null,
					lazyConnect: true,
				},
				enableReadyCheck: true,
			}
		};

		// 测试单节点模式
		if (this.config.clusterMode) {
			logger.info('\n🌐 环境检测: 集群模式（AWS MemoryDB）');
		} else {
			logger.info('\n🏠 环境检测: 单节点模式（本地Redis）');
		}

		// 总是测试单节点连接
		await this.testBasicConnection('单节点模式', singleNodeConfig);
		await this.testPublish('单节点模式', singleNodeConfig);
		await this.testSubscribe('单节点模式', singleNodeConfig);
		await this.testFullPubSub('单节点模式', singleNodeConfig);

		// 如果是集群模式，也测试集群连接
		if (this.config.clusterMode) {
			await this.sleep(1000);

			this.logSection('测试集群模式连接');
			try {
				const cluster = new Cluster(clusterConfig.nodes, clusterConfig.options);

				// 基础连接测试
				const ping = await cluster.ping();
				this.logTestResult('集群模式-ping', true, '集群PING成功', { result: ping });

				// 发布测试
				const publishResult = await cluster.publish('test-channel', 'cluster-test');
				this.logTestResult('集群模式-publish', true, '集群发布成功', {
					channel: 'test-channel',
					subscriberCount: publishResult
				});

				// 订阅测试
				const subscribePromise = new Promise((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('集群订阅超时')), 25000);

					cluster.subscribe('sse:events', (err, count) => {
						clearTimeout(timeout);
						if (err) reject(err);
						else resolve(count);
					});
				});

				const subscribeResult = await subscribePromise;
				this.logTestResult('集群模式-subscribe', true, '集群订阅成功', { subscribeResult });

				await cluster.quit();

			} catch (error) {
				this.logTestResult('集群模式-connection', false, `集群连接失败: ${error.message}`);
			}
		}

		// 输出测试总结
		this.printSummary();
	}

	printSummary() {
		logger.info('\n' + '='.repeat(60));
		logger.info('📊 测试总结');
		logger.info('='.repeat(60));

		const testNames = Object.keys(this.testResults);
		const successCount = testNames.filter(name => this.testResults[name].success).length;
		const totalCount = testNames.length;

		logger.info(`\n🎯 成功率: ${successCount}/${totalCount} (${Math.round(successCount/totalCount*100)}%)`);

		// 按类型分类结果
		const categories = {
			'基础连接': [],
			'发布功能': [],
			'订阅功能': [],
			'完整流程': []
		};

		testNames.forEach(name => {
			if (name.includes('ping') || name.includes('basic') || name.includes('info')) {
				categories['基础连接'].push(name);
			} else if (name.includes('publish')) {
				categories['发布功能'].push(name);
			} else if (name.includes('subscribe')) {
				categories['订阅功能'].push(name);
			} else if (name.includes('full')) {
				categories['完整流程'].push(name);
			}
		});

		Object.entries(categories).forEach(([category, tests]) => {
			if (tests.length > 0) {
				logger.info(`\n📂 ${category}:`);
				tests.forEach(name => {
					const result = this.testResults[name];
					const status = result.success ? '✅' : '❌';
					logger.info(`   ${status} ${name}: ${result.message}`);
				});
			}
		});

		// 关键问题诊断
		this.diagnoseIssues();
	}

	diagnoseIssues() {
		logger.info('\n🔍 问题诊断:');

		const issues = [];

		// 检查订阅问题
		const subscribeTests = Object.keys(this.testResults).filter(name => name.includes('subscribe'));
		const failedSubscribeTests = subscribeTests.filter(name => !this.testResults[name].success);

		if (failedSubscribeTests.length > 0) {
			issues.push({
				type: '订阅问题',
				severity: 'HIGH',
				description: 'Redis订阅功能失败，这会导致SSE功能无法工作',
				failedTests: failedSubscribeTests,
				suggestions: [
					'检查Redis服务器配置',
					'验证网络连接',
					'检查TLS配置',
					'确认Redis版本支持Pub/Sub',
					'检查集群模式配置'
				]
			});
		}

		// 检查连接问题
		const connectionTests = Object.keys(this.testResults).filter(name =>
			name.includes('ping') || name.includes('basic')
		);
		const failedConnectionTests = connectionTests.filter(name => !this.testResults[name].success);

		if (failedConnectionTests.length > 0) {
			issues.push({
				type: '连接问题',
				severity: 'CRITICAL',
				description: '无法建立Redis连接',
				failedTests: failedConnectionTests,
				suggestions: [
					'检查Redis服务器是否运行',
					'验证主机和端口配置',
					'检查防火墙设置',
					'验证认证信息'
				]
			});
		}

		// 输出诊断结果
		if (issues.length === 0) {
			logger.info('✅ 未发现关键问题，所有测试通过');
		} else {
			issues.forEach((issue, index) => {
				logger.info(`\n❌ 问题 ${index + 1}: ${issue.type} (${issue.severity})`);
				logger.info(`   描述: ${issue.description}`);
				logger.info(`   失败测试: ${issue.failedTests.join(', ')}`);
				logger.info(`   建议解决方案:`);
				issue.suggestions.forEach((suggestion, i) => {
					logger.info(`     ${i + 1}. ${suggestion}`);
				});
			});
		}

		// 环境特定建议
		if (this.config.clusterMode) {
			logger.info('\n🌐 AWS MemoryDB集群特定建议:');
			logger.info('   1. 确保使用正确的TLS配置');
			logger.info('   2. 检查VPC和安全组设置');
			logger.info('   3. 验证MemoryDB集群状态');
			logger.info('   4. 考虑连接到特定节点而非集群端点');
		} else {
			logger.info('\n🏠 本地Redis特定建议:');
			logger.info('   1. 确保Redis服务器正在运行');
			logger.info('   2. 检查本地防火墙设置');
			logger.info('   3. 验证Redis配置文件');
		}
	}
}

// 执行测试
async function main() {
	const config = loadConfig();
	const redisDebugger = new RedisDebugger();
	redisDebugger.config = config.redis;

	logger.info('🎯 加载配置完成:', {
		host: config.redis.host,
		port: config.redis.port,
		clusterMode: config.redis.clusterMode,
		tls: config.redis.tls
	});

	try {
		await redisDebugger.runAllTests();
	} catch (error) {
		logger.error('🚨 调试脚本执行失败:', error);
		process.exit(1);
	}
}

main();