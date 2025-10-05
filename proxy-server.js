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
const DEFAULT_EMAIL = process.env.SCIENCEING_EMAIL || '';
const DEFAULT_PASSWORD = process.env.SCIENCEING_PASSWORD || '';
const API_KEY = process.env.API_KEY || ''; // 如果设置了，则需要验证

// 中间件
app.use(bodyParser.json());
app.use(cors());

// 全局变量
let browser = null;
let page = null;
let isLoggedIn = false;
let loginCredentials = {
  email: DEFAULT_EMAIL,
  password: DEFAULT_PASSWORD
};

// ============================================
// API 密钥验证中间件
// ============================================

function verifyApiKey(req, res, next) {
  // 如果未设置 API_KEY，则不验证
  if (!API_KEY) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: '无效的 API 密钥'
    });
  }
  
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
  
  // 保存凭据供后续使用
  loginCredentials = { email, password };
  
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

// 健康检查
app.get('/health', async (req, res) => {
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
      hasCredentials: !!(loginCredentials.email && loginCredentials.password)
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
    // 如果未登录，先登录
    if (!isLoggedIn) {
      const loginEmail = email || loginCredentials.email;
      const loginPassword = password || loginCredentials.password;
      
      if (!loginEmail || !loginPassword) {
        return res.status(400).json({
          success: false,
          error: '未登录且缺少登录凭据（email/password）'
        });
      }
      
      console.log('🔐 自动登录...');
      const loginResult = await login(loginEmail, loginPassword);
      
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
  try {
    isLoggedIn = false;
    
    const result = await login(
      loginCredentials.email,
      loginCredentials.password
    );
    
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
  console.log(`🔑 API 密钥: ${API_KEY ? '已设置' : '未设置（不验证）'}`);
  console.log(`👤 默认账号: ${DEFAULT_EMAIL ? '已配置' : '未配置'}`);
  console.log();
  
  // 初始化浏览器
  const browserReady = await initBrowser();
  
  if (!browserReady) {
    console.error('❌ 浏览器初始化失败，服务器可能无法正常工作');
  }
  
  // 如果有默认账号，自动登录
  if (DEFAULT_EMAIL && DEFAULT_PASSWORD) {
    console.log('🔐 使用默认账号自动登录...');
    const loginResult = await login(DEFAULT_EMAIL, DEFAULT_PASSWORD);
    if (loginResult.success) {
      console.log('✅ 自动登录成功');
    } else {
      console.log('⚠️ 自动登录失败:', loginResult.error);
    }
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
