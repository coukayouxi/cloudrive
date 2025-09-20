const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const SFTPManager = require('./sftp-client');

const app = express();
const port = process.env.PORT || 3000;

// 配置 multer 用于文件上传
const upload = multer({ dest: 'uploads/' });

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 创建 SFTP 管理器实例
const sftpManager = new SFTPManager();

// 定期检查并保持SFTP连接活跃
setInterval(async () => {
  try {
    // 这里我们不主动断开连接，而是让连接保持活跃
    // 只有在需要时才检查连接状态
  } catch (error) {
    console.error('连接维护错误:', error);
  }
}, 30000); // 每30秒检查一次

// 路由

// 获取文件列表
app.get('/api/files', async (req, res) => {
  try {
    const { path = '/' } = req.query;
    const files = await sftpManager.listFiles(path);
    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建目录
app.post('/api/directory', async (req, res) => {
  try {
    const { path } = req.body;
    const result = await sftpManager.createDirectory(path);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除文件/目录
app.delete('/api/file', async (req, res) => {
  try {
    const { path } = req.body;
    console.log('删除文件请求:', path);
    
    if (!path) {
      return res.status(400).json({ success: false, message: '路径参数缺失' });
    }
    
    const result = await sftpManager.deleteFile(path);
    console.log('删除结果:', result);
    res.json(result);
  } catch (error) {
    console.error('删除文件时服务器端错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 上传文件
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    const { path } = req.body;
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }
    
    // 用于存储上传结果
    const results = [];
    
    // 逐个处理上传的文件
    for (const file of files) {
      try {
        const filePath = file.path;
        const remotePath = `${path}${path.endsWith('/') ? '' : '/'}${file.originalname}`;
        
        const result = await sftpManager.uploadFile(filePath, remotePath);
        
        // 删除临时文件
        fs.unlinkSync(filePath);
        
        results.push({ filename: file.originalname, success: true, message: '上传成功' });
      } catch (error) {
        results.push({ filename: file.originalname, success: false, message: error.message });
      }
    }
    
    // 如果至少有一个文件上传成功，则返回成功
    const successCount = results.filter(r => r.success).length;
    if (successCount > 0) {
      res.json({ 
        success: true, 
        message: `成功上传 ${successCount}/${files.length} 个文件`,
        details: results
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: '所有文件上传失败',
        details: results
      });
    }
  } catch (error) {
    // 删除临时文件
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 下载文件
app.get('/api/download', async (req, res) => {
  try {
    const { path, filename } = req.query;
    
    // 创建临时文件
    const tempPath = `temp_${Date.now()}_${filename}`;
    
    await sftpManager.downloadFile(path, tempPath);
    
    res.download(tempPath, filename, (err) => {
      // 下载完成后删除临时文件
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (err) {
        console.error('下载文件时出错:', err);
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 重命名文件/目录
app.put('/api/file/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const result = await sftpManager.renameFile(oldPath, newPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取文件信息
app.get('/api/file/stats', async (req, res) => {
  try {
    const { path } = req.query;
    const stats = await sftpManager.getFileStats(path);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 复制文件/目录
app.post('/api/file/copy', async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    const result = await sftpManager.copyFile(sourcePath, targetPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 移动/剪切文件/目录
app.post('/api/file/move', async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    const result = await sftpManager.moveFile(sourcePath, targetPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 压缩文件/目录
app.post('/api/file/compress', async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    const result = await sftpManager.compressFile(sourcePath, targetPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 解压文件
app.post('/api/file/extract', async (req, res) => {
  try {
    const { sourcePath, targetPath } = req.body;
    const result = await sftpManager.extractFile(sourcePath, targetPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 下载目录为ZIP文件
app.get('/api/download-directory', async (req, res) => {
  try {
    const { path, name } = req.query;
    
    // 创建临时ZIP文件路径
    const zipName = `${name}.zip`;
    const tempZipPath = `temp_${Date.now()}_${zipName}`;
    
    // 压缩目录
    await sftpManager.compressFile(path, tempZipPath);
    
    res.download(tempZipPath, zipName, (err) => {
      // 下载完成后删除临时文件
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
      if (err) {
        console.error('下载压缩文件时出错:', err);
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`SFTP 网盘服务器运行在端口 ${port}`);
});