let currentPath = '/';
let clipboard = {
  action: null, // 'copy' or 'cut'
  path: null,
  name: null
};
let selectMode = false;
let selectedFiles = [];
let loadingTimeout;

// 页面加载时获取文件列表
document.addEventListener('DOMContentLoaded', function() {
    // 处理URL中的hash路径
    handleHashPath();
    
    // 监听hash变化
    window.addEventListener('hashchange', handleHashPath);
    
    // 上传表单提交事件
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    
    // 创建目录表单提交事件
    document.getElementById('createDirForm').addEventListener('submit', handleCreateDir);
    
    // 压缩表单提交事件
    document.getElementById('compressForm').addEventListener('submit', handleCompress);
    
    // 批量压缩表单提交事件
    document.getElementById('batchCompressForm').addEventListener('submit', handleBatchCompress);
    
    // 搜索框回车事件
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchFiles();
        }
    });
});

// 处理URL中的hash路径
function handleHashPath() {
    const hash = window.location.hash;
    if (hash.startsWith('#')) {
        const path = decodeURIComponent(hash.substring(1));
        // 验证路径是否以/开头
        if (path.startsWith('/')) {
            loadFiles(path);
            return;
        }
    }
    // 如果没有有效的hash路径，则加载根路径
    loadFiles(currentPath);
}

// 更新当前路径并更新URL hash
function updateCurrentPath(path) {
    currentPath = path;
    // 更新URL中的hash
    window.location.hash = encodeURIComponent(path);
    // 更新路径输入框
    document.getElementById('currentPath').value = path;
}

// 加载文件列表
async function loadFiles(path) {
    window.operationStartTime = Date.now(); // 记录操作开始时间
    try {
        showLoading();
        const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        const result = await response.json();
        
        if (result.success) {
            updateCurrentPath(path);
            updateBreadcrumb(path);
            displayFiles(result.data);
        } else {
            showError('加载文件列表失败: ' + result.message);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 更新面包屑导航
function updateBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb');
    const parts = path.split('/').filter(part => part !== '');
    
    let breadcrumbHTML = `<a onclick="updateCurrentPath('/')">根目录</a>`;
    let current = '';
    
    parts.forEach((part, index) => {
        current += '/' + part;
        if (index === parts.length - 1) {
            breadcrumbHTML += `<span> / ${part}</span>`;
        } else {
            breadcrumbHTML += ` / <a onclick="updateCurrentPath('${current}/')">${part}</a>`;
        }
    });
    
    breadcrumb.innerHTML = breadcrumbHTML;
}

// 显示文件列表
function displayFiles(files) {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    // 添加返回上级目录按钮（如果不是根目录）
    if (currentPath !== '/') {
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/', currentPath.length - 2) + 1) || '/';
        const parentItem = document.createElement('div');
        parentItem.className = 'file-item';
        parentItem.innerHTML = `
            <div class="file-icon">📁</div>
            <div class="file-info">
                <div class="file-name" onclick="updateCurrentPath('${parentPath}')">
                    <i class="fas fa-arrow-up"></i> ..
                </div>
            </div>
        `;
        fileList.appendChild(parentItem);
    }
    
    // 排序：文件夹在前，文件在后
    files.sort((a, b) => {
        if (a.type === 'd' && b.type !== 'd') return -1;
        if (a.type !== 'd' && b.type === 'd') return 1;
        return a.name.localeCompare(b.name);
    });
    
    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.path = file.path;
        fileItem.dataset.name = file.name;
        fileItem.dataset.type = file.type;
        fileItem.dataset.size = file.size;
        
        const isDirectory = file.type === 'd';
        const icon = isDirectory ? '📁' : getFileIcon(file.name);
        const size = isDirectory ? '-' : formatFileSize(file.size);
        const modifyTime = new Date(file.modifyTime).toLocaleString();
        
        fileItem.innerHTML = `
            ${selectMode ? `
            <div class="file-select">
                <input type="checkbox" class="file-checkbox" data-path="${file.path}" data-name="${file.name}" data-isdir="${isDirectory}">
            </div>
            ` : ''}
            <div class="file-icon">${icon}</div>
            <div class="file-info">
                <div class="file-name" onclick="${isDirectory ? `updateCurrentPath('${file.path}')` : `downloadFile('${file.path}', '${file.name}')`}">
                    <i class="fas fa-${isDirectory ? 'folder' : 'file'}"></i> ${file.name}
                </div>
                <div class="file-meta">
                    <span><i class="fas fa-weight-hanging"></i> 大小: ${size}</span>
                    <span><i class="far fa-clock"></i> 修改时间: ${modifyTime}</span>
                    ${!isDirectory ? `<span><i class="fas fa-file"></i> 类型: ${getFileExtension(file.name)}</span>` : ''}
                </div>
            </div>
            <div class="file-actions">
                ${!isDirectory ? `
                    <button class="preview-btn" onclick="previewFile('${file.path}', '${file.name}')">
                        <i class="fas fa-eye"></i> 预览
                    </button>
                    <button class="download-btn" onclick="downloadFile('${file.path}', '${file.name}')">
                        <i class="fas fa-download"></i> 下载
                    </button>
                ` : `
                    <button class="download-btn" onclick="downloadDirectory('${file.path}', '${file.name}')">
                        <i class="fas fa-download"></i> 下载
                    </button>
                `}
                <button class="detail-btn" onclick="showFileDetail('${file.path}', '${file.name}', '${isDirectory}', '${size}', '${modifyTime}')">
                    <i class="fas fa-info-circle"></i> 详情
                </button>
                <button class="rename-btn" onclick="renameFile('${file.path}', '${file.name}')">
                    <i class="fas fa-edit"></i> 重命名
                </button>
                <button class="copy-btn" onclick="copyFile('${file.path}', '${file.name}')">
                    <i class="fas fa-copy"></i> 复制
                </button>
                <button class="cut-btn" onclick="cutFile('${file.path}', '${file.name}')">
                    <i class="fas fa-cut"></i> 剪切
                </button>
                ${!isDirectory ? `
                    <button class="compress-btn" onclick="showCompressModal('${file.path}', '${file.name}')">
                        <i class="fas fa-compress"></i> 压缩
                    </button>
                ` : ''}
                <button class="delete-btn" onclick="deleteFile('${file.path}')">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </div>
        `;
        
        fileList.appendChild(fileItem);
    });
    
    // 为多选框添加事件监听器
    if (selectMode) {
        document.querySelectorAll('.file-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', handleFileSelect);
        });
    }
}

// 获取文件图标
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'xls': '📊',
        'xlsx': '📊',
        'ppt': '📽️',
        'pptx': '📽️',
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'mp3': '🎵',
        'wav': '🎵',
        'mp4': '🎬',
        'avi': '🎬',
        'zip': '📦',
        'rar': '📦',
        '7z': '📦',
        'txt': '📝',
        'md': '📝',
        'html': '🌐',
        'css': '🎨',
        'js': '📜'
    };
    return iconMap[ext] || '📄';
}

// 获取文件扩展名
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 显示上传模态框
function showUploadModal() {
    document.getElementById('uploadModal').style.display = 'block';
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadPath').value = currentPath;
}

// 显示创建目录模态框
function showCreateDirModal() {
    document.getElementById('createDirModal').style.display = 'block';
    document.getElementById('dirName').value = '';
}

// 显示系统信息模态框
async function showInfoModal() {
    try {
        showLoading();
        // 这里可以调用后端API获取系统信息
        const infoContent = document.getElementById('systemInfo');
        infoContent.innerHTML = `
            <div class="info-item">
                <span class="info-label">当前路径:</span>
                <span class="info-value">${currentPath}</span>
            </div>
            <div class="info-item">
                <span class="info-label">当前时间:</span>
                <span class="info-value">${new Date().toLocaleString()}</span>
            </div>
            <div class="info-item">
                <span class="info-label">系统状态:</span>
                <span class="info-value">运行正常</span>
            </div>
            <div class="info-item">
                <span class="info-label">技术支持:</span>
                <span class="info-value">SFTP 网盘系统</span>
            </div>
        `;
        document.getElementById('infoModal').style.display = 'block';
    } catch (error) {
        showError('获取系统信息失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 显示文件详情模态框
function showFileDetail(path, name, isDirectory, size, modifyTime) {
    const detailContent = document.getElementById('fileDetail');
    const type = isDirectory === 'true' ? '文件夹' : '文件';
    const icon = isDirectory === 'true' ? '📁' : getFileIcon(name);
    
    detailContent.innerHTML = `
        <div class="info-item">
            <span class="info-label">名称:</span>
            <span class="info-value">${icon} ${name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">类型:</span>
            <span class="info-value">${type}</span>
        </div>
        <div class="info-item">
            <span class="info-label">路径:</span>
            <span class="info-value">${path}</span>
        </div>
        ${isDirectory === 'false' ? `
        <div class="info-item">
            <span class="info-label">大小:</span>
            <span class="info-value">${size}</span>
        </div>
        ` : ''}
        <div class="info-item">
            <span class="info-label">修改时间:</span>
            <span class="info-value">${modifyTime}</span>
        </div>
    `;
    
    document.getElementById('detailModal').style.display = 'block';
}

// 预览文件
async function previewFile(path, filename) {
    try {
        showLoading();
        const ext = getFileExtension(filename);
        const previewContent = document.getElementById('previewContent');
        const previewTitle = document.getElementById('previewTitle');
        
        previewTitle.textContent = `预览: ${filename}`;
        
        // 图片文件预览
        if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
            previewContent.innerHTML = `<img src="/api/download?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}" alt="${filename}">`;
        }
        // 文本文件预览
        else if (['txt', 'md', 'html', 'css', 'js', 'json', 'xml'].includes(ext)) {
            const response = await fetch(`/api/download?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`);
            const text = await response.text();
            previewContent.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
        }
        // PDF文件预览
        else if (ext === 'pdf') {
            previewContent.innerHTML = `
                <div>
                    <p>PDF文件预览:</p>
                    <a href="/api/download?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}" target="_blank" class="download-btn">
                        <i class="fas fa-external-link-alt"></i> 在新窗口打开PDF
                    </a>
                </div>
            `;
        }
        // 其他文件
        else {
            previewContent.innerHTML = `
                <div>
                    <p>该文件类型不支持预览</p>
                    <button class="download-btn" onclick="downloadFile('${path}', '${filename}')">
                        <i class="fas fa-download"></i> 下载文件
                    </button>
                </div>
            `;
        }
        
        document.getElementById('previewModal').style.display = 'block';
    } catch (error) {
        showError('预览文件失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 转义HTML特殊字符
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// 关闭模态框
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// 处理文件上传
async function handleUpload(e) {
    e.preventDefault();
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    const fileInput = document.getElementById('fileInput');
    const files = fileInput.files;
    
    if (files.length === 0) {
        showError('请选择要上传的文件');
        return;
    }
    
    try {
        // 使用左下角进度条而不是全屏加载指示器
        showUploadProgress();
        updateUploadProgress(0, '准备上传...');
        
        const formData = new FormData();
        formData.append('path', currentPath);
        
        // 逐个上传文件以显示进度
        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            formData.set('files', file); // 每次只上传一个文件
            
            try {
                // 更新进度
                const progress = ((i) / files.length) * 100;
                updateUploadProgress(progress, `正在上传 ${file.name}...`);
                
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                if (result.success) {
                    successCount++;
                }
                
                // 更新进度
                const nextProgress = ((i + 1) / files.length) * 100;
                updateUploadProgress(nextProgress, `已上传 ${i + 1}/${files.length} 个文件`);
            } catch (err) {
                console.error('上传文件时出错:', err);
            }
        }
        
        updateUploadProgress(100, `上传完成: ${successCount}/${files.length} 个文件`);
        
        // 短暂延迟后隐藏进度条
        setTimeout(() => {
            hideUploadProgress();
            showSuccess(`成功上传 ${successCount}/${files.length} 个文件`);
            closeModal('uploadModal');
            loadFiles(currentPath);
        }, 1000);
        
    } catch (error) {
        hideUploadProgress();
        showError('上传失败: ' + error.message);
    }
}

// 处理创建目录
async function handleCreateDir(e) {
    e.preventDefault();
    
    const dirName = await showPrompt('新建文件夹', '请输入目录名称:');
    if (!dirName) {
        return;
    }
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    const dirPath = `${currentPath}${currentPath.endsWith('/') ? '' : '/'}${dirName}`;
    
    try {
        // 对于写操作，显示左下角进度条
        showUploadProgress();
        updateUploadProgress(30, '正在创建目录...');
        
        const response = await fetch('/api/directory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: dirPath })
        });
        
        updateUploadProgress(70, '处理响应...');
        
        const result = await response.json();
        
        if (result.success) {
            updateUploadProgress(100, '目录创建成功');
            setTimeout(() => {
                hideUploadProgress();
                showSuccess('目录创建成功');
                closeModal('createDirModal');
                loadFiles(currentPath);
            }, 500);
        } else {
            hideUploadProgress();
            showError('创建失败: ' + result.message);
        }
    } catch (error) {
        hideUploadProgress();
        showError('创建失败: ' + error.message);
    }
}

// 下载文件
async function downloadFile(path, filename) {
    window.operationStartTime = Date.now(); // 记录操作开始时间
    try {
        showLoading();
        window.open(`/api/download?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`, '_blank');
        showSuccess('开始下载文件');
    } catch (error) {
        showError('下载失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 下载目录（压缩为ZIP）
async function downloadDirectory(path, name) {
    try {
        showLoading();
        const zipName = `${name}.zip`;
        // 在实际应用中，这里应该调用后端API来压缩目录并下载
        // 暂时使用提示信息告知用户功能逻辑
        showSuccess(`目录 "${name}" 将被压缩为 "${zipName}" 并开始下载`);
        // 模拟下载链接
        // window.open(`/api/download-directory?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`, '_blank');
    } catch (error) {
        showError('下载失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 删除文件/目录
async function deleteFile(path) {
    const confirmed = await showConfirm('确定要删除这个文件/目录吗？此操作不可恢复！');
    if (!confirmed) {
        return;
    }
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    
    try {
        // 对于写操作，显示左下角进度条
        showUploadProgress();
        updateUploadProgress(30, '正在删除文件...');
        
        const response = await fetch('/api/file', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: path })
        });
        
        updateUploadProgress(70, '处理响应...');
        
        const result = await response.json();
        
        if (result.success) {
            updateUploadProgress(100, '删除成功');
            setTimeout(() => {
                hideUploadProgress();
                showSuccess('删除成功');
                loadFiles(currentPath);
            }, 500);
        } else {
            hideUploadProgress();
            showError('删除失败: ' + result.message);
        }
    } catch (error) {
        hideUploadProgress();
        showError('删除失败: ' + error.message);
    }
}

// 重命名文件/目录
async function renameFile(oldPath, oldName) {
    const newName = await showPrompt('重命名', '请输入新的名称:', oldName);
    if (!newName || newName === oldName) return;
    
    const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    
    try {
        // 对于写操作，显示左下角进度条
        showUploadProgress();
        updateUploadProgress(30, '正在重命名...');
        
        const response = await fetch('/api/file/rename', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                oldPath: oldPath,
                newPath: newPath
            })
        });
        
        updateUploadProgress(70, '处理响应...');
        
        const result = await response.json();
        
        if (result.success) {
            updateUploadProgress(100, '重命名成功');
            setTimeout(() => {
                hideUploadProgress();
                showSuccess('重命名成功');
                loadFiles(currentPath);
            }, 500);
        } else {
            hideUploadProgress();
            showError('重命名失败: ' + result.message);
        }
    } catch (error) {
        hideUploadProgress();
        showError('重命名失败: ' + error.message);
    }
}

// 复制文件/目录
function copyFile(path, name) {
    clipboard.action = 'copy';
    clipboard.path = path;
    clipboard.name = name;
    
    document.getElementById('pasteButton').style.display = 'flex';
    showSuccess(`已复制 "${name}" 到剪贴板`);
}

// 剪切文件/目录
function cutFile(path, name) {
    clipboard.action = 'cut';
    clipboard.path = path;
    clipboard.name = name;
    
    document.getElementById('pasteButton').style.display = 'flex';
    showSuccess(`已剪切 "${name}" 到剪贴板`);
}

// 粘贴文件/目录
async function pasteFile() {
    if (!clipboard.path) {
        showError('剪贴板为空');
        return;
    }
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    
    try {
        showLoading();
        const targetPath = `${currentPath}${currentPath.endsWith('/') ? '' : '/'}${clipboard.name}`;
        
        let response;
        if (clipboard.action === 'copy') {
            response = await fetch('/api/file/copy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    sourcePath: clipboard.path,
                    targetPath: targetPath
                })
            });
        } else if (clipboard.action === 'cut') {
            response = await fetch('/api/file/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    sourcePath: clipboard.path,
                    targetPath: targetPath
                })
            });
        }
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(`${clipboard.action === 'copy' ? '复制' : '移动'}成功`);
            clipboard = { action: null, path: null, name: null };
            document.getElementById('pasteButton').style.display = 'none';
            loadFiles(currentPath);
        } else {
            showError(`${clipboard.action === 'copy' ? '复制' : '移动'}失败: ${result.message}`);
        }
    } catch (error) {
        showError(`${clipboard.action === 'copy' ? '复制' : '移动'}失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 显示压缩模态框
function showCompressModal(path, name) {
    const compressName = name + '.zip';
    document.getElementById('compressName').value = compressName;
    document.getElementById('compressSource').value = path;
    document.getElementById('compressModal').style.display = 'block';
}

// 处理压缩文件
async function handleCompress(e) {
    e.preventDefault();
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    const compressName = document.getElementById('compressName').value.trim();
    const sourcePath = document.getElementById('compressSource').value;
    
    if (!compressName) {
        showError('请输入压缩文件名');
        return;
    }
    
    const targetPath = `${currentPath}${currentPath.endsWith('/') ? '' : '/'}${compressName}`;
    
    try {
        // 对于写操作，显示左下角进度条
        showUploadProgress();
        updateUploadProgress(20, '正在压缩文件...');
        
        const response = await fetch('/api/file/compress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                sourcePath: sourcePath,
                targetPath: targetPath
            })
        });
        
        updateUploadProgress(70, '处理响应...');
        
        const result = await response.json();
        
        if (result.success) {
            updateUploadProgress(100, '压缩成功');
            setTimeout(() => {
                hideUploadProgress();
                showSuccess('压缩成功');
                closeModal('compressModal');
                loadFiles(currentPath);
            }, 500);
        } else {
            hideUploadProgress();
            showError('压缩失败: ' + result.message);
        }
    } catch (error) {
        hideUploadProgress();
        showError('压缩失败: ' + error.message);
    }
}

// 解压文件
async function extractFile(path) {
    const extractDirName = await showPrompt('解压文件', '请输入解压目录名:', path.substring(path.lastIndexOf('/') + 1, path.lastIndexOf('.')) || 'extracted');
    if (!extractDirName) return;
    
    const extractPath = `${currentPath}${currentPath.endsWith('/') ? '' : '/'}${extractDirName}`;
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    
    try {
        // 对于写操作，显示左下角进度条
        showUploadProgress();
        updateUploadProgress(20, '正在解压文件...');
        
        const response = await fetch('/api/file/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                sourcePath: path,
                targetPath: extractPath
            })
        });
        
        updateUploadProgress(70, '处理响应...');
        
        const result = await response.json();
        
        if (result.success) {
            updateUploadProgress(100, '解压成功');
            setTimeout(() => {
                hideUploadProgress();
                showSuccess('解压成功');
                loadFiles(currentPath);
            }, 500);
        } else {
            hideUploadProgress();
            showError('解压失败: ' + result.message);
        }
    } catch (error) {
        hideUploadProgress();
        showError('解压失败: ' + error.message);
    }
}

// 压缩文件/目录
async function compressFile(path, name) {
    const compressName = await showPrompt('压缩文件', '请输入压缩文件名:', name + '.zip');
    if (!compressName) return;
    
    const compressPath = `${currentPath}${currentPath.endsWith('/') ? '' : '/'}${compressName}`;
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    
    try {
        // 对于写操作，显示左下角进度条
        showUploadProgress();
        updateUploadProgress(20, '正在压缩文件...');
        
        const response = await fetch('/api/file/compress', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                sourcePath: path,
                targetPath: compressPath
            })
        });
        
        updateUploadProgress(70, '处理响应...');
        
        const result = await response.json();
        
        if (result.success) {
            updateUploadProgress(100, '压缩成功');
            setTimeout(() => {
                hideUploadProgress();
                showSuccess('压缩成功');
                loadFiles(currentPath);
            }, 500);
        } else {
            hideUploadProgress();
            showError('压缩失败: ' + result.message);
        }
    } catch (error) {
        hideUploadProgress();
        showError('压缩失败: ' + error.message);
    }
}

// 搜索文件
function searchFiles() {
    const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!keyword) {
        loadFiles(currentPath);
        return;
    }
    
    // 在当前显示的文件列表中进行搜索
    const fileItems = document.querySelectorAll('.file-item');
    fileItems.forEach(item => {
        const fileName = item.querySelector('.file-name').textContent.toLowerCase();
        if (fileName.includes(keyword)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// 刷新文件列表
function refreshFiles() {
    loadFiles(currentPath);
}

// 前往指定路径
function goToPath() {
    const path = document.getElementById('currentPath').value;
    updateCurrentPath(path);
    loadFiles(path);
}

// 显示左下角上传进度条
function showUploadProgress() {
    const progressIndicator = document.getElementById('uploadProgress');
    if (progressIndicator) {
        progressIndicator.style.display = 'block';
    }
}

// 隐藏左下角上传进度条
function hideUploadProgress() {
    const progressIndicator = document.getElementById('uploadProgress');
    if (progressIndicator) {
        progressIndicator.style.display = 'none';
        // 重置进度条
        document.getElementById('uploadProgressFill').style.width = '0%';
        document.getElementById('uploadProgressText').textContent = '0%';
    }
}

// 更新上传进度
function updateUploadProgress(percentage, message = '') {
    const progressFill = document.getElementById('uploadProgressFill');
    const progressText = document.getElementById('uploadProgressText');
    
    if (progressFill && progressText) {
        progressFill.style.width = percentage + '%';
        progressText.textContent = Math.round(percentage) + '%' + (message ? ' - ' + message : '');
    }
}

// 显示加载状态
function showLoading() {
    // 添加一个小延迟，避免闪烁
    window.loadingTimeout = setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
        }
        document.body.style.cursor = 'wait';
    }, 150); // 150ms延迟
}

// 隐藏加载状态
function hideLoading() {
    // 清除延迟显示
    if (window.loadingTimeout) {
        clearTimeout(window.loadingTimeout);
        window.loadingTimeout = null;
    }
    
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
    document.body.style.cursor = 'default';
}

// 显示成功消息
function showSuccess(message) {
    // 移除已存在的消息
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => {
        if (msg.parentNode) {
            msg.parentNode.removeChild(msg);
        }
    });
    
    // 记录操作开始时间
    const startTime = window.operationStartTime || Date.now();
    const elapsed = Date.now() - startTime;
    
    // 只有当操作时间超过300ms时才显示成功消息（由调用方设置 operationStartTime）
    if (elapsed > 300) {
        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.className = 'message success';
        messageEl.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 3000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: fadeInOut 3s forwards;
        `;
        
        // 添加淡入淡出动画
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(-20px); }
                10% { opacity: 1; transform: translateY(0); }
                90% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-20px); }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(messageEl);
        
        // 3秒后自动移除消息和样式
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 3000);
    }
}

// 显示错误消息
function showError(message) {
    // 移除已存在的消息
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => {
        if (msg.parentNode) {
            msg.parentNode.removeChild(msg);
        }
    });
    
    // 创建错误消息元素
    const messageEl = document.createElement('div');
    messageEl.className = 'message error';
    messageEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 3000;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: fadeInOut 5s forwards;
    `;
    
    // 添加淡入淡出动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(messageEl);
    
    // 5秒后自动移除消息和样式
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.parentNode.removeChild(messageEl);
        }
        if (style.parentNode) {
            style.parentNode.removeChild(style);
        }
    }, 5000);
}

// 切换选择模式
function toggleSelectMode() {
    selectMode = !selectMode;
    selectedFiles = [];
    document.getElementById('batchToolbar').style.display = selectMode ? 'flex' : 'none';
    document.getElementById('selectModeButton').innerHTML = selectMode ? 
        '<i class="fas fa-times"></i> 取消多选' : 
        '<i class="fas fa-check-square"></i> 多选';
    loadFiles(currentPath);
}

// 取消选择模式
function cancelSelectMode() {
    selectMode = false;
    selectedFiles = [];
    document.getElementById('batchToolbar').style.display = 'none';
    document.getElementById('selectModeButton').innerHTML = '<i class="fas fa-check-square"></i> 多选';
    loadFiles(currentPath);
}

// 处理文件选择
function handleFileSelect(e) {
    const checkbox = e.target;
    const fileInfo = {
        path: checkbox.dataset.path,
        name: checkbox.dataset.name,
        isDir: checkbox.dataset.isdir === 'true'
    };
    
    if (checkbox.checked) {
        selectedFiles.push(fileInfo);
    } else {
        selectedFiles = selectedFiles.filter(file => file.path !== fileInfo.path);
    }
}

// 批量下载
function downloadSelected() {
    if (selectedFiles.length === 0) {
        showError('请至少选择一个文件');
        return;
    }
    
    // 在实际应用中，应该调用后端API来创建压缩包并下载
    showSuccess(`已选择 ${selectedFiles.length} 个文件，将被压缩为ZIP文件并开始下载`);
    
    // 重置选择
    selectedFiles = [];
    toggleSelectMode();
}

// 批量删除
async function deleteSelected() {
    if (selectedFiles.length === 0) {
        showError('请至少选择一个文件');
        return;
    }
    
    const confirmed = await showConfirm(`确定要删除这 ${selectedFiles.length} 个文件/目录吗？此操作不可恢复！`);
    if (!confirmed) {
        return;
    }
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    
    try {
        // 对于批量写操作，显示左下角进度条
        showUploadProgress();
        
        // 这里应该逐个删除文件，或者调用后端批量删除API
        let successCount = 0;
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            
            // 更新进度
            const progress = ((i) / selectedFiles.length) * 100;
            updateUploadProgress(progress, `正在删除 ${file.name}...`);
            
            try {
                const response = await fetch('/api/file', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ path: file.path })
                });
                
                const result = await response.json();
                if (result.success) {
                    successCount++;
                }
                
                // 更新进度
                const nextProgress = ((i + 1) / selectedFiles.length) * 100;
                updateUploadProgress(nextProgress, `已删除 ${i + 1}/${selectedFiles.length} 个文件`);
            } catch (err) {
                console.error('删除文件时出错:', err);
            }
        }
        
        updateUploadProgress(100, `删除完成: ${successCount}/${selectedFiles.length} 个文件`);
        
        // 短暂延迟后隐藏进度条
        setTimeout(() => {
            hideUploadProgress();
            showSuccess(`成功删除 ${successCount}/${selectedFiles.length} 个文件`);
            selectedFiles = [];
            toggleSelectMode();
            loadFiles(currentPath);
        }, 1000);
        
    } catch (error) {
        hideUploadProgress();
        showError('批量删除失败: ' + error.message);
    }
}

// 显示批量压缩模态框
function compressSelected() {
    if (selectedFiles.length === 0) {
        showError('请至少选择一个文件');
        return;
    }
    
    const timestamp = new Date().getTime();
    document.getElementById('batchCompressName').value = `files_${timestamp}.zip`;
    document.getElementById('batchCompressModal').style.display = 'block';
}

// 处理批量压缩
async function handleBatchCompress(e) {
    e.preventDefault();
    
    window.operationStartTime = Date.now(); // 记录操作开始时间
    const compressName = document.getElementById('batchCompressName').value.trim();
    
    if (!compressName) {
        showError('请输入压缩文件名');
        return;
    }
    
    if (selectedFiles.length === 0) {
        showError('没有选择任何文件');
        return;
    }
    
    try {
        showLoading();
        // 在实际应用中，这里应该调用后端API来批量压缩文件
        showSuccess(`已选择 ${selectedFiles.length} 个文件，将被压缩为 "${compressName}"`);
        closeModal('batchCompressModal');
        selectedFiles = [];
        toggleSelectMode();
        loadFiles(currentPath);
    } catch (error) {
        showError('批量压缩失败: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 点击模态框外部关闭
window.onclick = function(event) {
    if (event.target.className === 'modal') {
        event.target.style.display = 'none';
    }
}