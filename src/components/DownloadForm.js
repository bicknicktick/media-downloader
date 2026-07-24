import React, { useState, useEffect } from 'react';
import './DownloadForm.css';

function DownloadForm({ onDownload, isLoading, addLog }) {
  const [urls, setUrls] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [urlList, setUrlList] = useState([]);
  const [platformInfo, setPlatformInfo] = useState(null);

  // Detect platform when URL changes
  useEffect(() => {
    const detectPlatform = async () => {
      if (!urls.trim()) {
        setPlatformInfo(null);
        return;
      }

      try {
        const response = await fetch('http://localhost:31720/api/detect-platform', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: urls.trim() })
        });

        if (response.ok) {
          const info = await response.json();
          setPlatformInfo(info);
          
          // Show warning for unsupported platforms
          if (!info.supported && info.message) {
            addLog(`⚠️ ${info.message}`, 'warning');
          }
        } else {
          setPlatformInfo({ platform: 'Unknown', icon: '❓', supported: false });
        }
      } catch (error) {
        console.error('Platform detection error:', error);
        setPlatformInfo({ platform: 'Error', icon: '⚠️', supported: false });
      }
    };

    // Debounce platform detection
    const timeoutId = setTimeout(detectPlatform, 500);
    return () => clearTimeout(timeoutId);
  }, [urls]);

  const handleAddUrl = (e) => {
    e.preventDefault();
    const url = urls.trim();

    if (!url) {
      addLog('Please enter a URL', 'error');
      return;
    }

    // Validate URL
    try {
      new URL(url);
      setUrlList([...urlList, url]);
      setUrls('');
      addLog(`Added URL: ${url}`, 'info');
    } catch {
      addLog('Invalid URL format', 'error');
    }
  };

  const handleRemoveUrl = (index) => {
    const removed = urlList[index];
    setUrlList(urlList.filter((_, i) => i !== index));
    addLog(`Removed URL: ${removed}`, 'info');
  };

  const handleSelectDirectory = async () => {
    try {
      if (window.electron) {
        const dir = await window.electron.selectDirectory();
        if (dir) {
          setOutputDir(dir);
          addLog(`Output directory set to: ${dir}`, 'info');
        }
      } else {
        // Fallback for when electron API is not available
        addLog('Directory selection not available. Using default directory.', 'warning');
        setOutputDir(''); // Use default
      }
    } catch (error) {
      addLog(`Error selecting directory: ${error.message}`, 'error');
    }
  };

  const handleDownload = async () => {
    if (urlList.length === 0) {
      addLog('Please add at least one URL', 'error');
      return;
    }

    // Check for unsupported platforms
    for (const url of urlList) {
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
          if (!platformInfo.supported) {
            addLog(`❌ Cannot download from ${platformInfo.platform}. ${platformInfo.message || 'This content type is not supported.'}`, 'error');
            return; // Stop download process
          }
        }
      } catch (error) {
        addLog(`Error checking platform support for ${url}`, 'warning');
      }
    }

    await onDownload(urlList, outputDir);
    setUrlList([]);
  };

  const handleClearAll = () => {
    setUrlList([]);
    addLog('Cleared all URLs', 'info');
  };

  return (
    <div className="download-form">
      <div className="form-section">
        <h2>Add URLs to Download</h2>
        
        <form onSubmit={handleAddUrl} className="url-input-form">
          <div className="input-group">
            <div className="input-container">
              <input
                type="text"
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="Enter YouTube, TikTok, Instagram, Pinterest, or any supported media URL..."
                className="url-input"
                disabled={isLoading}
              />
              {platformInfo && (
                <div className={`platform-indicator ${platformInfo.supported ? 'supported' : 'unsupported'}`}>
                  <span className="platform-icon">{platformInfo.icon}</span>
                  <span className="platform-name">{platformInfo.platform}</span>
                </div>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              <span className="btn-icon">+</span> Add URL
            </button>
          </div>
          <p className="help-text">
            Supported: YouTube, TikTok, Instagram, Facebook, Twitter, Pinterest, SoundCloud, Vimeo, Twitch, Bilibili, Xiaohongshu, and 1000+ more platforms
          </p>
        </form>

        <div className="output-dir-section">
          <label>Output Directory:</label>
          <div className="dir-display">
            <span className="dir-path">
              {outputDir || 'Default: ~/Downloads/MediaDownloader'}
            </span>
            <button 
              type="button"
              className="btn btn-secondary"
              onClick={handleSelectDirectory}
              disabled={isLoading}
            >
              <span className="btn-icon">📁</span> Browse
            </button>
          </div>
        </div>
      </div>

      <div className="url-list-section">
        <div className="list-header">
          <h3>URLs to Download ({urlList.length})</h3>
          {urlList.length > 0 && (
            <button 
              className="btn btn-danger btn-sm"
              onClick={handleClearAll}
              disabled={isLoading}
            >
              Clear All
            </button>
          )}
        </div>

        {urlList.length === 0 ? (
          <div className="empty-state">
            <p>No URLs added yet. Add URLs above to get started.</p>
          </div>
        ) : (
          <ul className="url-list">
            {urlList.map((url, index) => (
              <li key={index} className="url-item">
                <span className="url-text">{url}</span>
                <button
                  type="button"
                  className="btn btn-remove"
                  onClick={() => handleRemoveUrl(index)}
                  disabled={isLoading}
                  title="Remove URL"
                >
                  <span className="btn-icon">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="action-buttons">
        <button
          className="btn btn-success btn-large"
          onClick={handleDownload}
          disabled={isLoading || urlList.length === 0}
        >
          <span className="btn-icon">{isLoading ? '⏳' : '▶'}</span> {isLoading ? 'Downloading...' : 'Start Download'}
        </button>
      </div>

      {isLoading && (
        <div className="loading-indicator">
          <div className="spinner"></div>
          <p>Processing downloads...</p>
        </div>
      )}
    </div>
  );
}

export default DownloadForm;
