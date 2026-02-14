#!/bin/bash
# 小记录 - 一键部署脚本
# 用法: 在服务器上运行 bash deploy.sh

set -e

echo "========================================="
echo "  小记录 - 宝宝日常记录工具 部署脚本"
echo "========================================="

# 1. 安装 Node.js (如果没有)
if ! command -v node &> /dev/null; then
  echo ">>> 安装 Node.js 20.x ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo ">>> Node.js 版本: $(node -v)"
echo ">>> npm 版本: $(npm -v)"

# 2. 安装依赖
echo ">>> 安装依赖..."
npm install --production

# 3. 创建 data 目录
mkdir -p data

# 4. 设置 systemd 服务
echo ">>> 配置系统服务..."
APP_DIR=$(pwd)

sudo tee /etc/systemd/system/xiaojilu.service > /dev/null <<EOF
[Unit]
Description=小记录 - 宝宝日常记录
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=PASSWORD=baobao2024
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 5. 启动服务
sudo systemctl daemon-reload
sudo systemctl enable xiaojilu
sudo systemctl restart xiaojilu

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "  访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo '你的IP'):3000"
echo "  默认密码: baobao2024"
echo ""
echo "  常用命令:"
echo "    查看状态: sudo systemctl status xiaojilu"
echo "    查看日志: sudo journalctl -u xiaojilu -f"
echo "    重启服务: sudo systemctl restart xiaojilu"
echo "    停止服务: sudo systemctl stop xiaojilu"
echo ""
echo "  修改密码: 编辑 /etc/systemd/system/xiaojilu.service"
echo "            修改 Environment=PASSWORD=你的新密码"
echo "            然后: sudo systemctl daemon-reload && sudo systemctl restart xiaojilu"
echo ""
echo "  手机使用: 打开浏览器访问上面的地址"
echo "           iPhone: 点分享 → 添加到主屏幕"
echo "           Android: 浏览器菜单 → 添加到主屏幕"
echo "========================================="
