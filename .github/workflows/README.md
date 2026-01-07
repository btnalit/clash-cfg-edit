# GitHub Actions 工作流说明

## Docker 镜像自动构建和发布

### 触发条件

此工作流在以下情况下触发：
1. **创建Release版本时自动触发** - 当你在GitHub上创建新的Release时
2. **手动触发** - 在Actions标签页手动运行工作流

### 镜像发布位置

镜像将发布到 GitHub Container Registry (ghcr.io):
```
ghcr.io/btnalit/clash-cfg-edit:latest
ghcr.io/btnalit/clash-cfg-edit:v1.0.0
```

### 如何构建 Docker 镜像

#### 方法1：手动触发（推荐首次使用）

1. 访问 https://github.com/btnalit/clash-cfg-edit/actions
2. 点击左侧 "Build and Publish Docker Image"
3. 点击右侧 "Run workflow" 按钮
4. 选择 main 分支，点击绿色 "Run workflow"

#### 方法2：创建 Release

1. 访问 https://github.com/btnalit/clash-cfg-edit/releases/new
2. 填写 Tag（如 `v1.0.0`）和标题
3. 点击 "Publish release"
4. 工作流自动运行

### 使用镜像

```bash
docker pull ghcr.io/btnalit/clash-cfg-edit:latest

docker run -d \
  -p 3088:3088 \
  -v ./configs:/app/configs \
  -e AUTH_ENABLED=true \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD=your_password \
  --name clash-cfg-edit \
  ghcr.io/btnalit/clash-cfg-edit:latest
```

### 镜像可见性

首次发布后镜像默认私有，公开设置：
1. 访问 https://github.com/btnalit?tab=packages
2. 找到包 → Package settings → Change visibility → Public
