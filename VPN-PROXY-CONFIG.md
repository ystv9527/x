# VPN/代理配置指南

## 问题

图片下载失败，显示 `ECONNREFUSED` 或 `ETIMEDOUT` 错误。

## 原因

X的图片服务器可能需要代理访问，或者你的网络有限制。

---

## 解决方案

### 步骤1：获取你的代理地址

如果你使用VPN，查看VPN的本地代理地址：

**常见VPN代理地址：**
```
HTTP代理:   http://127.0.0.1:7890
HTTPS代理:  http://127.0.0.1:7890
SOCKS5代理: socks5://127.0.0.1:1080
```

**查找代理地址的方法：**
- 打开VPN应用设置
- 查看"代理"或"本地代理"选项
- 记下地址和端口

### 步骤2：创建配置文件

在 `E:\gitpromts\` 目录下创建一个名叫 `.env` 的文件：

**方法1：使用编辑器**
1. 在 `E:\gitpromts\` 目录右键 → 新建文件
2. 文件名：`.env`（注意是点开头）
3. 右键编辑，添加内容

**方法2：复制示例**
```bash
copy E:\gitpromts\.env.example E:\gitpromts\.env
```

### 步骤3：配置代理

编辑 `.env` 文件，根据你的VPN类型填入：

#### 如果使用HTTP/HTTPS代理：
```
HTTPS_PROXY=http://127.0.0.1:7890
```

#### 如果使用SOCKS5代理：
```
SOCKS_PROXY=socks5://127.0.0.1:1080
```

#### 示例配置：
```
# 使用Clash代理
HTTPS_PROXY=http://127.0.0.1:7890

# 或者使用V2Ray SOCKS5
SOCKS_PROXY=socks5://127.0.0.1:10808
```

### 步骤4：重启服务器

```bash
# 停止旧服务器 (Ctrl+C)

# 重新启动
npm run server
```

你会看到：
```
🚀 Content Collector Server V3 Started!

   Server: http://localhost:3000
   Images: E:\gitpromts\images
   Proxy: http://127.0.0.1:7890    ← 代理已启用

   Press Ctrl+C to stop
```

---

## 测试代理

### 方法1：直接测试URL

获取图片URL后，在浏览器中测试：
```
https://pbs.twimg.com/media/xxx?format=jpg&name=large
```

如果能访问，说明代理配置正确。

### 方法2：使用调试书签

使用 `bookmarklet-debug.js` 来获取图片URL，然后手动测试。

---

## 常见VPN配置

### Clash
```
HTTPS_PROXY=http://127.0.0.1:7890
```

### V2Ray
```
SOCKS_PROXY=socks5://127.0.0.1:10808
```

### Shadowsocks
```
HTTPS_PROXY=http://127.0.0.1:1080
```

### Trojan
```
HTTPS_PROXY=http://127.0.0.1:1080
```

### 本地SS/SSR + Privoxy
```
HTTPS_PROXY=http://127.0.0.1:8118
```

---

## 故障排除

### Q: 配置后还是下载失败？

**检查步骤：**
1. 确认 `.env` 文件在 `E:\gitpromts\` 目录
2. 确认代理地址正确（运行服务器时会显示）
3. 确认VPN已启动且代理在线
4. 重启服务器

### Q: 如何知道代理地址？

查看你的VPN应用设置：
- Clash: 设置 → 代理 → 本地代理
- V2Ray: 设置 → 本地监听
- Shadowsocks: 编辑服务器 → 本地端口

### Q: 不想用代理了？

删除 `.env` 文件或注释掉代理行：
```
# HTTPS_PROXY=http://127.0.0.1:7890
```

---

## 调试信息

当服务器启动时，如果代理配置成功，你会看到：
```
✅ HTTP(S) Proxy enabled: http://127.0.0.1:7890
```

如果没有代理，会显示：
```
Proxy: None (Direct connection)
💡 If image download fails, configure proxy in .env file
```

---

## 完整 .env 示例

```
# VPN/Proxy Configuration
# 根据你的VPN类型选择合适的配置

# HTTP/HTTPS代理 (推荐大多数VPN)
HTTPS_PROXY=http://127.0.0.1:7890

# SOCKS5代理 (部分VPN需要)
# SOCKS_PROXY=socks5://127.0.0.1:1080

# HTTP代理 (旧式VPN)
# HTTP_PROXY=http://127.0.0.1:7890
```

---

## 下一步

1. **获取代理地址** - 从你的VPN应用查看
2. **创建 `.env` 文件** - 在 `E:\gitpromts\` 目录
3. **填入代理配置** - 根据你的VPN类型
4. **重启服务器** - `npm run server`
5. **测试采集** - 再试一次

---

**如果还是不行，告诉我错误信息！** 🚀
