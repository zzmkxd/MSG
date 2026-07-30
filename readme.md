# MSG — Windows 微信消息浏览/导出工具

基于 [WeFlow](https://github.com/hicccc77/WeFlow) 骨架重构的纯 Windows 微信消息管理工具，支持聊天记录浏览、媒体资源解密、统计分析和多格式导出。

## 技术栈

Electron 43 + TypeScript + React 19 + WCDB (Native C++ Bridge) + koffi FFI

## 主要功能

- 本地实时查看聊天记录（会话列表、消息浏览）
- 图片/视频资源浏览与解密
- 统计分析与数据可视化（ECharts）
- 联系人管理
- 朋友圈（SNS）浏览
- 多格式导出：JSON、HTML、Markdown、TXT、Excel、CSV、DOCX
- HTTP API 接口

## 快速开始

仅支持 **Windows 10+ x64** 和 **微信 4.0 及以上**。

### 下载安装

前往 [Releases](https://github.com/zzmkxd/MSG/releases) 下载 `MSG-0.1.0-Setup.exe` 安装。

### 开发构建

```bash
# 环境要求
# Node.js ≥22、Windows Build Tools (VS 2022 + C++ 桌面开发)

git clone https://github.com/zzmkxd/MSG.git
cd MSG
npm install
npm run dev      # 开发模式
npm run build    # 打包 NSIS 安装包
```

## 项目结构

```
electron/         # Electron 主进程 + Worker + 服务
  services/       # WCDB、图片解密、导出、chatService
  utils/          # resolveWorkerPath 等工具
src/              # React 前端（30+ 路由、40+ 组件）
  pages/          # ResourcesPage、ChatPage、SnsPage 等
resources/        # WCDB DLLs、解密模块、运行时库
.claude/          # 开发计划、状态追踪、审计报告
```

## 已知限制

- 部分图片解密失败：wx_key.dll 密钥注入不覆盖所有加密参数变体
- 资源浏览图片重复 3 份：WCDB 原生层跨分片扫描返回
- 仅支持 Windows 平台

## 致谢

- [WeFlow](https://github.com/hicccc77/WeFlow) — 项目骨架与核心技术
- [WeChatMsg](https://github.com/LC044/WeChatMsg) — 补充解析器与 DOCX 导出参考
- [koffi](https://koffi.dev/) — Node.js FFI 库
- [WCDB](https://github.com/Tencent/wcdb) — 微信数据库引擎

## License

本项目仅供学习研究使用，请遵守相关法律法规。
