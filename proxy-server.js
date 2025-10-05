/**
 * Scienceing 代理服务器
 * 使用 Puppeteer 自动化浏览器，绕过 RSA 签名限制
 * 
 * 部署方式：
 * 1. 上传到你的服务器
 * 2. npm install
 * 3. npm start
 * 
 * 或使用 Replit 免费托管
 */

const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 配置（从环境变量读取）
const API_KEY = process.env.API_KEY || ''; // 如果设置了，则需要验证
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : []; // 允许的来源域名白名单
const RATE_LIMIT_WINDOW = 60 * 1000; // 速率限制时间窗口：1分钟
const RATE_LIMIT_MAX_REQUESTS = 10; // 每个时间窗口最多请求次数

// 速率限制记录
const rateLimitMap = new Map(); // IP -> { count, resetTime }

// 中间件
app.use(bodyParser.json({ limit: '1mb' })); // 限制请求体大小

// CORS 配置（支持白名单）
const corsOptions = {
  origin: function (origin, callback) {
    // 如果没有配置白名单，允许所有来源
    if (ALLOWED_ORIGINS.length === 0) {
      callback(null, true);
      return;
    }
    
    // 允许没有 origin 的请求（如 Postman、curl）
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // 检查白名单
    if (ALLOWED_ORIGINS.some(allowed => origin.includes(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('不允许的来源'));
    }
  },
  credentials: true,
  maxAge: 86400 // 预检请求缓存 24 小时
};

app.use(cors(corsOptions));

// 全局变量
let browser = null;
let page = null;
let isLoggedIn = false;
let lastLoginEmail = ''; // 记录上次登录的邮箱，用于判断是否需要重新登录

// ============================================
// 安全中间件
// ============================================

// 1. API 密钥验证
function verifyApiKey(req, res, next) {
  // 如果未设置 API_KEY，则不验证
  if (!API_KEY) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    console.warn(`⚠️ API 密钥验证失败: ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: '无效的 API 密钥'
    });
  }
  
  next();
}

// 2. 速率限制（防止暴力攻击）
function rateLimiter(req, res, next) {
  const clientIP = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  // 清理过期记录
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
  
  // 获取或创建该 IP 的记录
  let record = rateLimitMap.get(clientIP);
  
  if (!record) {
    record = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW
    };
    rateLimitMap.set(clientIP, record);
  }
  
  // 检查是否超过限制
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const remainingTime = Math.ceil((record.resetTime - now) / 1000);
    console.warn(`⚠️ 速率限制触发: ${clientIP} (${record.count} 次请求)`);
    return res.status(429).json({
      success: false,
      error: `请求过于频繁，请在 ${remainingTime} 秒后重试`,
      retryAfter: remainingTime
    });
  }
  
  // 增加计数
  record.count++;
  
  next();
}

// 3. 请求日志（监控异常行为）
function requestLogger(req, res, next) {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // 记录请求
  console.log(`📥 [${new Date().toLocaleTimeString('zh-CN')}] ${req.method} ${req.path} - IP: ${clientIP}`);
  
  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusColor = res.statusCode >= 400 ? '❌' : '✅';
    console.log(`${statusColor} [${new Date().toLocaleTimeString('zh-CN')}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
}

// ============================================
// 初始化浏览器
// ============================================

async function initBrowser() {
  console.log('🚀 初始化浏览器...');
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ]
    });
    
    page = await browser.newPage();
    
    // 设置视口
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 设置 User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    console.log('✅ 浏览器初始化完成');
    return true;
  } catch (error) {
    console.error('❌ 浏览器初始化失败:', error.message);
    return false;
  }
}

// ============================================
// 登录 Scienceing
// ============================================

async function login(email, password) {
  console.log(`🔐 登录: ${email}`);
  
  // 记录当前登录的邮箱
  lastLoginEmail = email;
  
  try {
    // 访问首页
    await page.goto('https://www.scienceing.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('📄 页面加载完成');
    
    // 等待页面稳定
    await page.waitForTimeout(2000);
    
    // TODO: 根据实际登录页面调整
    // 方法 1: 如果有登录按钮，点击打开登录框
    try {
      await page.click('.login-button', { timeout: 5000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('⚠️ 未找到登录按钮，可能已在登录页');
    }
    
    // 方法 2: 填写登录表单
    // 注意：你需要根据实际页面的 HTML 结构调整选择器
    try {
      // 尝试常见的选择器
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input#email',
        'input#username'
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          emailInput = selector;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!emailInput) {
        throw new Error('未找到邮箱输入框');
      }
      
      console.log(`✅ 找到邮箱输入框: ${emailInput}`);
      await page.type(emailInput, email, { delay: 50 });
      
      // 密码输入框
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input#password'
      ];
      
      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          passwordInput = selector;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordInput) {
        throw new Error('未找到密码输入框');
      }
      
      console.log(`✅ 找到密码输入框: ${passwordInput}`);
      await page.type(passwordInput, password, { delay: 50 });
      
      // 点击登录按钮
      const submitSelectors = [
        'button[type="submit"]',
        'button.login-btn',
        'button.submit-btn',
        '.login-button'
      ];
      
      let submitButton = null;
      for (const selector of submitSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          submitButton = selector;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!submitButton) {
        throw new Error('未找到登录按钮');
      }
      
      console.log(`✅ 找到登录按钮: ${submitButton}`);
      await page.click(submitButton);
      
      // 等待登录完成
      await page.waitForTimeout(3000);
      
      // 检查是否登录成功
      const currentUrl = page.url();
      console.log('📍 当前 URL:', currentUrl);
      
      // 简单判断：如果还在登录页，可能失败了
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        throw new Error('登录失败，仍在登录页面');
      }
      
      isLoggedIn = true;
      console.log('✅ 登录成功');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ 登录失败:', error.message);
      return { success: false, error: error.message };
    }
    
  } catch (error) {
    console.error('❌ 登录异常:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// 搜索文章（拦截 API 响应）
// ============================================

async function searchArticles(keyword, options = {}) {
  console.log(`🔍 搜索: "${keyword}"`);
  
  const {
    pageSize = 20,
    pageNum = 1
  } = options;
  
  try {
    let apiResponse = null;
    
    // 设置响应拦截器
    const responseHandler = async (response) => {
      const url = response.url();
      
      // 拦截搜索 API
      if (url.includes('/search/easySearch/v1/searchList')) {
        try {
          const data = await response.json();
          console.log('✅ 拦截到搜索 API 响应');
          apiResponse = data;
        } catch (error) {
          console.error('解析 API 响应失败:', error);
        }
      }
    };
    
    page.on('response', responseHandler);
    
    // 构造搜索 URL
    const searchUrl = `https://www.scienceing.com/result?k=${encodeURIComponent(keyword)}&s=3&searchType=en`;
    
    console.log('📡 访问:', searchUrl);
    
    // 访问搜索页面
    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // 等待 API 响应
    let waitTime = 0;
    while (!apiResponse && waitTime < 30000) {
      await page.waitForTimeout(500);
      waitTime += 500;
    }
    
    // 移除监听器
    page.off('response', responseHandler);
    
    if (!apiResponse) {
      throw new Error('未能拦截到 API 响应');
    }
    
    // 解析文章数据
    const articles = apiResponse.result?.searchArticleResps || [];
    
    console.log(`✅ 找到 ${articles.length} 篇文章`);
    
    // 转换为标准格式
    const parsedArticles = articles.map(article => ({
      title: article.titleCn || article.titleOriginal || '',
      titleEn: article.titleOriginal || '',
      titleCn: article.titleCn || '',
      authors: (article.authorOriginal || []).map(name => ({ name })),
      institutions: article.affiliationCn || article.affiliationOriginal || [],
      abstract: article.abstractCn || article.abstractOriginal || '',
      abstractEn: article.abstractOriginal || '',
      abstractCn: article.abstractCn || '',
      publishDate: article.publicationDay || '',
      publishYear: article.publicationYear,
      journal: article.publication || '',
      publisher: article.publisher || '',
      doi: article.doi || '',
      url: article.landingPageUrl || '',
      articleType: article.articleTypeCn || article.articleType || '',
      keywords: article.articleConceptCn || []
    }));
    
    return {
      success: true,
      data: {
        articles: parsedArticles,
        totalCount: apiResponse.totalNum || articles.length,
        currentPage: apiResponse.currentPage || pageNum,
        totalPages: apiResponse.totalPage || 1,
        keyword,
        searchTime: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('❌ 搜索失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// API 路由
// ============================================

// 应用安全中间件到所有 API 路由
app.use('/api/*', requestLogger);
app.use('/api/*', rateLimiter);

// 健康检查（不需要速率限制）
app.get('/health', requestLogger, async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.floor(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    browser: {
      ready: browser !== null,
      pages: browser ? (await browser.pages()).length : 0
    },
    auth: {
      loggedIn: isLoggedIn,
      lastLoginEmail: lastLoginEmail || '未登录'
    }
  };
  
  res.json(health);
});

// 登录接口
app.post('/api/login', verifyApiKey, async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: '缺少 email 或 password 参数'
    });
  }
  
  try {
    const result = await login(email, password);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 搜索接口
app.post('/api/search', verifyApiKey, async (req, res) => {
  const { keyword, timeRange, pageSize, page } = req.body;
  
  if (!keyword) {
    return res.status(400).json({
      success: false,
      error: '缺少 keyword 参数'
    });
  }
  
  // 确保已登录
  if (!isLoggedIn) {
    return res.status(401).json({
      success: false,
      error: '未登录，请先调用 /api/login 或使用 /api/search-auto'
    });
  }
  
  try {
    const result = await searchArticles(keyword, {
      timeRange,
      pageSize,
      page
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 一键登录并搜索（推荐使用）⭐
app.post('/api/search-auto', verifyApiKey, async (req, res) => {
  const { 
    keyword, 
    email, 
    password, 
    timeRange, 
    pageSize, 
    page 
  } = req.body;
  
  if (!keyword) {
    return res.status(400).json({
      success: false,
      error: '缺少 keyword 参数'
    });
  }
  
  try {
    // 检查是否需要登录或重新登录
    const needLogin = !isLoggedIn || (email && email !== lastLoginEmail);
    
    if (needLogin) {
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: '需要提供登录凭据（email 和 password）'
        });
      }
      
      console.log('🔐 自动登录...');
      const loginResult = await login(email, password);
      
      if (!loginResult.success) {
        return res.status(401).json(loginResult);
      }
    }
    
    // 执行搜索
    const result = await searchArticles(keyword, {
      timeRange,
      pageSize,
      page
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 重新登录接口（如果登录失效）
app.post('/api/re-login', verifyApiKey, async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: '缺少 email 或 password 参数'
    });
  }
  
  try {
    isLoggedIn = false;
    const result = await login(email, password);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 启动服务器
// ============================================

app.listen(PORT, async () => {
  console.log('========================================');
  console.log('🚀 Scienceing 代理服务器');
  console.log('========================================');
  console.log(`📡 服务器: http://localhost:${PORT}`);
  console.log(`⏰ 启动时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log();
  console.log('🔒 安全配置:');
  console.log(`  - API 密钥: ${API_KEY ? '✅ 已设置' : '⚠️ 未设置（建议设置）'}`);
  console.log(`  - 来源白名单: ${ALLOWED_ORIGINS.length > 0 ? `✅ 已配置 (${ALLOWED_ORIGINS.length} 个域名)` : '⚠️ 未配置（允许所有来源）'}`);
  console.log(`  - 速率限制: ✅ 已启用 (${RATE_LIMIT_MAX_REQUESTS} 次/分钟)`);
  console.log(`  - 请求日志: ✅ 已启用`);
  console.log(`  - 账号密码: ✅ 通过 API 请求传入（不存储）`);
  console.log();
  
  // 初始化浏览器
  const browserReady = await initBrowser();
  
  if (!browserReady) {
    console.error('❌ 浏览器初始化失败，服务器可能无法正常工作');
  }
  
  console.log();
  console.log('========================================');
  console.log('✅ 服务器启动完成！');
  console.log('========================================');
  console.log();
  console.log('📖 可用的 API:');
  console.log(`  GET  /health - 健康检查`);
  console.log(`  POST /api/login - 登录`);
  console.log(`  POST /api/search - 搜索（需先登录）`);
  console.log(`  POST /api/search-auto - 一键搜索 ⭐ 推荐`);
  console.log(`  POST /api/re-login - 重新登录`);
  console.log();
  console.log('💡 使用示例:');
  console.log(`  curl -X POST http://localhost:${PORT}/api/search-auto \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"keyword":"人工智能","email":"xxx@xxx.com","password":"xxx"}'`);
  console.log();
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🛑 正在关闭服务器...');
  if (browser) {
    await browser.close();
    console.log('✅ 浏览器已关闭');
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 收到终止信号，关闭服务器...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
