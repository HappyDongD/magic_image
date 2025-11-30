#!/bin/bash

# 设置错误时退出
set -e

echo "🚀 开始构建过程..."

# 1. 安装依赖
echo "📦 安装依赖..."
npm install

# 2. 构建项目
# 检测是否存在冲突的 next.config.js (通常用于 Tauri 导出)，如果存在则临时重命名，强制使用 next.config.mjs (Web/Docker 配置)
if [ -f "next.config.js" ]; then
    echo "⚠️  检测到 next.config.js，临时重命名为 next.config.js.bak 以使用 next.config.mjs 进行 Web 构建..."
    mv next.config.js next.config.js.bak
fi

echo "🏗️  执行 npm run build..."
# 使用 trap 确保脚本退出或出错时恢复文件
trap 'if [ -f "next.config.js.bak" ]; then mv next.config.js.bak next.config.js; fi' EXIT

npm run build

# 3. 准备打包目录
DIST_DIR="web-dist"
echo "📂 准备打包目录: $DIST_DIR"

# 清理旧目录
rm -rf $DIST_DIR
mkdir -p $DIST_DIR

# 检查 standalone 是否生成
if [ ! -d ".next/standalone" ]; then
    echo "❌ 错误: .next/standalone 目录未找到，请检查 next.config.mjs 是否配置了 output: 'standalone'"
    exit 1
fi

# 4. 复制文件
echo "📋 复制 Standalone 文件..."
# 注意：使用点(.)来确保复制隐藏文件(如.next目录)
cp -r .next/standalone/. $DIST_DIR/

echo "📋 复制 Static 静态资源..."
# standalone 模式默认不包含 static 和 public，需要手动复制
mkdir -p $DIST_DIR/.next/static
cp -r .next/static/* $DIST_DIR/.next/static/

echo "📋 复制 Public 资源..."
mkdir -p $DIST_DIR/public
cp -r public/* $DIST_DIR/public/

# 5. 创建启动脚本
echo "📝 创建启动脚本..."

# start.sh (Linux/Mac)
cat > $DIST_DIR/start.sh << 'EOF'
#!/bin/sh
export PORT=3003
echo "启动服务中，端口: $PORT"
node server.js
EOF
chmod +x $DIST_DIR/start.sh

# start.bat (Windows)
cat > $DIST_DIR/start.bat << 'EOF'
@echo off
set PORT=3003
echo Starting server on port %PORT%...
node server.js
pause
EOF

# 6. 打包成 ZIP
ZIP_NAME="magic-ai-web-deploy.zip"
echo "📦 正在压缩为 $ZIP_NAME ..."

# 检查是否有 zip 命令
if command -v zip >/dev/null 2>&1; then
    # 进入目录打包，这样解压后直接是文件，或者保留目录结构看需求。
    # 这里我们打包 web-dist 文件夹本身
    zip -r $ZIP_NAME $DIST_DIR
    echo "✅ 打包完成！"
    echo "文件位置: $(pwd)/$ZIP_NAME"
else
    echo "⚠️  未找到 zip 命令，跳过压缩步骤。"
    echo "你现在的部署文件在 $DIST_DIR 目录中。"
fi

echo ""
echo "🎉 全部完成！"
echo "部署指南："
echo "1. 将 $ZIP_NAME 上传到服务器"
echo "2. 解压: unzip $ZIP_NAME"
echo "3. 进入目录: cd $DIST_DIR"
echo "4. 运行: ./start.sh (或者 pm2 start server.js --name magic-ai)"