import React, { useState } from 'react';
import './DownloadHistory.css';

function DownloadHistory({ downloads, formatFileSize }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openFileLocation = (filepath) => {
    if (window.electron) {
      window.electron.openFileLocation(filepath);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      completed: { color: '#28a745', label: '✓ Completed' },
      failed: { color: '#dc3545', label: '✗ Failed' },
      pending: { color: '#ffc107', label: '⏳ Pending' }
    };
    return statusMap[status] || { color: '#6c757d', label: status };
  };

  return (
    <div className="download-history">
      {downloads.length === 0 ? (
        <div className="empty-state">
          <p>📭 No downloads yet. Start downloading to see history here.</p>
        </div>
      ) : (
        <div className="history-container">
          <div className="history-stats">
            <div className="stat-card">
              <span className="stat-label">Total Downloads</span>
              <span className="stat-value">{downloads.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total Size</span>
              <span className="stat-value">
                {formatFileSize(downloads.reduce((sum, d) => sum + (d.filesize || 0), 0))}
              </span>
            </div>
          </div>

          <div className="history-list">
            {downloads.map((download, index) => {
              const isExpanded = expandedId === index;
              const status = getStatusBadge(download.status || 'completed');

              return (
                <div key={index} className="history-item">
                  <div 
                    className="item-header"
                    onClick={() => toggleExpand(index)}
                  >
                    <div className="item-main">
                      <div className="item-title">
                        <span className="status-badge" style={{ backgroundColor: status.color }}>
                          {status.label}
                        </span>
                        <span className="filename">{download.filename}</span>
                      </div>
                      <div className="item-meta">
                        <span className="filesize">📦 {formatFileSize(download.filesize)}</span>
                        <span className="timestamp">🕐 {formatDate(download.timestamp)}</span>
                      </div>
                    </div>
                    <div className="expand-icon">
                      {isExpanded ? '▼' : '▶'}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="item-details">
                      <div className="detail-row">
                        <label>URL:</label>
                        <span className="url-text">{download.url}</span>
                      </div>
                      <div className="detail-row">
                        <label>File Path:</label>
                        <span className="filepath-text">{download.filepath}</span>
                      </div>
                      <div className="detail-row">
                        <label>File Size:</label>
                        <span>{formatFileSize(download.filesize)}</span>
                      </div>
                      <div className="detail-row">
                        <label>Downloaded:</label>
                        <span>{formatDate(download.timestamp)}</span>
                      </div>
                      <div className="detail-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={() => openFileLocation(download.filepath)}
                        >
                          📁 Open Location
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            navigator.clipboard.writeText(download.filepath);
                            alert('Path copied to clipboard!');
                          }}
                        >
                          📋 Copy Path
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DownloadHistory;
