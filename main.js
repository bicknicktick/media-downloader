const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

let mainWindow;
let expressApp;
let expressServer;
const PORT = 31720; // Unique port for Media Downloader API

// Store active downloads and their progress
const activeDownloads = new Map();

// Find yt-dlp executable path
function findYtDlpPath() {
  // Common locations for yt-dlp
  const commonPaths = [
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp', // macOS Homebrew
    path.join(os.homedir(), '.local/bin/yt-dlp'),
    'yt-dlp' // Fallback to PATH
  ];

  // Try to find yt-dlp in common locations
  for (const ytdlpPath of commonPaths) {
    try {
      if (ytdlpPath === 'yt-dlp') {
        // Check if it's in PATH
        try {
          execSync('which yt-dlp', { stdio: 'ignore' });
          return 'yt-dlp';
        } catch (e) {
          continue;
        }
      } else {
        // Check if file exists
        if (fs.existsSync(ytdlpPath) && fs.statSync(ytdlpPath).isFile()) {
          // Check if it's executable
          try {
            fs.accessSync(ytdlpPath, fs.constants.X_OK);
            return ytdlpPath;
          } catch (e) {
            continue;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  // If not found, try to find it using 'which' command
  try {
    const whichResult = execSync('which yt-dlp', { encoding: 'utf8' }).trim();
    if (whichResult) {
      return whichResult;
    }
  } catch (e) {
    // which command failed
  }

  // Return default (will fail with better error message)
  return 'yt-dlp';
}

// Platform detection utility
function detectPlatform(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();

    // YouTube and variants
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be') ||
        hostname.includes('youtube-nocookie.com')) {
      return { platform: 'YouTube', icon: '📺', supported: true };
    }

    // TikTok - Check for photo URLs (not supported)
    if (hostname.includes('tiktok.com') || hostname.includes('vm.tiktok.com')) {
      if (pathname.includes('/photo/')) {
        return {
          platform: 'TikTok (Photo)',
          icon: '📷',
          supported: false,
          message: 'TikTok photos are not supported. Only videos can be downloaded.'
        };
      }
      return { platform: 'TikTok', icon: '🎵', supported: true };
    }

    // Instagram - Check for different content types
    if (hostname.includes('instagram.com') || hostname.includes('instagr.am')) {
      if (pathname.includes('/reel/')) {
        return { platform: 'Instagram (Reel)', icon: '🎬', supported: true };
      } else if (pathname.includes('/p/') || pathname.includes('/tv/')) {
        return { platform: 'Instagram', icon: '📸', supported: true };
      }
      return { platform: 'Instagram', icon: '📸', supported: true };
    }

    // Google Drive
    if (hostname.includes('drive.google.com') || hostname.includes('docs.google.com')) {
      return { platform: 'Google Drive', icon: '☁️', supported: true };
    }

    // Facebook
    if (hostname.includes('facebook.com') || hostname.includes('fb.com') ||
        hostname.includes('fb.watch')) {
      return { platform: 'Facebook', icon: '👥', supported: true };
    }

    // Twitter/X
    if (hostname.includes('twitter.com') || hostname.includes('x.com') ||
        hostname.includes('t.co')) {
      return { platform: 'Twitter/X', icon: '🐦', supported: true };
    }

    // Vimeo
    if (hostname.includes('vimeo.com')) {
      return { platform: 'Vimeo', icon: '🎬', supported: true };
    }

    // Dailymotion
    if (hostname.includes('dailymotion.com')) {
      return { platform: 'Dailymotion', icon: '🎥', supported: true };
    }

    // Twitch
    if (hostname.includes('twitch.tv')) {
      return { platform: 'Twitch', icon: '🎮', supported: true };
    }

    // Reddit
    if (hostname.includes('reddit.com') || hostname.includes('redd.it')) {
      return { platform: 'Reddit', icon: '📱', supported: true };
    }

    // Pinterest
    if (hostname.includes('pinterest.com') || hostname.includes('pin.it')) {
      return { platform: 'Pinterest', icon: '📌', supported: true };
    }

    // LinkedIn
    if (hostname.includes('linkedin.com')) {
      return { platform: 'LinkedIn', icon: '💼', supported: true };
    }

    // SoundCloud
    if (hostname.includes('soundcloud.com')) {
      return { platform: 'SoundCloud', icon: '🎧', supported: true };
    }

    // Spotify (for podcasts)
    if (hostname.includes('spotify.com') || hostname.includes('open.spotify.com')) {
      return { platform: 'Spotify', icon: '🎵', supported: true };
    }

    // Bilibili
    if (hostname.includes('bilibili.com') || hostname.includes('b23.tv')) {
      return { platform: 'Bilibili', icon: '🇨🇳', supported: true };
    }

    // Douyin (Chinese TikTok)
    if (hostname.includes('douyin.com')) {
      return { platform: 'Douyin', icon: '🇨🇳', supported: true };
    }

    // Xiaohongshu (RedNote)
    if (hostname.includes('xiaohongshu.com') || hostname.includes('xhslink.com')) {
      return { platform: 'Xiaohongshu', icon: '📕', supported: true };
    }

    // Kuaishou
    if (hostname.includes('kuaishou.com')) {
      return { platform: 'Kuaishou', icon: '🇨🇳', supported: true };
    }

    // Generic support check - yt-dlp supports many more platforms
    return { platform: 'Unknown/Generic', icon: '🌐', supported: true };

  } catch (error) {
    return { platform: 'Invalid URL', icon: '❌', supported: false };
  }
}

// Create Express server untuk handle downloads
async function startExpressServer() {
  console.log('Starting Express server setup...');
  return new Promise((resolve, reject) => {
    try {
      expressApp = express();
      expressApp.use(cors());
      expressApp.use(bodyParser.json());

      console.log('Adding API endpoints...');

      // Health check endpoint
      expressApp.get('/api/health', (req, res) => {
        console.log('Health check endpoint called');
        res.json({ status: 'ok', message: 'Express API is running' });
      });

      // Platform detection endpoint
      expressApp.post('/api/detect-platform', (req, res) => {
        const { url } = req.body;
        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        const platformInfo = detectPlatform(url);
        res.json(platformInfo);
      });

      // SSE endpoint for progress updates
      expressApp.get('/api/progress/:downloadId', (req, res) => {
        const { downloadId } = req.params;
        console.log(`Progress SSE connection for download: ${downloadId}`);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
        });

        // Send initial progress
        const download = activeDownloads.get(downloadId);
        if (download) {
          res.write(`data: ${JSON.stringify(download.progress)}\n\n`);
        }

        // Set up progress listener
        const progressListener = (progress) => {
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        };

        // Store the listener
        if (!download) {
          activeDownloads.set(downloadId, { progress: { progress: 0, status: 'starting' }, listeners: [] });
        }
        activeDownloads.get(downloadId).listeners.push(progressListener);

        // Clean up on disconnect
        req.on('close', () => {
          const download = activeDownloads.get(downloadId);
          if (download) {
            download.listeners = download.listeners.filter(listener => listener !== progressListener);
          }
        });
      });

      // Download endpoint
      expressApp.post('/api/download', async (req, res) => {
        console.log('Download endpoint called with:', req.body);
        const { url, outputDir } = req.body;

        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        try {
          // Generate unique download ID
          const downloadId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

          // Start download asynchronously using unified service
          // Add error handler to propagate failures to frontend via SSE
          downloadMediaUnified(url, outputDir, downloadId)
            .catch(error => {
              console.error('Download failed:', error);
              // Update progress to show failure to all listeners
              const download = activeDownloads.get(downloadId);
              if (download) {
                download.progress = { 
                  ...download.progress, 
                  status: 'failed', 
                  error: error.message 
                };
                download.listeners.forEach(listener => {
                  try { 
                    listener(download.progress); 
                  } catch (e) {
                    console.error('Error notifying listener:', e);
                  }
                });
              }
            });

          // Return download ID immediately
          res.json({ 
            downloadId,
            message: 'Download started',
            status: 'starting'
          });
        } catch (error) {
          console.error('Download error:', error);
          res.status(500).json({ error: error.message });
        }
      });

      // Get download history
      expressApp.get('/api/history', (req, res) => {
        console.log('History endpoint called');
        try {
          const historyFile = path.join(os.homedir(), '.media-downloader', 'history.json');
          if (fs.existsSync(historyFile)) {
            const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            res.json(history);
          } else {
            res.json([]);
          }
        } catch (error) {
          console.error('History error:', error);
          res.status(500).json({ error: error.message });
        }
      });

      // Error handling middleware
      expressApp.use((err, req, res, next) => {
        console.error('Express error:', err);
        res.status(500).json({ error: err.message });
      });

      console.log(`Attempting to start Express server on port ${PORT}...`);
      expressServer = expressApp.listen(PORT, '127.0.0.1', () => {
        console.log(`✅ Express server running on http://localhost:${PORT}`);
        resolve(); // Resolve the promise when server is ready
      });

      expressServer.on('error', (err) => {
        console.error('❌ Express server error:', err);
        reject(err); // Reject the promise on error
      });

      console.log('Express server setup completed');
    } catch (error) {
      console.error('❌ Failed to start Express server:', error);
      reject(error);
    }
  });
}

// Unified download service with smart URL routing (BitzyStreamGO inspired)
async function downloadMediaUnified(url, outputDir = null, downloadId) {
  return new Promise((resolve, reject) => {
    // Smart platform detection and routing
    const platformInfo = detectPlatform(url);

    // For Google Drive URLs, try direct download first, then fallback to yt-dlp
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      console.log(`[Unified] Google Drive URL detected: ${platformInfo.platform}`);
      // For now, use yt-dlp directly (we can add direct download later if needed)
      return downloadWithYtDlp(url, outputDir, downloadId, platformInfo).then(resolve).catch(reject);
    } else {
      // For all other platforms, use yt-dlp directly
      console.log(`[Unified] ${platformInfo.platform} URL detected, using yt-dlp`);
      return downloadWithYtDlp(url, outputDir, downloadId, platformInfo).then(resolve).catch(reject);
    }
  });
}
// Download media using yt-dlp (BitzyStreamGO optimized)
async function downloadWithYtDlp(url, outputDir = null, downloadId, platformInfo = null) {
  return new Promise((resolve, reject) => {
    if (!outputDir) {
      outputDir = path.join(os.homedir(), 'Downloads', 'MediaDownloader');
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate filename with wildcard for extension (let yt-dlp choose the format)
    const timestamp = Date.now();
    const filename = `video_${timestamp}`;
    const outputPath = path.join(outputDir, `${filename}.%(ext)s`);

    // Use provided platformInfo or detect it
    if (!platformInfo) {
      platformInfo = detectPlatform(url);
    }

    // Initialize download tracking with platform info
    activeDownloads.set(downloadId, {
      progress: {
        progress: 0,
        status: 'starting',
        filename: null,
        platform: platformInfo.platform,
        platformIcon: platformInfo.icon
      },
      listeners: []
    });

    // Update progress function
    const updateProgress = (progress) => {
      const download = activeDownloads.get(downloadId);
      if (download) {
        download.progress = { ...download.progress, ...progress };
        // Notify all listeners
        download.listeners.forEach(listener => {
          try {
            listener(download.progress);
          } catch (error) {
            console.error('Error notifying listener:', error);
          }
        });
      }
    };

    // --- CACHE CHECK ---
    try {
      const urlHash = crypto.createHash('md5').update(url).digest('hex');
      const cachePath = path.join(os.tmpdir(), `cached_md_dl_${urlHash}.mp4`);
      
      if (fs.existsSync(cachePath)) {
        console.log(`📦 CACHE HIT: Using cached video for URL: ${url}`);
        const actualFilename = `${filename}.mp4`;
        const actualOutputPath = path.join(outputDir, actualFilename);
        
        fs.copyFileSync(cachePath, actualOutputPath);
        
        const stats = fs.statSync(actualOutputPath);
        const result = {
          success: true,
          filename: actualFilename,
          filepath: actualOutputPath,
          filesize: stats.size,
          url: url,
          timestamp: new Date().toISOString(),
          status: 'completed',
          downloadId: downloadId,
          platform: platformInfo.platform
        };
        
        updateProgress({ progress: 100, status: 'completed', filename: actualFilename });
        saveToHistory(result);
        
        setTimeout(() => {
          activeDownloads.delete(downloadId);
        }, 5000);
        
        return resolve(result);
      }
    } catch (e) {
      console.error(`⚠️ Cache check error: ${e.message}`);
    }
    // -------------------

    // Build yt-dlp command with enhanced platform support (BitzyStreamGO optimized)
    const args = [
      '--ignore-config',
      '--no-check-certificate',
      '--no-warnings',
      '--progress',
      '--newline', // Output progress on new lines
      '--socket-timeout', '30', // Socket timeout 30s
      '--retries', '5', // Retry 5 times on failure
      '--fragment-retries', '10', // Additional retries for fragmented content
      '--retry-sleep', '2', // Wait 2 seconds between retries
      // YouTube specific options to bypass 403 errors
      '--extractor-args', 'youtube:player_client=web,android',
      // Enhanced format selection for multiple platforms (prioritize MP4)
      '-f', 'best[ext=mp4]/best[ext=webm]/best/best',
      '--merge-output-format', 'mp4',
      // Additional reliability options
      '--buffer-size', '16K', // Smaller buffer for better stability
      '--http-chunk-size', '10M', // Chunk size for downloads
      '--no-part', // Don't use .part files
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-o', outputPath,
      url
    ];

    // Find yt-dlp executable
    const ytdlpPath = findYtDlpPath();
    console.log(`[yt-dlp] Using path: ${ytdlpPath}`);
    
    const ytdlp = spawn(ytdlpPath, args);
    let progressData = '';
    let errorData = '';

    updateProgress({ status: 'downloading', filename: 'Detecting video...' });

    // Add timeout protection (10 minutes like BitzyStreamGO)
    const timeout = setTimeout(() => {
      console.log('[yt-dlp] Download timeout after 10 minutes');
      ytdlp.kill('SIGTERM');
      clearInterval(progressTicker); // Clear progress ticker
      updateProgress({ status: 'failed' });
      reject(new Error('Download timeout: video may be too large or network too slow. Try a shorter video or check your connection'));
    }, 10 * 60 * 1000); // 10 minutes

    // Progress simulation ticker (like BitzyStreamGO)
    let currentProgress = 5;
    const progressTicker = setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += Math.random() * 5; // Random increment for more realistic progress
        updateProgress({ progress: Math.min(Math.round(currentProgress), 95) });
      }
    }, 2000); // Update every 2 seconds

    ytdlp.stdout.on('data', (data) => {
      progressData += data.toString();

      // Parse progress from yt-dlp output
      const output = data.toString();

      // Extract filename from output
      const filenameMatch = output.match(/\[download\]\s+(.+?)\s+has already been downloaded/);
      if (filenameMatch) {
        updateProgress({ filename: filenameMatch[1] });
      }

      // Extract progress percentage
      const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        updateProgress({ progress: Math.round(progress) });
      }

      // Extract speed and ETA
      const speedMatch = output.match(/at\s+([\d.]+[KMGT]?i?B\/s)/);
      if (speedMatch) {
        updateProgress({ speed: speedMatch[1] });
      }

      const etaMatch = output.match(/ETA\s+([\d:]+)/);
      if (etaMatch) {
        updateProgress({ eta: etaMatch[1] });
      }

      // Check for completion (100% or 100.0% formats)
      if (output.includes('has already been downloaded') || 
          output.match(/\[download\]\s+100(?:\.0)?%/)) {
        clearInterval(progressTicker); // Clear progress ticker
        updateProgress({ progress: 100, status: 'completed' });
      }
    });

    ytdlp.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      errorData += errorMsg;
      console.error('[yt-dlp stderr]', errorMsg);
    });

    ytdlp.on('close', (code) => {
      console.log(`[yt-dlp] Process exited with code: ${code}`);
      clearTimeout(timeout); // Clear timeout
      clearInterval(progressTicker); // Clear progress ticker
      
      if (code === 0) {
        // Find the actual downloaded file (with any extension)
        const files = fs.readdirSync(outputDir).filter(f => f.startsWith(filename));
        
        if (files.length > 0) {
          const actualFilename = files[0];
          const actualOutputPath = path.join(outputDir, actualFilename);
          const stats = fs.statSync(actualOutputPath);
          
          // --- CACHE SAVE ---
          try {
            const urlHash = crypto.createHash('md5').update(url).digest('hex');
            const cachePath = path.join(os.tmpdir(), `cached_md_dl_${urlHash}.mp4`);
            fs.copyFileSync(actualOutputPath, cachePath);
            console.log(`💾 CACHE SAVED: Video cached at ${cachePath}`);
          } catch (e) {
            console.error(`⚠️ Failed to save cache: ${e.message}`);
          }
          // ------------------
          
          const result = {
            success: true,
            filename: actualFilename,
            filepath: actualOutputPath,
            filesize: stats.size,
            url: url,
            timestamp: new Date().toISOString(),
            status: 'completed',
            downloadId: downloadId,
            platform: platformInfo.platform
          };

          updateProgress({ progress: 100, status: 'completed', filename: actualFilename });

          // Save to history
          saveToHistory(result);

          // Clean up download tracking
          setTimeout(() => {
            activeDownloads.delete(downloadId);
          }, 5000);

          resolve(result);
        } else {
          // Clean up download tracking on failure
          setTimeout(() => {
            activeDownloads.delete(downloadId);
          }, 5000);
          reject(new Error('Download completed but file not found'));
        }
      } else {
        // Enhanced error handling
        let errorMessage = `yt-dlp failed with code ${code}`;

        if (errorData.includes('HTTP Error 403')) {
          errorMessage = 'YouTube blocked the download (HTTP 403). This is usually due to:\n1. YouTube rate limiting\n2. Network/IP restrictions\n3. Video region restrictions\n\nTry:\n- Wait a few minutes and try again\n- Use a different network/VPN\n- Try a different YouTube video\n- Ensure yt-dlp is up to date';
        } else if (errorData.includes('Unsupported URL')) {
          const platformName = platformInfo.platform;
          if (platformName === 'TikTok' && url.includes('/photo/')) {
            errorMessage = `${platformName} photos are not supported. Only videos can be downloaded from ${platformName}.`;
          } else if (platformName === 'Instagram' && url.includes('/reel/')) {
            errorMessage = `${platformName} reels may require authentication. Try a different URL.`;
          } else {
            errorMessage = `URL not supported by ${platformName}. This content type may not be downloadable.`;
          }
        } else if (errorData.includes('Private video')) {
          errorMessage = 'This video is private and cannot be downloaded.';
        } else if (errorData.includes('Sign in to confirm')) {
          errorMessage = 'This content requires authentication. Sign in to the platform first.';
        } else if (errorData.includes('Geo-blocked')) {
          errorMessage = 'This content is geo-blocked in your region.';
        } else if (errorData.includes('Video unavailable')) {
          errorMessage = 'This video is no longer available or has been removed.';
        } else if (errorData.includes('Unable to extract')) {
          errorMessage = `${platformInfo.platform} content extraction failed. URL may be invalid or content removed.`;
        } else if (errorData.includes('No such file or directory') && errorData.includes('cookies')) {
          errorMessage = 'Chrome cookies not found. Please ensure Chrome is installed and you have visited YouTube.';
        }

        updateProgress({ status: 'failed' });
        
        // Clean up download tracking on failure
        setTimeout(() => {
          activeDownloads.delete(downloadId);
        }, 5000);
        
        reject(new Error(errorMessage));
      }
    });

    ytdlp.on('error', (error) => {
      clearTimeout(timeout); // Clear timeout
      clearInterval(progressTicker); // Clear progress ticker
      console.error('[yt-dlp] Spawn error:', error);
      console.error('[yt-dlp] Attempted path:', ytdlpPath);
      console.error('[yt-dlp] Error code:', error.code);
      console.error('[yt-dlp] Error message:', error.message);
      
      let errorMessage = `Failed to start yt-dlp: ${error.message}`;
      if (error.code === 'ENOENT') {
        errorMessage += `. yt-dlp not found at: ${ytdlpPath}. Please install yt-dlp: sudo apt-get install yt-dlp or pip install yt-dlp`;
      }
      
      updateProgress({ status: 'failed', error: errorMessage });
      
      // Clean up download tracking on error
      setTimeout(() => {
        activeDownloads.delete(downloadId);
      }, 5000);
      
      reject(new Error(errorMessage));
    });
  });
}

// Save download to history
function saveToHistory(downloadResult) {
  const historyDir = path.join(os.homedir(), '.media-downloader');
  const historyFile = path.join(historyDir, 'history.json');

  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  let history = [];
  if (fs.existsSync(historyFile)) {
    history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  }

  history.unshift(downloadResult);
  // Keep only last 100 downloads
  history = history.slice(0, 100);

  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}

// Create window
function createWindow() {
  console.log('Creating Electron window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: false // Disable sandbox for development
    }
  });

  console.log('Loading URL...');
  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, './build/index.html')}`;

  mainWindow.loadURL(startUrl);

  console.log('URL loaded, setting up event handlers...');
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });

  console.log('Window creation completed');
}

// IPC handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('open-file-location', (event, filepath) => {
  const dir = path.dirname(filepath);
  require('child_process').exec(`xdg-open "${dir}"` || `open "${dir}"`);
});

// App events
app.on('ready', async () => {
  console.log('Electron app ready, starting Express server...');
  try {
    await startExpressServer();
    console.log('Express server started successfully');
    console.log('Creating Electron window...');
    createWindow();
  } catch (error) {
    console.error('Failed to start Express server:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle squirrel events on Windows (optional, skip if module not available)
// Note: electron-squirrel-startup module removed from dependencies
// Windows auto-updater functionality not needed for this app

// Cleanup on exit
app.on('before-quit', () => {
  if (expressServer) {
    expressServer.close();
  }
});
