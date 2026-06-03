---
name: douyin-auto-like
description: 抖音网页版自动点赞工具。支持观看4-8秒后自动点赞、随机跳过(15%)、批量暂停反风控、每日运行时长限制。基于 Puppeteer + Chrome 浏览器自动化，使用 data-e2e 选择器精确定位点赞按钮。
---

# 抖音自动点赞

## 概述

基于 Puppeteer-core + 系统 Chrome 的抖音网页版自动化脚本。自动进入推荐视频流，观看视频并点赞，模拟人类行为以降低风控检测概率。

## 工作流程

```mermaid
graph TD
  A[打开 douyin.com] --> B[点击"推荐"标签]
  B --> C[点击第一个视频卡片]
  C --> D[等待 4-8s 随机观看时长]
  D --> E{随机跳过? 15%}
  E -->|是| F[切换到下一视频]
  E -->|否| G{已点赞?}
  G -->|是| F
  G -->|否| H[点击点赞按钮]
  H --> I[等待 2-4s]
  I --> F
  F --> J{运行时间超限?}
  J -->|是| K[结束]
  J -->|否| D
```

## 使用说明

### 首次运行

```powershell
# 进入 skill 目录
cd C:\Users\Administrator\.qclaw\skills\douyin-auto-like

# 运行脚本（会弹出 Chrome 窗口）
node scripts\autolike.js
```

首次运行会创建一个独立的 `chrome-profile/` 目录，**需要手动登录抖音账号**。登录后脚本会记住登录状态，后续无需重复登录。

### 配置参数

编辑 `scripts/autolike.js` 开头的 `CFG` 对象：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| minWatchMs | 4000 | 最短观看毫秒数（4秒） |
| maxWatchMs | 8000 | 最长观看毫秒数（8秒） |
| skipRate | 0.15 | 跳过概率（15%，约每6-7个跳1个） |
| likeBatch | 10 | 每点赞多少个进入批量暂停 |
| minPauseMs | 300000 | 最少暂停毫秒（5分钟） |
| maxPauseMs | 600000 | 最多暂停毫秒（10分钟） |
| maxRunMs | 7200000 | 单次运行最长毫秒（2小时） |

### 技术原理

- **点赞按钮定位**: 使用抖音网页版稳定的 `data-e2e` 属性 `[data-e2e="video-player-digg"]`
- **视频切换**: 使用 `[data-e2e="video-switch-next-arrow"]` 元素
- **已点赞检测**: 通过 SVG path 填充颜色判断（空心=未赞，填充色=已赞）
- **浏览器**: Puppeteer-core + 系统已安装的 Chrome，非无头模式避免检测
- **反检测**: 绕过 `navigator.webdriver` 检测 + 真实 User Agent

### 注意事项

1. **必须登录**：首次运行需在弹窗中登录抖音账号
2. **保持窗口前台**：Chrome 窗口最小化可能导致自动化失败
3. **不要手动操作**：运行期间不要手动点击浏览器，会干扰流程
4. **退出方式**：Chrome 窗口关掉即停止，或在终端按 Ctrl+C
