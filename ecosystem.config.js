// PM2 配置文件 - 后端服务（API + Workers）
//
// 注意：所有环境变量从 .env 文件读取
// 确保在启动前已配置好 .env 文件
module.exports = {
  apps: [
    // API 服务器
    {
      name: 'lumi-api', // 进程名称
      script: 'npm', // 使用 npm 启动
      args: 'run start:api', // 对应 package.json 中的 "start:api": "node dist/server.js"
      instances: 1, // 实例数量（可以设置为 2 或更多利用多核）
      exec_mode: 'fork', // 执行模式
      env: {
        NODE_ENV: 'production', // 环境变量：生产模式
        // 其他环境变量（DATABASE_URL、REDIS配置、API密钥等）会自动从 .env 文件读取
      },
      error_file: './logs/api-error.log', // 错误日志文件
      out_file: './logs/api-out.log', // 输出日志文件
      log_date_format: 'YYYY-MM-DD HH:mm:ss', // 日志时间格式
      autorestart: true, // 自动重启
      watch: false, // 生产环境不需要文件监听
      max_memory_restart: '1G', // 内存超过 1G 自动重启
      merge_logs: true, // 合并日志
    },
    // Workers（处理图片生成和模型生成任务）
    {
      name: 'lumi-workers', // 进程名称
      script: 'npm', // 使用 npm 启动
      args: 'run start:workers', // 对应 package.json 中的 "start:workers": "node dist/workers/start-workers.js"
      instances: 1, // Workers 只需单实例
      exec_mode: 'fork', // 执行模式
      env: {
        NODE_ENV: 'production', // 环境变量：生产模式
        // 其他环境变量（DATABASE_URL、REDIS配置、API密钥等）会自动从 .env 文件读取
      },
      error_file: './logs/workers-error.log', // 错误日志文件
      out_file: './logs/workers-out.log', // 输出日志文件
      log_date_format: 'YYYY-MM-DD HH:mm:ss', // 日志时间格式
      autorestart: true, // 自动重启
      watch: false, // 生产环境不需要文件监听
      max_memory_restart: '1G', // 内存超过 1G 自动重启
      merge_logs: true, // 合并日志
    },
  ],
};
