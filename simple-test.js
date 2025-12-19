// 修改这里的 Redis 地址，然后运行：node simple-test.js
const REDIS_HOST = '192.168.110.220';  // ！！！改成你的 AWS Redis 地址
const REDIS_PORT = 6379;
const REDIS_PASSWORD = null;             // 有密码就填密码

const Redis = require('ioredis');

async function test() {
  console.log('测试 Redis:', REDIS_HOST, REDIS_PORT);

  try {
    const redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      connectTimeout: 10000,
      commandTimeout: 10000,
    });

    const pong = await redis.ping();
    console.log('✅ Redis 连接成功:', pong);

    // 测试发布订阅
    const pub = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
    });

    const sub = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
    });

    let gotMessage = false;
    sub.on('message', () => {
      gotMessage = true;
      console.log('✅ 收到消息成功');
    });

    await sub.subscribe('test-channel');
    await pub.publish('test-channel', 'test');

    setTimeout(() => {
      console.log(gotMessage ? '🎉 发布订阅正常' : '❌ 发布订阅失败');

      redis.quit();
      pub.quit();
      sub.quit();
    }, 3000);

  } catch (error) {
    console.error('❌ 失败:', error.message);
  }
}

test();