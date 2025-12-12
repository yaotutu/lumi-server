/**
 * 配置腾讯云 COS（S3）的 CORS 规则
 *
 * 确保前端可以直接访问S3中的图片和模型文件
 */
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../src/config/index.js';
import { logger } from '../src/utils/logger.js';

async function configureS3Cors() {
	const s3Client = new S3Client({
		endpoint: config.s3.endpoint,
		region: config.s3.region,
		credentials: {
			accessKeyId: config.s3.accessKeyId,
			secretAccessKey: config.s3.secretAccessKey,
		},
		forcePathStyle: config.s3.forcePathStyle,
	});

	const corsConfiguration = {
		CORSRules: [
			{
				// 允许所有来源访问（生产环境应该限制为特定域名）
				AllowedOrigins: ['*'],
				AllowedMethods: ['GET', 'HEAD'],
				AllowedHeaders: ['*'],
				ExposeHeaders: [
					'ETag',
					'Content-Type',
					'Content-Length',
					'Last-Modified',
				],
				MaxAgeSeconds: 3600, // 预检请求缓存1小时
			},
		],
	};

	try {
		logger.info('⏳ 正在配置 S3 CORS 规则...');

		const command = new PutBucketCorsCommand({
			Bucket: config.s3.bucket,
			CORSConfiguration: corsConfiguration,
		});

		await s3Client.send(command);

		logger.info({
			msg: '✅ S3 CORS 配置成功',
			bucket: config.s3.bucket,
			corsRules: corsConfiguration.CORSRules,
		});

		console.log('\n✅ CORS 配置已应用到 S3 存储桶！');
		console.log('前端现在可以直接访问 S3 中的图片和模型文件。\n');
		console.log('CORS 规则：');
		console.log(JSON.stringify(corsConfiguration, null, 2));
	} catch (error) {
		logger.error({
			msg: '❌ 配置 S3 CORS 失败',
			error: error instanceof Error ? error.message : String(error),
		});

		console.error('\n❌ 配置失败！');
		console.error('错误信息:', error);
		console.error('\n请确认：');
		console.error('1. S3 凭证正确（ACCESS_KEY_ID, SECRET_ACCESS_KEY）');
		console.error('2. 有权限修改存储桶配置');
		console.error('3. S3 endpoint 和 region 配置正确');

		process.exit(1);
	}

	process.exit(0);
}

configureS3Cors();
