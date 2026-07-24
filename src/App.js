import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import DownloadForm from './components/DownloadForm';
import DownloadHistory from './components/DownloadHistory';
import LogViewer from './components/LogViewer';

function App() {
  const [activeTab, setActiveTab] = useState('download');
  const [downloads, setDownloads] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentDownload, setCurrentDownload] = useState(null); // { url, progress, status }
  const [downloadQueue, setDownloadQueue] = useState([]); // Array of {url, status, progress, downloadId, platform, platformIcon}
  const [eventSource, setEventSource] = useState(null);
  const [urlPlatform, setUrlPlatform] = useState(null); // Platform info for current URL
  const logsEndRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    // Wait a bit for Express server to start
    const timer = setTimeout(() => {
      loadHistory();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Cleanup EventSource on unmount or when download completes
  useEffect(() => {
    return () => {
      if (eventSource) {
        console.log('Cleaning up EventSource connection');
        eventSource.close();
      }
    };
  }, [eventSource]);

  // Detect platform when URL changes
  const detectPlatform = async (url) => {
    if (!url || url.trim() === '') {
      setUrlPlatform(null);
      return;
    }

    try {
      const response = await fetch('http://localhost:31720/api/detect-platform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      if (response.ok) {
        const platformInfo = await response.json();
        setUrlPlatform(platformInfo);
      } else {
        setUrlPlatform({ platform: 'Unknown', icon: '❓', supported: false });
      }
    } catch (error) {
      console.error('Platform detection error:', error);
      setUrlPlatform({ platform: 'Error detecting platform', icon: '⚠️', supported: false });
    }
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const loadHistory = async (retries = 3) => {
    try {
      const response = await fetch('http://localhost:31720/api/history');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setDownloads(data);
    } catch (error) {
      console.error('Failed to load history:', error);
      if (retries > 0) {
        addLog(`Retrying history load... (${retries} retries left)`, 'warning');
        setTimeout(() => loadHistory(retries - 1), 1000);
      } else {
        addLog('Error loading history: ' + error.message, 'error');
      }
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { message, type, timestamp }]);
  };

  const handleDownload = async (urls, outputDir) => {
    setIsLoading(true);
    addLog(`Starting download queue with ${urls.length} URL(s)...`, 'info');

    // Initialize queue with all URLs
    const initialQueue = urls.map((url, index) => ({
      id: `queue-${Date.now()}-${index}`,
      url,
      status: 'pending',
      progress: 0,
      platform: 'Detecting...',
      platformIcon: '⏳',
      filename: null,
      speed: null,
      eta: null,
      downloadId: null
    }));

    setDownloadQueue(initialQueue);

    // Process downloads sequentially
    for (let i = 0; i < urls.length; i++) {
      const queueItem = initialQueue[i];
      const url = urls[i];

      try {
        // Update queue item status to processing
        setDownloadQueue(prev => prev.map(item =>
          item.id === queueItem.id
            ? { ...item, status: 'processing' }
            : item
        ));

        addLog(`[${i + 1}/${urls.length}] Downloading: ${url}`, 'info');

        // Get platform info first
        const platformResponse = await fetch('http://localhost:31720/api/detect-platform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        let platformInfo = { platform: 'Unknown', icon: '❓', supported: true };
        if (platformResponse.ok) {
          platformInfo = await platformResponse.json();
        }

        // Update platform info in queue
        setDownloadQueue(prev => prev.map(item =>
          item.id === queueItem.id
            ? { ...item, platform: platformInfo.platform, platformIcon: platformInfo.icon }
            : item
        ));

        // Set current download for progress display
        setCurrentDownload({
          url,
          progress: 0,
          status: 'starting',
          filename: null,
          platform: platformInfo.platform,
          platformIcon: platformInfo.icon,
          speed: null,
          eta: null,
          queuePosition: i + 1,
          totalInQueue: urls.length
        });

        const response = await fetch('http://localhost:31720/api/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url, outputDir })
        });

        if (!response.ok) {
          let errorMsg = `HTTP ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch (e) {
            // Response is not JSON
          }
          throw new Error(errorMsg);
        }

        const result = await response.json();
        const { downloadId } = result;

        // Validate downloadId
        if (!downloadId || typeof downloadId !== 'string' || downloadId.trim() === '') {
          throw new Error('Invalid response: missing or invalid downloadId');
        }

        // Update queue with downloadId
        setDownloadQueue(prev => prev.map(item =>
          item.id === queueItem.id
            ? { ...item, downloadId }
            : item
        ));

        addLog(`Download started with ID: ${downloadId}`, 'info');

        // Create EventSource for progress tracking
        await new Promise((resolve, reject) => {
          try {
            const newEventSource = new EventSource(`http://localhost:31720/api/progress/${downloadId}`);

            console.log('Creating EventSource with URL:', `http://localhost:31720/api/progress/${downloadId}`);

            newEventSource.onmessage = (event) => {
              try {
                const progress = JSON.parse(event.data);

                // Update current download
                setCurrentDownload(prev => ({
                  ...prev,
                  ...progress,
                  queuePosition: i + 1,
                  totalInQueue: urls.length
                }));

                // Update queue item
                setDownloadQueue(prev => prev.map(item =>
                  item.id === queueItem.id
                    ? {
                        ...item,
                        progress: progress.progress || item.progress,
                        status: progress.status || item.status,
                        filename: progress.filename || item.filename,
                        speed: progress.speed || item.speed,
                        eta: progress.eta || item.eta
                      }
                    : item
                ));

                // Handle completion
                if (progress.status === 'completed') {
                  addLog(`✓ [${i + 1}/${urls.length}] Download completed: ${progress.filename}`, 'success');
                  newEventSource.close(); // Close SSE connection
                  resolve();
                } else if (progress.status === 'failed') {
                  const errorMsg = progress.error || 'Download failed';
                  addLog(`✗ [${i + 1}/${urls.length}] Download failed: ${errorMsg}`, 'error');
                  newEventSource.close(); // Close SSE connection
                  reject(new Error(errorMsg));
                }
              } catch (error) {
                console.error('Error parsing progress:', error);
                addLog('Error parsing progress data', 'error');
              }
            };

            newEventSource.onerror = (error) => {
              console.error('EventSource error:', error);
              // Check if connection was closed by server or network error
              if (newEventSource.readyState === EventSource.CLOSED) {
                addLog('Connection to server closed', 'warning');
                newEventSource.close();
                // Don't reject - the download might have completed
              } else {
                addLog('Lost connection to download progress, retrying...', 'warning');
              }
            };

            newEventSource.onopen = () => {
              console.log('EventSource connected for download:', downloadId);
              addLog('Connected to progress tracking', 'success');
            };

            setEventSource(newEventSource);
            
            // Add timeout to prevent hanging forever (10 minutes)
            setTimeout(() => {
              if (newEventSource.readyState !== EventSource.CLOSED) {
                addLog('Download timeout - closing connection', 'error');
                newEventSource.close();
                reject(new Error('Download timeout'));
              }
            }, 10 * 60 * 1000);

          } catch (error) {
            console.error('Failed to create EventSource:', error);
            addLog('Failed to connect to progress tracking', 'error');
            reject(error);
          }
        });

      } catch (error) {
        addLog(`✗ [${i + 1}/${urls.length}] Failed to download ${url}: ${error.message}`, 'error');

        // Update queue item to failed
        setDownloadQueue(prev => prev.map(item =>
          item.id === queueItem.id
            ? { ...item, status: 'failed' }
            : item
        ));

        // Update current download to failed
        setCurrentDownload(prev => prev ? {
          ...prev,
          status: 'failed'
        } : null);

        // Continue to next download after a brief delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Clear queue and current download when all done
    setDownloadQueue([]);
    setCurrentDownload(null);
    setIsLoading(false);
    addLog(`Queue processing completed!`, 'success');

    // Reload history
    setTimeout(() => loadHistory(), 1000);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <div className="brand-icon-wrapper">↓</div>
            <div className="brand-text">
              <h1>Media Downloader <span className="brand-version">v1.2.0</span></h1>
            </div>
          </div>
          <div className="header-status">
            <div className="status-dot"></div>
            <span>Ready</span>
          </div>
        </div>
      </header>

      <div className="app-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            <span className="tab-icon">⬇️</span>
            Download
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <span className="tab-icon">📋</span>
            History ({downloads.length})
          </button>
          <button
            className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <span className="tab-icon">📝</span>
            Logs
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'download' && (
            <>
              <DownloadForm 
                onDownload={handleDownload}
                isLoading={isLoading}
                addLog={addLog}
              />

              {/* Progress Bar */}
              {currentDownload && (
                <div className="download-progress">
                  <div className="progress-header">
                    <div className="progress-title">
                      <span className="progress-url">
                        {currentDownload.platformIcon} {currentDownload.filename || 'Preparing download...'}
                      </span>
                      <span className="progress-platform">
                        {currentDownload.platform}
                      </span>
                      <span className="progress-percentage">
                        {currentDownload.progress}%
                      </span>
                    </div>
                    {currentDownload.totalInQueue > 1 && (
                      <div className="queue-info">
                        <span className="queue-position">
                          📋 Queue: {currentDownload.queuePosition}/{currentDownload.totalInQueue}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="progress-bar-container">
                    <div 
                      className={`progress-bar ${currentDownload.status}`}
                      style={{ width: `${currentDownload.progress}%` }}
                    >
                      <div className="progress-bar-fill">
                        <div className="skeleton-shimmer"></div>
                      </div>
                    </div>
                  </div>

                  <div className="progress-details">
                    <div className="progress-info">
                      <span className={`status-indicator ${currentDownload.status}`}>
                        {currentDownload.status === 'starting' && '⏳ Starting'}
                        {currentDownload.status === 'downloading' && '⬇️ Downloading'}
                        {currentDownload.status === 'completed' && '✅ Completed'}
                        {currentDownload.status === 'failed' && '❌ Failed'}
                      </span>

                      {currentDownload.speed && (
                        <span className="speed-info">
                          Speed: {currentDownload.speed}
                        </span>
                      )}

                      {currentDownload.eta && (
                        <span className="eta-info">
                          ETA: {currentDownload.eta}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Download Queue Display */}
              {downloadQueue.length > 0 && (
                <div className="download-queue">
                  <div className="queue-header">
                    <h3>📋 Download Queue ({downloadQueue.length})</h3>
                    <div className="queue-stats">
                      <span className="completed-count">
                        ✅ {downloadQueue.filter(item => item.status === 'completed').length}
                      </span>
                      <span className="pending-count">
                        ⏳ {downloadQueue.filter(item => item.status === 'pending' || item.status === 'processing').length}
                      </span>
                      <span className="failed-count">
                        ❌ {downloadQueue.filter(item => item.status === 'failed').length}
                      </span>
                    </div>
                  </div>

                  <div className="queue-items">
                    {downloadQueue.map((item, index) => (
                      <div key={item.id} className={`queue-item ${item.status}`}>
                        <div className="queue-item-content">
                          <div className="queue-item-header">
                            <span className="queue-item-number">#{index + 1}</span>
                            <span className="queue-item-platform">
                              {item.platformIcon} {item.platform}
                            </span>
                            <span className={`queue-item-status ${item.status}`}>
                              {item.status === 'pending' && '⏳ Pending'}
                              {item.status === 'processing' && '⚡ Processing'}
                              {item.status === 'completed' && '✅ Completed'}
                              {item.status === 'failed' && '❌ Failed'}
                            </span>
                          </div>

                          <div className="queue-item-url">
                            {item.url.length > 60 ? `${item.url.substring(0, 60)}...` : item.url}
                          </div>

                          {item.filename && (
                            <div className="queue-item-filename">
                              📁 {item.filename}
                            </div>
                          )}

                          {item.status === 'processing' && (
                            <div className="queue-item-progress">
                              <div className="mini-progress-bar">
                                <div 
                                  className="mini-progress-fill"
                                  style={{ width: `${item.progress}%` }}
                                ></div>
                              </div>
                              <span className="mini-progress-text">{item.progress}%</span>
                              {item.speed && <span className="mini-speed">{item.speed}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {activeTab === 'history' && (
            <DownloadHistory 
              downloads={downloads}
              formatFileSize={formatFileSize}
            />
          )}
          {activeTab === 'logs' && (
            <LogViewer logs={logs} logsEndRef={logsEndRef} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
