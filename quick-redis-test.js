/**
 * 快速 Redis 测试 - 无需构建，直接运行
 */

const Redis = require('ioredis');

async function quickTest() {
  console.log('🔍 快速 Redis 测试...\n');

  // 直接在这里配置
  const redisConfig = {
    host: '192.168.110.220',  // 你的 Redis 地址
    port: 6379,
    password: null,            // 如果有密码就填在这里
    db: 0,
    connectTimeout: 30000,
    commandTimeout: 30000,
  };

  console.log('📋 测试配置:', redisConfig);

  try {
    console.log('\n🧪 测试 1: 基础连接');
    const redis = new Redis(redisConfig);

    redis.on('error', (error) => {
      console.log('❌ 连接错误:', error.message);
    });

    await redis.connect();
    const pong = await redis.ping();
    console.log('✅ 基础连接:', pong);

    console.log('\n🧪 测试 2: 简单发布订阅');
    const pub = new Redis(redisConfig);
    const sub = new Redis(redisConfig);

    let messageReceived = false;

    sub.on('message', (channel, message) => {
      messageReceived = true;
      console.log('📡 收到消息:', channel, '->', message);
    });

    await sub.subscribe('test-channel');

    console.log('⏳ 等待 2 秒订阅建立...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('📤 发布测试消息...');
    await pub.publish('test-channel', 'hello-from-test');

    console.log('⏳ 等待 3 秒消息接收...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ 发布订阅测试:', messageReceived ? '成功' : '失败');

    console.log('\n🧪 测试 3: SSE 格式消息');
    let sseMessageReceived = false;

    sub.on('message', (channel, message) => {
      try {
        const parsed = JSON.parse(message);
        sseMessageReceived = true;
        console.log('📡 收到 SSE 消息:', parsed);
      } catch (e) {
        console.log('⚠️ JSON 解析失败，但消息已收到');
        sseMessageReceived = true;
      }
    });

    await sub.subscribe('sse:events');

    const sseMessage = JSON.stringify({
      taskId: 'test-123',
      eventType: 'test-event',
      data: { timestamp: Date.now() }
    });

    console.log('📤 发布 SSE 消息...');
    await pub.publish('sse:events', sseMessage);

    console.log('⏳ 等待 3 秒 SSE 消息...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ SSE 消息测试:', sseMessageReceived ? '成功' : '失败');

    // 清理连接
    await pub.quit();
    await sub.quit();
    await redis.quit();

    console.log('\n🎉 所有测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
}

quickTest();