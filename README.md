# 👶 小记录

宝宝日常记录工具 - 换尿裤、晒太阳、喂奶... 家庭共享，简单好用。

## ✨ 功能特点

### 🧷 时间点记录
- 一键记录换尿裤、喂奶、拉便便等一次性事件
- 自动显示"上次换尿裤是 X 分钟前"
- 主页按日期分组显示最近 10 天记录

### ⏱️ 持续记录
- 点一下开始，再点一下结束，自动计算时长
- 适合晒太阳、吃奶、小睡等有持续时间的活动
- 进行中的活动可由家庭**任意成员**结束
- 顶部横幅实时显示进行中的活动计时

### 👨‍👩‍👧 多家庭支持
- 通过密码区分不同家庭
- 每个家庭可设置宝宝名字，显示在页面标题
- 管理后台独立页面，支持创建/编辑/删除家庭

### 📷 图片上传
- 任何记录都支持上传图片
- 客户端自动压缩（最大 1200px，JPEG 质量 0.7）
- 支持图片预览和删除

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
- 安装依赖
- 创建 systemd 服务（含环境变量配置）
- 启动服务

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `PASSWORD` | 默认家庭密码 | `baobao2024` |
| `ADMIN_PASSWORD` | 管理后台密码 | `admin123` |
| `NODE_ENV` | 运行环境 | `production` |

### 手动部署

```bash
npm install --production
PORT=3000 PASSWORD=baobao2024 ADMIN_PASSWORD=admin123 npm start
```

### 云服务器安全组

需要在云服务器控制台放行对应端口（默认 3000）。

## 📱 手机添加到主屏幕

**iPhone (Safari)**
1. 用 Safari 打开 `http://你的IP:3000`
2. 点击底部分享按钮 → "添加到主屏幕"

**Android (Chrome)**
1. 用 Chrome 打开地址
2. 右上角菜单 → "添加到主屏幕"

## 🔧 管理后台

访问 `http://你的IP:3000/admin.html`，使用管理员密码登录。

功能：
- 创建新家庭（设置密码和宝宝名字）
- 编辑已有家庭信息
- 删除家庭（级联删除所有记录和图片）

## 🛠 技术栈

- **后端**: Node.js + Express + better-sqlite3
- **前端**: 原生 HTML/CSS/JS（无框架，无构建工具）
- **PWA**: Service Worker + Manifest
- **数据库**: SQLite
- **图片处理**: multer（上传）+ 客户端 Canvas 压缩

## 📁 项目结构

```
xiaojilu/
├── server.js          # Express API 服务
├── package.json       # 依赖配置
├── deploy.sh          # 一键部署脚本
├── .gitignore
├── README.md
├── data/              # 运行时数据（gitignore）
│   ├── xiaojilu.db    # SQLite 数据库
│   └── uploads/       # 上传图片
└── public/
    ├── index.html     # 主应用
    ├── admin.html     # 管理后台（独立页面）
    ├── manifest.json  # PWA 配置
    ├── sw.js          # Service Worker
    └── icon.svg       # 应用图标
```

## 🔧 API 接口

### 用户接口（需要 `x-auth-token` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth` | 验证家庭密码 |
| POST | `/api/instant` | 创建时间点记录 |
| GET | `/api/instant` | 查询时间点记录 |
| DELETE | `/api/instant/:id` | 删除时间点记录 |
| POST | `/api/duration/start` | 开始持续事件 |
| POST | `/api/duration/end/:id` | 结束持续事件 |
| PUT | `/api/duration/:id` | 修改事件类型 |
| GET | `/api/duration` | 查询持续记录 |
| DELETE | `/api/duration/:id` | 删除持续记录 |
| GET | `/api/active` | 获取进行中事件 |
| GET | `/api/recent?days=10` | 获取最近 N 天记录 |
| POST | `/api/upload` | 上传图片 |
| DELETE | `/api/images/:id` | 删除图片 |

### 管理接口（需要 `x-admin-token` 头）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/auth` | 管理员认证 |
| GET | `/api/admin/families` | 获取家庭列表 |
| POST | `/api/admin/families` | 创建家庭 |
| PUT | `/api/admin/families/:id` | 编辑家庭 |
| DELETE | `/api/admin/families/:id` | 删除家庭（级联） |

## 📄 License

MIT
