/**
 * 测试下载模型文件并检查内容
 */

import AdmZip from 'adm-zip';

const TEST_MODEL_URL =
	'https://ai3d-1375240212.cos.ap-guangzhou.myqcloud.com/models/s9m4qhdb9k3qoezmto9xolys/model.obj';

async function testModelDownload() {
	console.log('📥 测试下载模型文件...\n');
	console.log('URL:', TEST_MODEL_URL);
	console.log('');

	try {
		// 1. 下载文件
		console.log('⬇️ 正在下载...');
		const response = await fetch(TEST_MODEL_URL);

		if (!response.ok) {
			throw new Error(`下载失败: HTTP ${response.status}`);
		}

		const contentType = response.headers.get('content-type');
		console.log('Content-Type:', contentType);

		// 2. 转换为 Buffer
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		console.log('文件大小:', buffer.length, 'bytes');
		console.log('文件大小:', (buffer.length / 1024).toFixed(2), 'KB');
		console.log('');

		// 3. 检查文件类型
		const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" 魔数
		console.log('是否为 ZIP 文件:', isZip);

		if (isZip) {
			console.log('\n📦 检测到 ZIP 压缩包，开始解压...\n');

			try {
				const zip = new AdmZip(buffer);
				const zipEntries = zip.getEntries();

				console.log(`找到 ${zipEntries.length} 个文件:\n`);

				for (const entry of zipEntries) {
					if (entry.isDirectory) continue;

					const extension = entry.entryName.split('.').pop()?.toLowerCase() || '';
					const size = entry.getData().length;

					console.log(`  📄 ${entry.entryName}`);
					console.log(`     扩展名: ${extension}`);
					console.log(`     大小: ${(size / 1024).toFixed(2)} KB`);
					console.log('');
				}

				// 统计文件类型
				const extensions = zipEntries
					.filter((e) => !e.isDirectory)
					.map((e) => e.entryName.split('.').pop()?.toLowerCase() || '');

				const hasObj = extensions.includes('obj');
				const hasMtl = extensions.includes('mtl');
				const hasTexture = extensions.some((ext) => ['png', 'jpg', 'jpeg'].includes(ext));

				console.log('━'.repeat(80));
				console.log('📊 文件统计:');
				console.log(`  包含 .obj: ${hasObj ? '✅ 是' : '❌ 否'}`);
				console.log(`  包含 .mtl: ${hasMtl ? '✅ 是' : '❌ 否'}`);
				console.log(`  包含纹理图片: ${hasTexture ? '✅ 是' : '❌ 否'}`);
				console.log('');

				if (hasMtl) {
					console.log('✅ 这个模型包含 MTL 文件！');
					console.log('⚠️  但数据库中 mtlUrl 为 NULL，说明 Worker 没有正确保存');
				}
			} catch (zipError) {
				console.error('❌ 解压失败:', zipError);
			}
		} else {
			console.log('\n📄 这是一个普通的 OBJ 文件（非压缩包）');
			console.log('文件头部前 200 字节:');
			console.log(buffer.subarray(0, 200).toString('utf8'));
		}
	} catch (error) {
		console.error('❌ 测试失败:', error);
	} finally {
		process.exit(0);
	}
}

testModelDownload();
