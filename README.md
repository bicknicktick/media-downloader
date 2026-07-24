# Media Downloader

Universal Media & Video Downloader Engine with Smart MD5 Instant Cache.

[![Version](https://img.shields.io/badge/version-1.2.0-27272a.svg?style=flat-square)](https://github.com/bicknicktick/media-downloader)
[![License](https://img.shields.io/badge/license-MIT-27272a.svg?style=flat-square)](LICENSE)
[![Engine](https://img.shields.io/badge/engine-yt--dlp-27272a.svg?style=flat-square)](https://github.com/yt-dlp/yt-dlp)

A clean, minimalist desktop application and local engine for downloading media from 1000+ platforms with zero-delay MD5 URL caching.

---

## Features

- **Smart MD5 Instant Cache**: Hashes target URL & quality. Repeated downloads skip network requests instantly (100% progress in <100ms).
- **Minimalist Dark Interface**: Designed with a clean Raycast/Linear aesthetic, high contrast typography, and real-time SSE progress tracking.
- **1000+ Platforms**: Works out of the box with YouTube, TikTok (No Watermark), Instagram Reels, Pinterest, Twitter/X, Douyin, Bilibili, Xiaohongshu, Twitch, and more.
- **Embedded API (Port 31720)**: Embedded Express server with Server-Sent Events (SSE) for programmatic downloads and progress streaming.
- **Fail-safes**: Bypasses 403 errors, socket retries, and automatic temp artifact management.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, Inter Font, Clean Dark CSS |
| **App Shell** | Electron 28 |
| **API Engine** | Express.js, Server-Sent Events (Port 31720) |
| **Downloader** | `yt-dlp` Subprocess |
| **Caching** | Node `crypto` (MD5 Hash Table) |

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/bicknicktick/media-downloader.git
cd media-downloader

# Install dependencies
npm install

# Start development app
npm start

# Build production bundle
npm run build
```

---

## API Documentation

### Detect Platform
```http
POST /api/detect-platform
Content-Type: application/json

{ "url": "https://www.youtube.com/watch?v=example" }
```

### Trigger Download
```http
POST /api/download
Content-Type: application/json

{ "url": "https://www.youtube.com/watch?v=example", "outputDir": "/home/user/Downloads" }
```

---

## License

MIT © [bicknicktick](https://github.com/bicknicktick) & [bitzy.id](https://bitzy.id)
