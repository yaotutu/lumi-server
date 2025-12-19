/**
 * AWS Redis 诊断脚本
 * 逐步测试各个功能是否正常
 */

import Redis from 'ioredis';
import { config } from './dist/config/index.js';

async function diagnoseRedis() {
  console.log('🔍 开始 AWS Redis 诊断...\n');

  const redisConfig = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    connectTimeout: 30000,
    commandTimeout: 30000,
    maxRetriesPerRequest: null,
    retryDelayOnFailover: 100,
    lazyConnect: true,
  };

  console.log('📋 Redis 配置:', {
    host: redisConfig.host,
    port: redisConfig.port,
    hasPassword: !!redisConfig.password,
    db: redisConfig.db,
    connectTimeout: `${redisConfig.connectTimeout}ms`,
    commandTimeout: `${redisConfig.commandTimeout}ms`,
  });

  let testResults = {};

  try {
    console.log('\n🧪 测试 1: 基础连接');
    const redis1 = new Redis(redisConfig);

    redis1.on('error', (error) => {
      console.log('❌ 连接错误:', error.message);
    });

    await redis1.connect();
    const pingResult = await redis1.ping();
    testResults.basicConnection = pingResult === 'PONG';
    console.log(`✅ 基础连接: ${testResults.basicConnection ? '成功' : '失败'}`);
    await redis1.quit();

    if (!testResults.basicConnection) {
      console.log('❌ 基础连接失败，无需继续测试');
      return testResults;
    }

    console.log('\n🧪 测试 2: 简单发布订阅');
    const pub = new Redis(redisConfig);
    const sub = new Redis(redisConfig);

    let messageReceived = false;

    pub.on('error', (error) => console.log('❌ Publisher 错误:', error.message));
    sub.on('error', (error) => console.log('❌ Subscriber 错误:', error.message));

    try {
      await sub.subscribe('test-simple');

      sub.on('message', (channel, message) => {
        messageReceived = true;
        console.log(`📡 收到消息: ${channel} -> ${message}`);
      });

      console.log('⏳ 等待订阅建立...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('📤 发布测试消息...');
      await pub.publish('test-simple', 'hello-test');

      console.log('⏳ 等待消息接收...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      testResults.simplePubSub = messageReceived;
      console.log(`✅ 简单发布订阅: ${testResults.simplePubSub ? '成功' : '失败'}`);

    } catch (error) {
      testResults.simplePubSub = false;
      console.log(`❌ 简单发布订阅失败: ${error.message}`);
    } finally {
      await pub.quit();
      await sub.quit();
    }

    console.log('\n🧪 测试 3: JSON 消息发布订阅（模拟 SSE）');
    const pub2 = new Redis(redisConfig);
    const sub2 = new Redis(redisConfig);

    let jsonMessageReceived = false;

    pub2.on('error', (error) => console.log('❌ Publisher2 错误:', error.message));
    sub2.on('error', (error) => console.log('❌ Subscriber2 错误:', error.message));

    try {
      await sub2.subscribe('sse:events');

      sub2.on('message', (channel, message) => {
        try {
          const parsed = JSON.parse(message);
          jsonMessageReceived = true;
          console.log(`📡 收到 JSON 消息:`, parsed);
        } catch (e) {
          console.log('❌ JSON 解析失败:', e.message);
        }
      });

      console.log('⏳ 等待 SSE 订阅建立...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const testMessage = JSON.stringify({
        taskId: 'test-task-123',
        eventType: 'test-event',
        data: { timestamp: Date.now(), test: true }
      });

      console.log('📤 发布 JSON 测试消息...');
      await pub2.publish('sse:events', testMessage);

      console.log('⏳ 等待 JSON 消息接收...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      testResults.jsonPubSub = jsonMessageReceived;
      console.log(`✅ JSON 发布订阅: ${testResults.jsonPubSub ? '成功' : '失败'}`);

    } catch (error) {
      testResults.jsonPubSub = false;
      console.log(`❌ JSON 发布订阅失败: ${error.message}`);
    } finally {
      await pub2.quit();
      await sub2.quit();
    }

    console.log('\n🧪 测试 4: 长时间连接稳定性');
    const redis4 = new Redis(redisConfig);

    redis4.on('error', (error) => {
      testResults.stability = false;
      console.log('❌ 长时间连接错误:', error.message);
    });

    try {
      await redis4.connect();

      console.log('⏳ 测试 20 秒连接稳定性...');
      const startTime = Date.now();

      while (Date.now() - startTime < 20000) {
        await redis4.ping();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      testResults.stability = true;
      console.log('✅ 长时间连接: 成功');

    } catch (error) {
      testResults.stability = false;
      console.log(`❌ 长时间连接失败: ${error.message}`);
    } finally {
      await redis4.quit();
    }

  } catch (error) {
    console.log(`❌ 诊断过程出错: ${error.message}`);
  }

  console.log('\n📊 诊断结果汇总:');
  console.log('  基础连接:', testResults.basicConnection ? '✅' : '❌');
  console.log('  简单发布订阅:', testResults.simplePubSub ? '✅' : '❌');
  console.log('  JSON 发布订阅:', testResults.jsonPubSub ? '✅' : '❌');
  console.log('  连接稳定性:', testResults.stability ? '✅' : '❌');

  return testResults;
}

diagnoseRedis().catch(console.error);