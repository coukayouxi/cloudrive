const SftpClient = require('ssh2-sftp-client');
require('dotenv').config();

class SFTPManager {
  constructor() {
    this.sftp = null;
    this.config = {
      host: process.env.SFTP_HOST,
      port: parseInt(process.env.SFTP_PORT),
      username: process.env.SFTP_USERNAME,
      password: process.env.SFTP_PASSWORD,
    };
    this.isConnected = false;
  }

  async connect(forceCheck = false) {
    try {
      // 如果已经连接，且不是强制检查，直接使用现有连接
      if (this.isConnected && this.sftp && !forceCheck) {
        console.log('使用现有SFTP连接');
        return true;
      }
      
      // 如果已经连接，但需要强制检查连接状态
      if (this.isConnected && this.sftp && forceCheck) {
        try {
          await this.sftp.list('/', 1); // 测试连接
          console.log('使用现有SFTP连接');
          return true;
        } catch (e) {
          // 连接已断开，清理状态
          console.log('现有连接已断开，重新连接');
          this.isConnected = false;
          this.sftp = null;
        }
      }
      
      // 如果没有连接或连接已断开，建立新连接
      if (!this.isConnected) {
        // 创建新的 SFTP 客户端实例
        this.sftp = new SftpClient();
        await this.sftp.connect(this.config);
        this.isConnected = true;
        console.log('SFTP连接成功');
      }
      
      return true;
    } catch (error) {
      this.isConnected = false;
      this.sftp = null;
      console.error('SFTP连接失败:', error);
      throw new Error(`SFTP连接失败: ${error.message}`);
    }
  }

  async disconnect() {
    try {
      if (this.isConnected && this.sftp) {
        await this.sftp.end();
        this.isConnected = false;
        this.sftp = null;
        console.log('SFTP连接已断开');
      }
    } catch (error) {
      this.isConnected = false;
      this.sftp = null;
      console.error('断开连接时出错:', error);
    }
  }

  async listFiles(path = '/') {
    try {
      // 对于只读操作，不强制检查连接状态
      await this.connect(false);
      
      const files = await this.sftp.list(path);
      
      return files.map(file => ({
        name: file.name,
        size: file.size,
        modifyTime: file.modifyTime,
        accessTime: file.accessTime,
        rights: file.rights,
        type: file.type, // 'd' for directory, '-' for file
        path: `${path}${path.endsWith('/') ? '' : '/'}${file.name}`
      }));
    } catch (error) {
      console.error('列出文件时出错:', error);
      throw new Error(`列出文件时出错: ${error.message}`);
    }
  }

  async createDirectory(path) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      await this.sftp.mkdir(path, true);
      return { success: true, message: '目录创建成功' };
    } catch (error) {
      console.error('创建目录时出错:', error);
      throw new Error(`创建目录时出错: ${error.message}`);
    }
  }

  async deleteFile(path) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      const stats = await this.sftp.stat(path);
      
      if (stats.isDirectory) {
        // 递归删除目录及其内容
        await this.sftp.rmdir(path, true);
      } else {
        // 删除文件
        await this.sftp.delete(path);
      }
      
      return { success: true, message: '删除成功' };
    } catch (error) {
      console.error('删除文件时出错:', error);
      throw new Error(`删除文件时出错: ${error.message}`);
    }
  }

  async downloadFile(remotePath, localPath) {
    try {
      await this.connect();
      await this.sftp.get(remotePath, localPath);
      return { success: true };
    } catch (error) {
      console.error('下载文件时出错:', error);
      throw new Error(`下载文件时出错: ${error.message}`);
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      await this.sftp.put(localPath, remotePath);
      return { success: true, message: '上传成功' };
    } catch (error) {
      console.error('上传文件时出错:', error);
      throw new Error(`上传文件时出错: ${error.message}`);
    }
  }

  async getFileStats(path) {
    try {
      await this.connect();
      
      const stats = await this.sftp.stat(path);
      
      return stats;
    } catch (error) {
      console.error('获取文件信息时出错:', error);
      throw new Error(`获取文件信息时出错: ${error.message}`);
    }
  }

  async renameFile(oldPath, newPath) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      await this.sftp.rename(oldPath, newPath);
      return { success: true, message: '重命名成功' };
    } catch (error) {
      console.error('重命名文件时出错:', error);
      throw new Error(`重命名文件时出错: ${error.message}`);
    }
  }

  async copyFile(sourcePath, targetPath) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      
      // 创建临时本地文件路径
      const tempLocalPath = `temp_${Date.now()}_copy`;
      
      // 下载源文件到本地临时文件
      await this.sftp.get(sourcePath, tempLocalPath);
      
      // 上传临时文件到目标路径
      await this.sftp.put(tempLocalPath, targetPath);
      
      // 删除临时本地文件
      const fs = require('fs');
      if (fs.existsSync(tempLocalPath)) {
        fs.unlinkSync(tempLocalPath);
      }
      
      return { success: true, message: '复制成功' };
    } catch (error) {
      console.error('复制文件时出错:', error);
      throw new Error(`复制文件时出错: ${error.message}`);
    }
  }

  async moveFile(sourcePath, targetPath) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      await this.sftp.rename(sourcePath, targetPath);
      return { success: true, message: '移动成功' };
    } catch (error) {
      console.error('移动文件时出错:', error);
      throw new Error(`移动文件时出错: ${error.message}`);
    }
  }

  async compressFile(sourcePath, targetPath) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);
      
      // 检查源路径是文件还是目录
      const stats = await this.sftp.stat(sourcePath);
      let command;

      if (stats.isDirectory) {
        // 如果是目录，使用 zip -r 进行递归压缩
        command = `zip -r "${targetPath}" "${sourcePath}"`;
      } else {
        // 如果是文件，直接压缩为 zip
        command = `zip "${targetPath}" "${sourcePath}"`;
      }

      // 执行压缩命令
      await this.sftp.exec(command);

      return { success: true, message: '压缩成功' };
    } catch (error) {
      console.error('压缩文件时出错:', error);
      throw new Error(`压缩文件时出错: ${error.message}`);
    }
  }

  async extractFile(sourcePath, targetPath) {
    try {
      // 对于写操作，强制检查连接状态
      await this.connect(true);

      // 确保目标目录存在
      await this.sftp.mkdir(targetPath, true); // 创建目标解压目录

      // 构造解压命令（假设是 .zip 文件）
      const command = `unzip "${sourcePath}" -d "${targetPath}"`;

      // 执行解压命令
      await this.sftp.exec(command);

      return { success: true, message: '解压成功' };
    } catch (error) {
      console.error('解压文件时出错:', error);
      throw new Error(`解压文件时出错: ${error.message}`);
    }
  }
}

module.exports = SFTPManager;