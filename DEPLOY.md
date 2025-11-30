# 魔法AI绘画 Web 部署教程

本教程介绍如何将项目打包并手动部署到服务器上，无需使用 Docker。

## 目录

1. [一键打包脚本](#一键打包脚本)
2. [服务器部署](#服务器部署)
3. [使用 PM2 管理进程 (推荐)](#使用-pm2-管理进程-推荐)
4. [常见问题](#常见问题)

## 一键打包脚本

为了方便部署，我们准备了一个自动打包脚本，它会自动执行构建、整理文件并打包成 Zip 压缩包。

### Windows (使用 Git Bash) 或 Linux/Mac

在项目根目录下运行：

```bash
chmod +x build-and-zip.sh
./build-and-zip.sh
```

脚本执行完成后，你会在根目录下找到 **`magic-ai-web-deploy.zip`** 文件。

> **注意**：如果不使用脚本，你需要手动执行 `npm run build`，然后按照 Next.js Standalone 模式的要求，整理 `.next/standalone`, `.next/static` 和 `public` 目录。

## 服务器部署

1. **上传文件**
   将 `magic-ai-web-deploy.zip` 上传到你的服务器。

2. **解压文件**
   ```bash
   unzip magic-ai-web-deploy.zip
   ```

3. **进入目录**
   ```bash
   cd web-dist
   ```

4. **启动服务**
   
   直接启动：
   ```bash
   # 添加执行权限
   chmod +x start.sh
   ./start.sh
   ```
   
   或者直接运行：
   ```bash
   node server.js
   ```

   默认端口为 **3000**。如果要修改端口，例如修改为 8080：
   ```bash
   PORT=8080 node server.js
   ```

## 使用 PM2 管理进程 (推荐)

为了让服务在后台持续运行并在崩溃后自动重启，建议使用 PM2。

1. **安装 PM2**
   ```bash
   npm install -g pm2
   ```

2. **启动服务**
   进入 `web-dist` 目录后运行：
   ```bash
   pm2 start server.js --name "magic-ai"
   ```

3. **常用命令**
   - 查看状态：`pm2 list`
   - 停止服务：`pm2 stop magic-ai`
   - 重启服务：`pm2 restart magic-ai`
   - 查看日志：`pm2 logs magic-ai`

## 常见问题

### 1. 缺少依赖模块？
Standalone 模式已经包含了所有运行时的 `node_modules`，通常不需要再次执行 `npm install`。如果报错提示缺少模块，请检查是否完整复制了 `web-dist` 目录下的所有文件。

### 2. 图片无法加载？
请确保 `.next/static` 和 `public` 文件夹已正确复制到服务器上的相应位置（脚本会自动处理这些）。

### 3. 如何配置 API Key？
本项目主要配置（API Key、Base URL 等）存储在用户浏览器的 LocalStorage 中，服务端不需要配置。
部署完成后，直接在浏览器打开网站，点击左下角的【密钥设置】输入 API 信息即可。