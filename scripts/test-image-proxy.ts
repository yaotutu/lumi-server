/**
 * 测试图片代理功能
 *
 * 验证：
 * 1. 阿里云临时URL能否通过代理访问
 * 2. 腾讯云COS（我们的S3）能否通过代理访问
 */

// 测试URL（从数据库中获取的真实URL）
const testUrls = {
	aliyun:
		'https://bizyair-prod.oss-cn-shanghai.aliyuncs.com/outputs%2Fdc9a0257-d794-4fe7-8790-72fe9e737609_59cd0eb2fac0816348c4780ce2fef879_ComfyUI_f1de3cde_00001_.png?OSSAccessKeyId=LTAI5tPza7RAEKed35dCML5U&Expires=1765521559&Signature=XUfiAIeCeIIMTxuY7vZAJq99RVI%3D',
	// S3 URL 示例（实际使用时会有真实的S3 URL）
	s3: 'https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/images/test-request-id/0.png',
};

async function testImageProxy() {
	const apiBaseUrl = process.env.API_BASE_URL || 'http://192.168.88.100:3000';

	console.log('🧪 开始测试图片代理功能\n');

	for (const [source, imageUrl] of Object.entries(testUrls)) {
		console.log(`📋 测试 ${source} URL:`);
		console.log(`   原始URL: ${imageUrl.substring(0, 80)}...`);

		// 构建代理URL
		const proxyUrl = `${apiBaseUrl}/api/proxy/image?url=${encodeURIComponent(imageUrl)}`;
		console.log(`   代理URL: ${proxyUrl.substring(0, 80)}...`);

		try {
			// 通过代理访问
			const response = await fetch(proxyUrl);

			if (response.ok) {
				const contentType = response.headers.get('content-type');
				const contentLength = response.headers.get('content-length');
				const cors = response.headers.get('access-control-allow-origin');

				console.log(`   ✅ 代理成功`);
				console.log(`      Content-Type: ${contentType}`);
				console.log(`      Content-Length: ${contentLength} bytes`);
				console.log(`      CORS: ${cors}`);
			} else {
				console.log(`   ❌ 代理失败`);
				console.log(`      状态码: ${response.status}`);
				console.log(`      错误信息: ${response.statusText}`);

				const errorBody = await response.text();
				console.log(`      响应内容: ${errorBody}`);
			}
		} catch (error) {
			console.log(`   ❌ 请求失败`);
			console.log(`      错误: ${error instanceof Error ? error.message : String(error)}`);
		}

		console.log('');
	}

	console.log('✅ 测试完成！\n');
}

testImageProxy().catch(console.error);
