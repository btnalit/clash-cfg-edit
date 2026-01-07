import express from 'express';
import cors from 'cors';
import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import crypto from 'crypto';
import * as ftp from 'basic-ftp';

// Mihomo connection state (stored per session, keyed by apiUrl)
const mihomoSessions = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const configDir = path.join(__dirname, '../configs');
const publicDir = path.join(__dirname, 'public');

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin';
const TOKEN_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24小时

const tokens = new Map(); // 改为Map以存储过期时间
const loginAttempts = new Map(); // 存储登录尝试次数
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_TIME = 15 * 60 * 1000; // 15分钟

const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const isValidFilename = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return false;
  }
  
  const normalized = path.normalize(filename);
  
  if (normalized.includes('..') || 
      normalized.includes('/') || 
      normalized.includes('\\') ||
      path.isAbsolute(normalized)) {
    return false;
  }
  
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
    return false;
  }
  
  return true;
};

const cleanExpiredTokens = () => {
  const now = Date.now();
  for (const [token, expiry] of tokens.entries()) {
    if (now > expiry) {
      tokens.delete(token);
    }
  }
};

setInterval(cleanExpiredTokens, 60 * 60 * 1000); // 每小时清理一次过期token

const authMiddleware = (req, res, next) => {
  if (!AUTH_ENABLED) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const expiry = tokens.get(token);
  
  if (!expiry || Date.now() > expiry) {
    tokens.delete(token);
    return res.status(401).json({ success: false, message: 'Token expired or invalid' });
  }

  next();
};

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));

app.use(express.static(publicDir));

app.get('/api/auth/status', (req, res) => {
  res.json({ 
    success: true, 
    authEnabled: AUTH_ENABLED 
  });
});

app.post('/api/auth/login', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.status(400).json({ 
      success: false, 
      message: 'Authentication is not enabled' 
    });
  }

  const { username, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  const attemptData = loginAttempts.get(clientIp);
  if (attemptData && attemptData.count >= MAX_LOGIN_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attemptData.lastAttempt;
    if (timeSinceLastAttempt < LOGIN_BLOCK_TIME) {
      const remainingTime = Math.ceil((LOGIN_BLOCK_TIME - timeSinceLastAttempt) / 60000);
      return res.status(429).json({ 
        success: false, 
        message: `Too many login attempts. Please try again in ${remainingTime} minutes.` 
      });
    } else {
      loginAttempts.delete(clientIp);
    }
  }

  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    loginAttempts.delete(clientIp);
    
    const token = generateToken();
    const expiry = Date.now() + TOKEN_EXPIRY_TIME;
    tokens.set(token, expiry);
    
    res.json({ 
      success: true, 
      token,
      expiresIn: TOKEN_EXPIRY_TIME,
      message: 'Login successful' 
    });
  } else {
    const attempts = attemptData ? attemptData.count + 1 : 1;
    loginAttempts.set(clientIp, {
      count: attempts,
      lastAttempt: Date.now()
    });
    
    res.status(401).json({ 
      success: false, 
      message: 'Invalid username or password',
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts)
    });
  }
});

app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Token is valid' 
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    tokens.delete(token);
  }
  
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

// ============================================
// Mihomo Proxy API Endpoints
// ============================================

/**
 * Helper function to make requests to Mihomo External Controller
 * @param {string} apiUrl - Mihomo API base URL (e.g., "127.0.0.1:9090")
 * @param {string} endpoint - API endpoint path
 * @param {string} secret - API secret/token
 * @param {object} options - Fetch options (method, body, etc.)
 */
const mihomoRequest = async (apiUrl, endpoint, secret, options = {}) => {
  const url = `http://${apiUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }
  
  const fetchOptions = {
    method: options.method || 'GET',
    headers,
    signal: AbortSignal.timeout(10000) // 10 second timeout
  };
  
  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  
  const response = await fetch(url, fetchOptions);
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    const error = new Error(`Mihomo API error: ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.details = errorText;
    throw error;
  }
  
  // Some endpoints return empty response
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  
  return { success: true };
};

/**
 * Helper function to clean proxy data - remove runtime fields that are not part of config
 */
const cleanProxyData = (proxy) => {
  // Fields to remove (runtime/status fields from Mihomo API)
  const runtimeFields = [
    'alive', 'extra', 'history', 'id', 'interface', 'mptcp', 
    'provider-name', 'routing-mark', 'smux', 'tfo', 'uot', 'xudp',
    'now', 'all' // proxy group runtime fields
  ];
  
  const cleaned = {};
  for (const [key, value] of Object.entries(proxy)) {
    if (!runtimeFields.includes(key) && value !== '' && value !== null && value !== undefined) {
      // Convert type to lowercase for config file compatibility
      if (key === 'type') {
        cleaned[key] = value.toLowerCase();
      } else {
        cleaned[key] = value;
      }
    }
  }
  
  return cleaned;
};

/**
 * Helper function to clean base config - remove runtime fields
 */
const cleanBaseConfig = (config) => {
  // Fields to remove from base config (runtime/internal fields)
  const runtimeFields = [
    'tuic-server', 'ss-config', 'vmess-config', 'authentication',
    'skip-auth-prefixes', 'lan-allowed-ips', 'lan-disallowed-ips',
    'inbound-tfo', 'inbound-mptcp', 'geox-url', 'geo-auto-update',
    'geo-update-interval', 'geosite-matcher', 'find-process-mode',
    'sniffing', 'global-ua', 'etag-support', 'keep-alive-idle',
    'keep-alive-interval', 'disable-keep-alive'
  ];
  
  const cleaned = {};
  for (const [key, value] of Object.entries(config)) {
    if (!runtimeFields.includes(key) && value !== '' && value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
};

/**
 * Helper function to clean TUN config
 */
const cleanTunConfig = (tun) => {
  if (!tun) return null;
  
  // Fields to remove from TUN config (runtime fields)
  const runtimeFields = [
    'device', 'gso-max-size', 'inet4-address', 'inet6-address',
    'file-descriptor', 'recvmsgx'
  ];
  
  const cleaned = {};
  for (const [key, value] of Object.entries(tun)) {
    if (!runtimeFields.includes(key) && value !== '' && value !== null && value !== undefined) {
      cleaned[key] = value;
    }
  }
  
  return Object.keys(cleaned).length > 0 ? cleaned : null;
};

/**
 * Helper function to get full config from Mihomo by combining multiple API endpoints
 */
const getMihomoFullConfig = async (apiUrl, secret) => {
  // Get base config (includes tun, etc.)
  const baseConfig = await mihomoRequest(apiUrl, '/configs', secret);
  
  // Try to get DNS config from /dns endpoint
  let dnsConfig = null;
  try {
    const dnsData = await mihomoRequest(apiUrl, '/dns', secret);
    console.log('DNS data from /dns:', JSON.stringify(dnsData, null, 2));
    if (dnsData) {
      dnsConfig = dnsData;
    }
  } catch (e) {
    console.log('Failed to get DNS config:', e.message);
  }
  
  // Get proxies
  const proxiesData = await mihomoRequest(apiUrl, '/proxies', secret);
  
  // Get rules
  const rulesData = await mihomoRequest(apiUrl, '/rules', secret);
  
  // Extract actual proxy nodes (filter out proxy groups and special entries)
  const proxies = [];
  const proxyGroups = [];
  const specialTypes = ['Direct', 'Reject', 'Pass', 'Compatible', 'Selector', 'URLTest', 'Fallback', 'LoadBalance', 'Relay', 'RejectDrop'];
  
  if (proxiesData.proxies) {
    for (const [name, proxy] of Object.entries(proxiesData.proxies)) {
      const proxyType = proxy.type;
      
      if (proxyType === 'Selector' || proxyType === 'URLTest' || proxyType === 'Fallback' || proxyType === 'LoadBalance' || proxyType === 'Relay') {
        // This is a proxy group
        const groupType = {
          'Selector': 'select',
          'URLTest': 'url-test',
          'Fallback': 'fallback',
          'LoadBalance': 'load-balance',
          'Relay': 'relay'
        }[proxyType];
        
        // Only include user-defined groups, skip GLOBAL
        if (name !== 'GLOBAL') {
          proxyGroups.push({
            name: name,
            type: groupType,
            proxies: proxy.all || []
          });
        }
      } else if (!['Direct', 'Reject', 'Pass', 'Compatible', 'RejectDrop'].includes(proxyType)) {
        // This is an actual proxy node - clean runtime fields
        const cleanedProxy = cleanProxyData({ name, ...proxy });
        if (cleanedProxy.name && cleanedProxy.type) {
          proxies.push(cleanedProxy);
        }
      }
    }
  }
  
  // Extract rules
  const rules = [];
  if (rulesData.rules) {
    for (const rule of rulesData.rules) {
      // Format: TYPE,PAYLOAD,TARGET or TYPE,PAYLOAD,TARGET,no-resolve
      let ruleStr = rule.type;
      if (rule.payload) {
        ruleStr += ',' + rule.payload;
      }
      ruleStr += ',' + rule.proxy;
      rules.push(ruleStr);
    }
  }
  
  // Clean base config
  const cleanedBaseConfig = cleanBaseConfig(baseConfig);
  
  // Clean TUN config
  const cleanedTun = cleanTunConfig(baseConfig.tun);
  
  // Combine into full config
  const fullConfig = {
    ...cleanedBaseConfig,
    proxies: proxies,
    'proxy-groups': proxyGroups,
    rules: rules
  };
  
  // Add cleaned TUN config
  if (cleanedTun) {
    fullConfig.tun = cleanedTun;
  }
  
  // Add DNS config if available
  if (dnsConfig) {
    fullConfig.dns = dnsConfig;
  }
  
  // Note: sniffer config is not available via API, only 'sniffing' boolean is returned
  // We can construct a basic sniffer config based on the sniffing flag
  if (baseConfig.sniffing) {
    fullConfig.sniffer = {
      enable: true,
      'override-destination': true,
      sniff: {
        HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
        TLS: { ports: [443, 8443] },
        QUIC: { ports: [443, 8443] }
      }
    };
  }
  
  console.log('Full config loaded:', {
    proxiesCount: fullConfig.proxies?.length || 0,
    proxyGroupsCount: fullConfig['proxy-groups']?.length || 0,
    rulesCount: fullConfig.rules?.length || 0,
    hasDns: !!fullConfig.dns,
    hasSniffer: !!fullConfig.sniffer,
    hasTun: !!fullConfig.tun
  });
  
  return fullConfig;
};

/**
 * POST /api/mihomo/connect
 * Validate connection to Mihomo and get version info
 */
app.post('/api/mihomo/connect', authMiddleware, async (req, res) => {
  try {
    const { apiUrl, secret } = req.body;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    // Validate URL format (should be host:port)
    const urlPattern = /^[\w.-]+:\d+$/;
    if (!urlPattern.test(apiUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid API URL format. Expected format: host:port (e.g., 127.0.0.1:9090)'
      });
    }
    
    // Try to get version info to verify connection
    const versionInfo = await mihomoRequest(apiUrl, '/version', secret);
    
    // Store session info
    mihomoSessions.set(apiUrl, {
      secret,
      connectedAt: Date.now(),
      version: versionInfo.version || 'unknown'
    });
    
    res.json({
      success: true,
      version: versionInfo.version || 'unknown',
      message: 'Connected to Mihomo successfully'
    });
  } catch (error) {
    console.error('Mihomo connect error:', error);
    
    let errorMessage = 'Failed to connect to Mihomo';
    if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到 Mihomo，请检查地址和端口';
    } else if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
      errorMessage = '连接超时，请检查 Mihomo 是否正在运行';
    } else if (error.status === 401 || error.status === 403) {
      errorMessage = 'API 密钥错误，请检查 secret 配置';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(error.status || 500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/mihomo/config
 * Get current Mihomo running configuration (full config from multiple endpoints)
 * NOTE: Proxy credentials (server, port, uuid, password) are NOT returned by Mihomo API for security
 */
app.get('/api/mihomo/config', authMiddleware, async (req, res) => {
  try {
    const { apiUrl, secret } = req.query;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    // Get full config by combining multiple API endpoints
    const fullConfig = await getMihomoFullConfig(apiUrl, secret);
    
    console.log('Full config loaded:', {
      proxiesCount: fullConfig.proxies?.length || 0,
      proxyGroupsCount: fullConfig['proxy-groups']?.length || 0,
      rulesCount: fullConfig.rules?.length || 0
    });
    
    res.json({
      success: true,
      config: fullConfig,
      warning: '注意：由于Mihomo API安全限制，代理节点的连接信息（server、port、uuid、password等）无法获取。如需完整配置，请直接编辑配置文件。'
    });
  } catch (error) {
    console.error('Mihomo get config error:', error);
    
    let errorMessage = '获取配置失败';
    if (error.status === 401 || error.status === 403) {
      errorMessage = 'API 密钥错误，请检查 secret 配置';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到 Mihomo，请检查连接状态';
    }
    
    res.status(error.status || 500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * PATCH /api/mihomo/config
 * Update Mihomo configuration
 */
app.patch('/api/mihomo/config', authMiddleware, async (req, res) => {
  try {
    const { apiUrl, secret, config } = req.body;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Configuration object is required'
      });
    }
    
    await mihomoRequest(apiUrl, '/configs', secret, {
      method: 'PATCH',
      body: config
    });
    
    res.json({
      success: true,
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    console.error('Mihomo update config error:', error);
    
    let errorMessage = '更新配置失败';
    if (error.status === 401 || error.status === 403) {
      errorMessage = 'API 密钥错误，请检查 secret 配置';
    } else if (error.status === 400) {
      errorMessage = `配置无效: ${error.details || 'Unknown error'}`;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到 Mihomo，请检查连接状态';
    }
    
    res.status(error.status || 500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/mihomo/proxies
 * Get list of proxies from Mihomo
 */
app.get('/api/mihomo/proxies', authMiddleware, async (req, res) => {
  try {
    const { apiUrl, secret } = req.query;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    const proxies = await mihomoRequest(apiUrl, '/proxies', secret);
    
    res.json({
      success: true,
      proxies
    });
  } catch (error) {
    console.error('Mihomo get proxies error:', error);
    
    let errorMessage = '获取代理列表失败';
    if (error.status === 401 || error.status === 403) {
      errorMessage = 'API 密钥错误，请检查 secret 配置';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到 Mihomo，请检查连接状态';
    }
    
    res.status(error.status || 500).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * PUT /api/mihomo/reload
 * Reload Mihomo configuration from file
 * This triggers Mihomo to re-read its config file
 */
app.put('/api/mihomo/reload', authMiddleware, async (req, res) => {
  try {
    const { apiUrl, secret, configPath } = req.body;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    // PUT /configs with path to reload config file
    // If configPath is provided, use it; otherwise just trigger reload
    const body = configPath ? { path: configPath } : {};
    
    await mihomoRequest(apiUrl, '/configs?force=true', secret, {
      method: 'PUT',
      body
    });
    
    res.json({
      success: true,
      message: '配置重载成功'
    });
  } catch (error) {
    console.error('Mihomo reload config error:', error);
    
    let errorMessage = '重载配置失败';
    if (error.status === 401 || error.status === 403) {
      errorMessage = 'API 密钥错误，请检查 secret 配置';
    } else if (error.status === 400) {
      errorMessage = `配置无效: ${error.details || 'Unknown error'}`;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到 Mihomo，请检查连接状态';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(error.status || 500).json({
      success: false,
      error: errorMessage
    });
  }
});

// ============================================
// End of Mihomo Proxy API Endpoints
// ============================================

// ============================================
// FTP Config API Endpoints
// ============================================

/**
 * POST /api/ftp/connect
 * Test FTP connection
 */
app.post('/api/ftp/connect', authMiddleware, async (req, res) => {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  try {
    const { host, port = 21, user, password, configPath } = req.body;
    
    if (!host || !user || !password) {
      return res.status(400).json({
        success: false,
        error: '请提供 FTP 主机、用户名和密码'
      });
    }
    
    await client.access({
      host,
      port: parseInt(port),
      user,
      password,
      secure: false
    });
    
    // Try to list the directory to verify access
    const dirPath = configPath ? path.dirname(configPath) : '/';
    const list = await client.list(dirPath);
    
    res.json({
      success: true,
      message: 'FTP 连接成功',
      files: list.map(f => ({ name: f.name, type: f.type, size: f.size }))
    });
  } catch (error) {
    console.error('FTP connect error:', error);
    res.status(500).json({
      success: false,
      error: 'FTP 连接失败: ' + error.message
    });
  } finally {
    client.close();
  }
});

/**
 * POST /api/ftp/read
 * Read config file from FTP server
 */
app.post('/api/ftp/read', authMiddleware, async (req, res) => {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  try {
    const { host, port = 21, user, password, configPath } = req.body;
    
    if (!host || !user || !password || !configPath) {
      return res.status(400).json({
        success: false,
        error: '请提供完整的 FTP 连接信息和配置文件路径'
      });
    }
    
    await client.access({
      host,
      port: parseInt(port),
      user,
      password,
      secure: false
    });
    
    // Download file to memory
    const chunks = [];
    const writable = new (await import('stream')).Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });
    
    await client.downloadTo(writable, configPath);
    const content = Buffer.concat(chunks).toString('utf8');
    
    // Parse YAML
    const config = yaml.load(content);
    
    res.json({
      success: true,
      content,
      config,
      message: '配置文件读取成功'
    });
  } catch (error) {
    console.error('FTP read error:', error);
    
    let errorMessage = 'FTP 读取失败';
    if (error.code === 550) {
      errorMessage = '文件不存在或无权限访问';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  } finally {
    client.close();
  }
});

/**
 * POST /api/ftp/save
 * Save config file to FTP server
 */
app.post('/api/ftp/save', authMiddleware, async (req, res) => {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  try {
    const { host, port = 21, user, password, configPath, config } = req.body;
    
    if (!host || !user || !password || !configPath || !config) {
      return res.status(400).json({
        success: false,
        error: '请提供完整的 FTP 连接信息、配置文件路径和配置内容'
      });
    }
    
    await client.access({
      host,
      port: parseInt(port),
      user,
      password,
      secure: false
    });
    
    // Convert config to YAML
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false
    });
    
    // Upload from string
    const { Readable } = await import('stream');
    const readable = Readable.from([yamlContent]);
    
    await client.uploadFrom(readable, configPath);
    
    res.json({
      success: true,
      message: '配置文件保存成功'
    });
  } catch (error) {
    console.error('FTP save error:', error);
    res.status(500).json({
      success: false,
      error: 'FTP 保存失败: ' + error.message
    });
  } finally {
    client.close();
  }
});

/**
 * POST /api/files/save-local
 * Save config to local file with timestamp filename
 * Used for saving FTP/online configs to local backup
 */
app.post('/api/files/save-local', authMiddleware, async (req, res) => {
  try {
    const { config, prefix = 'config' } = req.body;
    
    if (!config) {
      return res.status(400).json({ success: false, error: 'Missing config' });
    }
    
    // Generate timestamp filename: prefix-YYYYMMDD-HHmmss.yaml
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') + '-' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    
    const filename = `${prefix}-${timestamp}.yaml`;
    
    // Validate filename
    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename generated' });
    }
    
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true
    });
    
    await fs.mkdir(configDir, { recursive: true });
    
    const filePath = path.join(configDir, filename);
    const realConfigDir = await fs.realpath(configDir);
    const resolvedPath = path.resolve(filePath);
    
    if (!resolvedPath.startsWith(realConfigDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    await fs.writeFile(resolvedPath, yamlContent, 'utf8');
    
    res.json({
      success: true,
      message: '配置已保存到本地',
      filename
    });
  } catch (error) {
    console.error('Save local error:', error);
    res.status(500).json({ success: false, error: '保存本地文件失败: ' + error.message });
  }
});

// ============================================
// End of FTP Config API Endpoints
// ============================================

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(configDir, { recursive: true });
      cb(null, configDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.yaml' || ext === '.yml') {
      cb(null, true);
    } else {
      cb(new Error('Only YAML files are allowed'));
    }
  }
});

app.get('/api/files/list', authMiddleware, async (req, res) => {
  try {
    await fs.mkdir(configDir, { recursive: true });
    const files = await fs.readdir(configDir);
    const yamlFiles = files.filter(f => {
      const validExt = f.endsWith('.yaml') || f.endsWith('.yml');
      return validExt && isValidFilename(f);
    });
    
    const fileList = await Promise.all(
      yamlFiles.map(async (filename) => {
        const filePath = path.join(configDir, filename);
        const stats = await fs.stat(filePath);
        return {
          name: filename,
          path: filename,
          size: stats.size,
          modified: stats.mtime
        };
      })
    );
    
    res.json({ success: true, files: fileList });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
});

app.post('/api/files/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const content = await fs.readFile(req.file.path, 'utf8');
    yaml.load(content);
    
    res.json({
      success: true,
      file: {
        name: req.file.filename,
        path: req.file.filename,
        size: req.file.size
      }
    });
  } catch (error) {
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(400).json({ success: false, error: 'Invalid YAML file: ' + error.message });
  }
});

app.get('/api/files/read/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename;
    
    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    const filePath = path.join(configDir, filename);
    const realPath = await fs.realpath(filePath).catch(() => null);
    
    if (!realPath || !realPath.startsWith(await fs.realpath(configDir))) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    const stats = await fs.stat(realPath);
    if (!stats.isFile()) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    const content = await fs.readFile(realPath, 'utf8');
    const config = yaml.load(content);
    
    res.json({
      success: true,
      filename,
      content,
      config
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'File not found' });
    } else {
      res.status(400).json({ success: false, error: 'Failed to read file' });
    }
  }
});

app.post('/api/files/save', authMiddleware, async (req, res) => {
  try {
    const { filename, config } = req.body;
    
    if (!filename || !config) {
      return res.status(400).json({ success: false, error: 'Missing filename or config' });
    }
    
    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    if (!(filename.endsWith('.yaml') || filename.endsWith('.yml'))) {
      return res.status(400).json({ success: false, error: 'Filename must end with .yaml or .yml' });
    }
    
    const yamlContent = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true
    });
    
    const filePath = path.join(configDir, filename);
    const realConfigDir = await fs.realpath(configDir);
    const resolvedPath = path.resolve(filePath);
    
    if (!resolvedPath.startsWith(realConfigDir)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    await fs.writeFile(resolvedPath, yamlContent, 'utf8');
    
    res.json({
      success: true,
      message: 'File saved successfully',
      filename
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save file' });
  }
});

app.post('/api/config/parse', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, error: 'No content provided' });
    }
    
    const config = yaml.load(content);
    
    res.json({
      success: true,
      config
    });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Invalid YAML: ' + error.message });
  }
});

app.post('/api/config/validate', authMiddleware, async (req, res) => {
  try {
    const { config } = req.body;
    
    const errors = [];
    const warnings = [];
    
    if (!config.mode) {
      warnings.push('运行模式 (mode) 未指定，将使用默认值');
    } else if (!['rule', 'global', 'direct'].includes(config.mode)) {
      errors.push('运行模式 (mode) 必须是 rule、global 或 direct 之一');
    }
    
    if (config.port && (config.port < 1 || config.port > 65535)) {
      errors.push('HTTP端口 (port) 必须在 1-65535 之间');
    }
    
    if (config['socks-port'] && (config['socks-port'] < 1 || config['socks-port'] > 65535)) {
      errors.push('SOCKS端口 (socks-port) 必须在 1-65535 之间');
    }
    
    if (config['mixed-port'] && (config['mixed-port'] < 1 || config['mixed-port'] > 65535)) {
      errors.push('混合端口 (mixed-port) 必须在 1-65535 之间');
    }
    
    if (config.proxies) {
      if (!Array.isArray(config.proxies)) {
        errors.push('代理列表 (proxies) 必须是数组');
      } else {
        config.proxies.forEach((proxy, index) => {
          if (!proxy.name) {
            errors.push(`代理 #${index + 1}: 缺少 name 字段`);
          }
          if (!proxy.type) {
            errors.push(`代理 "${proxy.name || index + 1}": 缺少 type 字段`);
          }
          if (!proxy.server) {
            errors.push(`代理 "${proxy.name || index + 1}": 缺少 server 字段`);
          }
          if (!proxy.port) {
            errors.push(`代理 "${proxy.name || index + 1}": 缺少 port 字段`);
          } else if (proxy.port < 1 || proxy.port > 65535) {
            errors.push(`代理 "${proxy.name || index + 1}": port 必须在 1-65535 之间`);
          }
        });
      }
    } else {
      warnings.push('未配置代理 (proxies)');
    }
    
    if (config['proxy-groups']) {
      if (!Array.isArray(config['proxy-groups'])) {
        errors.push('代理组 (proxy-groups) 必须是数组');
      } else {
        config['proxy-groups'].forEach((group, index) => {
          if (!group.name) {
            errors.push(`代理组 #${index + 1}: 缺少 name 字段`);
          }
          if (!group.type) {
            errors.push(`代理组 "${group.name || index + 1}": 缺少 type 字段`);
          } else if (!['select', 'url-test', 'fallback', 'load-balance', 'relay'].includes(group.type)) {
            errors.push(`代理组 "${group.name || index + 1}": type 必须是 select、url-test、fallback、load-balance 或 relay 之一`);
          }
          if (!group.proxies || !Array.isArray(group.proxies) || group.proxies.length === 0) {
            errors.push(`代理组 "${group.name || index + 1}": 必须包含至少一个代理`);
          }
        });
      }
    } else {
      warnings.push('未配置代理组 (proxy-groups)');
    }
    
    if (config.rules) {
      if (!Array.isArray(config.rules)) {
        errors.push('规则列表 (rules) 必须是数组');
      } else if (config.rules.length === 0) {
        warnings.push('规则列表 (rules) 为空');
      } else {
        config.rules.forEach((rule, index) => {
          if (typeof rule !== 'string') {
            errors.push(`规则 #${index + 1}: 必须是字符串`);
          } else {
            const parts = rule.split(',');
            if (parts.length < 2) {
              errors.push(`规则 #${index + 1} "${rule}": 格式不正确`);
            }
          }
        });
      }
    } else {
      warnings.push('未配置规则 (rules)，所有流量将使用默认策略');
    }
    
    if (config.dns) {
      if (config.dns.enable === true) {
        if (!config.dns.nameserver || !Array.isArray(config.dns.nameserver) || config.dns.nameserver.length === 0) {
          warnings.push('DNS已启用但未配置 nameserver');
        }
      }
    }
    
    res.json({
      success: true,
      valid: errors.length === 0,
      errors,
      warnings
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/files/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename;
    
    if (!isValidFilename(filename)) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    const filePath = path.join(configDir, filename);
    const realPath = await fs.realpath(filePath).catch(() => null);
    
    if (!realPath || !realPath.startsWith(await fs.realpath(configDir))) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    
    await fs.unlink(realPath);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'File not found' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Clash Config Editor running on http://localhost:${PORT}`);
  console.log(`Config directory: ${configDir}`);
});
