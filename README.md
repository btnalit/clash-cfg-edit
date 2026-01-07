# Clash 配置文件在线编辑器

一个现代化的 Clash/Mihomo 配置文件可视化编辑工具，提供友好的用户界面来简化 Clash 配置文件的编辑过程。

> 原作者开源地址：https://github.com/xiaoyutx94/clash-config-editor

## ✨ 特性

- 🎨 **直观的UI界面** - 基于 Vue 3 + Element Plus 的现代化界面
- 📝 **可视化编辑** - 通过表单、表格等UI组件编辑配置，无需手写YAML
- 💡 **配置说明** - 每个配置项都有详细的说明和示例
- ✅ **配置验证** - 保存前自动验证配置，避免错误
- 🔒 **可选认证** - 支持用户名密码登录保护
- 📁 **文件管理** - 支持上传、编辑、删除服务器上的配置文件
- 🐳 **Docker部署** - 开箱即用的 Docker 容器化部署
- 🌐 **全配置支持** - 支持 Mihomo 的所有主要配置项
- 📡 **FTP 远程配置** - 支持通过 FTP 读取和保存远程配置文件（如 RouterOS）
- 🔌 **Mihomo API 集成** - 支持连接 Mihomo 后端，实时重载配置

## 🚀 快速开始

### 方式一：使用发布的Docker镜像（最简单）

```bash
# 拉取最新镜像
docker pull ghcr.io/xiaoyutx94/clash-config-editor:latest

# 运行容器
docker run -d \
  -p 3088:3088 \
  -v ./configs:/app/configs \
  -e AUTH_ENABLED=true \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=your_secure_password \
  --name clash-config-editor \
  ghcr.io/xiaoyutx94/clash-config-editor:latest
```

访问：http://localhost:3088

### 方式二：使用docker-compose

创建 `docker-compose.yml`:
```yaml
version: '3.8'
services:
  clash-config-editor:
    image: ghcr.io/xiaoyutx94/clash-config-editor:latest
    container_name: clash-config-editor
    ports:
      - "3088:3088"
    volumes:
      - ./configs:/app/configs
    environment:
      - AUTH_ENABLED=true
      - AUTH_USERNAME=admin
      - AUTH_PASSWORD=your_secure_password
    restart: unless-stopped
```

然后运行：
```bash
docker-compose up -d
```

### 方式三：从源码构建 Docker 镜像

1. 克隆项目：
```bash
git clone https://github.com/xiaoyutx94/clash-config-editor.git
cd clash-config-editor
```

2. 构建并启动容器：
```bash
docker build -t clash-config-editor .
docker run -d -p 3088:3088 --name clash-editor clash-config-editor
```

3. 访问：http://localhost:3088

### 方式四：本地开发

#### 前置要求
- Node.js 18+ 
- npm 或 yarn

#### 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

#### 启动服务

**开发模式（推荐）：**

打开两个终端窗口：

```bash
# 终端1 - 启动后端
cd backend
npm run dev

# 终端2 - 启动前端
cd frontend
npm run dev
```

然后访问：http://localhost:5173

**使用脚本启动：**

```bash
# 在项目根目录
npm install      # 安装 concurrently
npm run dev      # 同时启动前后端
```

## 🔧 配置

### 环境变量

创建 `.env` 文件或在 `docker-compose.yml` 中配置：

```env
# 服务端口（默认3088）
PORT=3088

# 是否启用认证（true/false）
AUTH_ENABLED=false

# 登录用户名（当AUTH_ENABLED=true时生效）
AUTH_USERNAME=admin

# 登录密码（当AUTH_ENABLED=true时生效）
AUTH_PASSWORD=admin
```

### 启用登录认证

在 `docker-compose.yml` 中修改环境变量：

```yaml
environment:
  - AUTH_ENABLED=true
  - AUTH_USERNAME=your_username
  - AUTH_PASSWORD=your_password
```

## 📖 使用指南

### 1. 选择或上传配置文件

- **服务器文件**：从服务器上已有的配置文件中选择
- **上传文件**：拖拽或选择本地 YAML 文件上传
- **FTP 远程配置**：连接 FTP 服务器读取远程配置（如 RouterOS 上的 Mihomo 配置）
- **Mihomo API**：连接 Mihomo 后端 API 获取运行中的配置

### 2. FTP 远程配置功能

适用于在路由器（如 RouterOS）上运行 Mihomo 的场景：

1. 点击文件选择页面的 **"连接 Mihomo/FTP"** 按钮
2. 选择 **FTP** 标签页
3. 填写 FTP 连接信息：
   - 主机地址（如：`10.20.2.254`）
   - 端口（默认 21）
   - 用户名和密码
   - 配置文件路径（如：`/mihomoconfig/config.yaml`）
4. 点击 **"连接并加载配置"**
5. 编辑完成后可以：
   - **保存到 FTP**：直接保存回远程服务器
   - **保存到本地**：备份到 Web 服务器（文件名带时间戳）

### 3. Mihomo API 连接

连接到 Mihomo 的外部控制器 API：

1. 点击 **"连接 Mihomo/FTP"** 按钮
2. 选择 **Mihomo API** 标签页
3. 填写 API 地址（如：`10.20.2.254:9090`）和 Secret
4. 连接成功后可以：
   - 加载当前运行配置
   - **重载配置**：让 Mihomo 重新读取配置文件

> ⚠️ 注意：由于 Mihomo API 安全限制，代理节点的敏感信息（server、password 等）无法通过 API 获取。建议使用 FTP 方式获取完整配置。

### 4. 编辑配置

编辑器分为多个标签页：

- **基础配置**：端口、模式、日志等基础设置
- **网络配置**：认证、接口、TLS指纹等网络相关设置
- **TUN配置**：TUN模式相关配置
- **DNS配置**：DNS服务器和解析策略
- **嗅探配置**：域名嗅探相关设置
- **代理节点**：添加和管理代理服务器
- **代理组**：配置策略组
- **规则配置**：配置路由规则

### 5. 保存配置

根据配置来源，有不同的保存选项：

- **本地文件**：直接保存到服务器文件
- **FTP 配置**：
  - 保存到 FTP（远程服务器）
  - 保存到本地（备份，文件名格式：`ftp-backup-YYYYMMDD-HHmmss.yaml`）
- **Mihomo API**：保存到 Mihomo 后端

### 6. 重载配置

连接 Mihomo API 后，点击 **"重载配置"** 按钮可以让 Mihomo 重新读取配置文件，使修改立即生效。

### 7. 预览 YAML

点击"预览YAML"可以查看生成的原始 YAML 配置内容。

## 🏗️ 项目结构

```
clash-config-editor/
├── backend/                    # 后端服务
│   ├── server.js              # Express 服务器（含 FTP、Mihomo API）
│   ├── config-metadata.json   # 配置元数据
│   └── package.json
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── views/             # 页面组件
│   │   │   ├── FileSelector.vue    # 文件选择页
│   │   │   ├── ConfigEditor.vue    # 配置编辑页
│   │   │   └── Login.vue           # 登录页
│   │   ├── components/        # UI组件
│   │   │   ├── BasicConfigForm.vue # 基础配置表单
│   │   │   ├── ProxyTable.vue      # 代理节点表格
│   │   │   ├── ProxyGroupTable.vue # 代理组表格
│   │   │   ├── RuleTable.vue       # 规则表格
│   │   │   └── MihomoConnect.vue   # Mihomo/FTP 连接组件
│   │   ├── api/               # API调用
│   │   ├── stores/            # 状态管理
│   │   │   ├── config.js      # 配置状态
│   │   │   └── mihomo.js      # Mihomo/FTP 连接状态
│   │   └── router/            # 路由配置
│   ├── public/
│   │   └── config-metadata.json  # 配置元数据（协议定义）
│   └── package.json
├── configs/                    # 配置文件存储目录
├── docker/
│   └── nginx.conf             # Nginx 配置
├── docker-compose.yml         # Docker编排文件
├── Dockerfile                 # Docker镜像构建文件
├── .dockerignore              # Docker 构建忽略文件
├── .env.example               # 环境变量示例
└── README.md
```

## 🛠️ 技术栈

### 后端
- **Node.js** - 运行环境
- **Express** - Web框架
- **js-yaml** - YAML解析
- **Multer** - 文件上传
- **basic-ftp** - FTP 客户端

### 前端
- **Vue 3** - 渐进式JavaScript框架
- **Element Plus** - UI组件库
- **Pinia** - 状态管理
- **Vite** - 构建工具
- **Vue Router** - 路由管理

## 📝 支持的配置项

### 基础配置
- HTTP/SOCKS/混合端口配置
- 运行模式（规则/全局/直连）
- IPv6 支持
- 日志级别
- 外部控制器

### 代理节点
- Shadowsocks (SS)
- VMess（支持 WebSocket、gRPC）
- VLESS（支持 REALITY、WebSocket、gRPC）
- Trojan（支持 WebSocket、gRPC）
- Hysteria2
- SOCKS5
- HTTP
- AnyTLS

### 代理组
- 手动选择 (select)
- 自动测速 (url-test)
- 故障转移 (fallback)
- 负载均衡 (load-balance)

### 规则类型
- DOMAIN - 完整域名匹配
- DOMAIN-SUFFIX - 域名后缀匹配
- DOMAIN-KEYWORD - 域名关键字匹配
- IP-CIDR - IP段匹配
- SRC-IP-CIDR - 源IP地址匹配
- GEOIP - 地理位置匹配
- GEOSITE - 域名集合匹配
- MATCH - 兜底规则

## 🔒 安全说明

### ✅ 已实施的安全措施

1. **路径遍历漏洞防护** - 严格验证文件名，防止访问系统文件
2. **Token过期机制** - Token 24小时自动过期
3. **登录暴力破解防护** - 5次失败锁定15分钟
4. **CORS配置** - 支持白名单限制
5. **输入验证** - 所有用户输入都经过严格验证

### 🛡️ 生产环境部署要求

1. ✅ **启用认证**：`AUTH_ENABLED=true`
2. ✅ **使用强密码**：至少12位，包含大小写字母、数字和特殊字符
3. ✅ **配置HTTPS**：使用反向代理配置SSL证书
4. ✅ **配置防火墙**：只开放必要的端口

## 📦 打包部署

上传到服务器构建 Docker 镜像时，不需要包含 `node_modules` 目录：

```bash
# 使用 tar 打包（排除 node_modules）
tar --exclude='node_modules' --exclude='.git' -czvf clash-config-editor.tar.gz .

# 或使用 Git 导出
git archive --format=tar.gz -o clash-config-editor.tar.gz HEAD
```

## 📄 License

MIT License

## 🤝 贡献

感谢原作者的开源项目！开源地址：https://github.com/xiaoyutx94/clash-config-editor

## 📮 联系方式

如有问题或建议，请提交 Issue。
