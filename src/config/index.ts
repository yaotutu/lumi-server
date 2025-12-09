import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
	// 服务器配置
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.string().default('3000'),
	HOST: z.string().default('0.0.0.0'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

	// 数据库配置
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

	// Redis 配置
	REDIS_HOST: z.string().default('localhost'),
	REDIS_PORT: z.string().default('6379'),
	REDIS_PASSWORD: z.string().optional(),
	REDIS_DB: z.string().default('0'),

	// S3 存储配置
	S3_ENDPOINT: z.string().optional(),
	S3_REGION: z.string().default('us-east-1'),
	S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
	S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
	S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
	S3_FORCE_PATH_STYLE: z
		.string()
		.transform((val) => val === 'true')
		.default('false'),

	// 阿里云文生图
	ALIYUN_IMAGE_API_KEY: z.string().optional(),
	ALIYUN_IMAGE_API_ENDPOINT: z.string().optional(),

	// 阿里云 LLM
	QWEN_API_KEY: z.string().optional(),
	QWEN_BASE_URL: z.string().optional(),
	QWEN_MODEL: z.string().default('qwen-plus'),

	// 腾讯云图生3D
	TENCENTCLOUD_SECRET_ID: z.string().optional(),
	TENCENTCLOUD_SECRET_KEY: z.string().optional(),
	TENCENTCLOUD_REGION: z.string().default('ap-guangzhou'),

	// SiliconFlow
	SILICONFLOW_API_KEY: z.string().optional(),
	SILICONFLOW_API_ENDPOINT: z.string().optional(),
	SILICONFLOW_IMAGE_MODEL: z.string().default('Qwen/Qwen-Image'),
	SILICONFLOW_LLM_BASE_URL: z.string().optional(),
	SILICONFLOW_LLM_MODEL: z.string().default('deepseek-ai/DeepSeek-V3'),

	// BullMQ 队列配置
	IMAGE_QUEUE_CONCURRENCY: z.string().default('2'),
	MODEL_QUEUE_CONCURRENCY: z.string().default('1'),
	QUEUE_JOB_TIMEOUT: z.string().default('600000'),
	QUEUE_MAX_RETRIES: z.string().default('3'),
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
	console.error('❌ 环境变量验证失败:');
	console.error(parseResult.error.format());
	process.exit(1);
}

const env = parseResult.data;

export const config = {
	env: env.NODE_ENV,
	isDevelopment: env.NODE_ENV === 'development',
	isProduction: env.NODE_ENV === 'production',
	isTest: env.NODE_ENV === 'test',

	server: {
		port: Number.parseInt(env.PORT, 10),
		host: env.HOST,
	},

	logger: {
		level: env.LOG_LEVEL,
	},

	database: {
		url: env.DATABASE_URL,
	},

	redis: {
		host: env.REDIS_HOST,
		port: Number.parseInt(env.REDIS_PORT, 10),
		password: env.REDIS_PASSWORD,
		db: Number.parseInt(env.REDIS_DB, 10),
	},

	s3: {
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
		bucket: env.S3_BUCKET,
		forcePathStyle: env.S3_FORCE_PATH_STYLE,
	},

	providers: {
		aliyun: {
			image: {
				apiKey: env.ALIYUN_IMAGE_API_KEY,
				endpoint: env.ALIYUN_IMAGE_API_ENDPOINT,
			},
		},
		qwen: {
			apiKey: env.QWEN_API_KEY,
			baseUrl: env.QWEN_BASE_URL,
			model: env.QWEN_MODEL,
		},
		tencent: {
			secretId: env.TENCENTCLOUD_SECRET_ID,
			secretKey: env.TENCENTCLOUD_SECRET_KEY,
			region: env.TENCENTCLOUD_REGION,
		},
		siliconflow: {
			apiKey: env.SILICONFLOW_API_KEY,
			image: {
				endpoint: env.SILICONFLOW_API_ENDPOINT,
				model: env.SILICONFLOW_IMAGE_MODEL,
			},
			llm: {
				baseUrl: env.SILICONFLOW_LLM_BASE_URL,
				model: env.SILICONFLOW_LLM_MODEL,
			},
		},
	},

	queue: {
		imageConcurrency: Number.parseInt(env.IMAGE_QUEUE_CONCURRENCY, 10),
		modelConcurrency: Number.parseInt(env.MODEL_QUEUE_CONCURRENCY, 10),
		jobTimeout: Number.parseInt(env.QUEUE_JOB_TIMEOUT, 10),
		maxRetries: Number.parseInt(env.QUEUE_MAX_RETRIES, 10),
	},
} as const;
