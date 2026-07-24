import React from 'react';
import './LogViewer.css';

function LogViewer({ logs, logsEndRef }) {
  const getLogColor = (type) => {
    const colors = {
      info: '#0066cc',
      success: '#28a745',
      error: '#dc3545',
      warning: '#ffc107'
    };
    return colors[type] || '#666';
  };

  const getLogIcon = (type) => {
    const icons = {
      info: 'ℹ️',
      success: '✓',
      error: '✗',
      warning: '⚠️'
    };
    return icons[type] || '•';
  };

  const clearLogs = () => {
    // This would need to be passed from parent
    window.location.reload();
  };

  return (
    <div className="log-viewer">
      <div className="log-header">
        <h3>📝 Activity Logs</h3>
        <button className="btn btn-secondary btn-sm" onClick={clearLogs}>
          Clear Logs
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="empty-logs">
          <p>No logs yet. Start downloading to see activity here.</p>
        </div>
      ) : (
        <div className="logs-container">
          {logs.map((log, index) => (
            <div key={index} className="log-entry" style={{ borderLeftColor: getLogColor(log.type) }}>
              <div className="log-icon" style={{ color: getLogColor(log.type) }}>
                {getLogIcon(log.type)}
              </div>
              <div className="log-content">
                <div className="log-message">{log.message}</div>
                <div className="log-timestamp">{log.timestamp}</div>
              </div>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}

export default LogViewer;
