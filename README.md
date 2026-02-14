# 👶 小记录

宝宝日常记录工具 - 换尿裤、晒太阳、喂奶... 家庭共享，简单好用。

![screenshot](screenshot.png)

## ✨ 功能特点

### 🧷 时间点记录
- 一键记录换尿裤、喂奶、拉便便等一次性事件
- 自动显示"上次换尿裤是 X 分钟前"，方便判断是否该换了
- 谁都可以记录，互相知晓

### ⏱️ 持续记录
- 点一下开始，再点一下结束，自动计算时长
- 适合晒太阳、吃奶、小睡等有持续时间的活动
- **重要**：进行中的活动可由家庭**任意成员**点击结束

### 👨👩👵 家庭共享
- 三个人（爸爸/妈妈/奶奶）共享同一个数据库
- 数据实时同步（15秒自动刷新）
- 无需注册，一个密码进入，选身份即可使用

### 📱 PWA 支持
- 添加到手机主屏幕，像原生 App 一样使用
- iPhone 和 Android 都支持

## 🚀 部署

### 快速部署（Ubuntu/Debian）

```bash
cd /var/www
# 上传代码后运行
bash deploy.sh
```

部署脚本会自动完成：
- 安装 Node.js（如果未安装）
- 安装依赖
- 创建 systemd 服务
- 启动服务

访问地址：`http://你的IP:3000`  
默认密码：`baobao2024`

### 手动部署

```bash
# 1. 安装依赖
npm install --production

# 2. 启动服务
npm start
```

### 修改密码

```bash
sudo nano /etc/systemd/system/xiaojilu.service
# 修改 Environment=PASSWORD=你的新密码
sudo systemctl daemon-reload
sudo systemctl restart xiaojilu
```

### 云服务器安全组设置

如果访问不了，需要在云服务器控制台放行 **3000 端口**。

## 📱 手机添加到主屏幕

**iPhone (Safari)**
1. 用 Safari 打开 `http://129.211.5.9:3000`
2. 点击底部分享按钮
3. 选择"添加到主屏幕"

**Android (Chrome)**
1. 用 Chrome 打开地址
2. 点击右上角菜单（三个点）
3. 选择"添加到主屏幕"

## 🛠 技术栈

- **后端**: Node.js + Express + better-sqlite3
- **前端**: 原生 HTML/CSS/JS（单页应用）
- **PWA**: Service Worker + Manifest
- **数据库**: SQLite（轻量，无需配置）

## 📁 项目结构

```
xiaojilu/
├── server.js          # Express API 服务
├── package.json       # 依赖配置
├── deploy.sh          # 一键部署脚本
├── .gitignore
├── README.md          # 本文件
├── data/              # 数据库目录（自动创建）
└── public/
    ├── index.html     # 前端应用（全部功能）
    ├── manifest.json  # PWA 配置
    ├── sw.js          # Service Worker
    └── icon.svg       # 应用图标
```

## 🔧 API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth` | 验证密码 |
| POST | `/api/instant` | 创建时间点记录 |
| GET | `/api/instant` | 查询时间点记录 |
| DELETE | `/api/instant/:id` | 删除时间点记录 |
| POST | `/api/duration/start` | 开始持续事件 |
| POST | `/api/duration/end/:id` | 结束持续事件 |
| PUT | `/api/duration/:id` | 修改事件类型 |
| GET | `/api/duration` | 查询持续记录 |
| DELETE | `/api/duration/:id` | 删除持续记录 |
| GET | `/api/active` | 获取进行中事件 |
| GET | `/api/today` | 获取今日概览 |

所有接口都需要在 Header 中携带 `x-auth-token: 你的密码`

## 📄 License

MIT
