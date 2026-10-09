# MSG — Windows 微信消息浏览/导出工具

基于 [WeFlow](https://github.com/hicccc77/WeFlow) 骨架重构的纯 Windows 微信消息管理工具，支持聊天记录浏览、媒体资源解密、统计分析和多格式导出。

## ⚠️ 当前状态（2026-10-09）

**数据访问层停摆，根因在第三方厂商侧（非本项目 bug）**：`wcdb_api.dll` 的 `InitProtection()` 对所有路径返回 `-101`（应用报兜底码 `-3999`），导出引擎 `welive.exe` 自报 `this build has expired`；密钥组件 `wx_key.dll` 干净可用。应用可启动、主窗口正常，但**所有依赖数据库的功能（聊天浏览/统计/报告/资源浏览/全部导出）当前不可用**。微信本体、项目代码、DLL 文件本身均无问题；厂商（hicccc77）2026-09-28 撤库重写并删除发布仓，第三方组件不会再有官方修复。
本机完整取证见 `audit/verify/KNOWN-STATE-2026-10-09.md`（`audit/` 为 gitignored 本地取证目录，不在仓库中）。

## 技术栈

Electron 43 + TypeScript + React 19 + WCDB (Native C++ Bridge) + koffi FFI

## 主要功能

- 本地实时查看聊天记录（会话列表、消息浏览）
- 图片/视频资源浏览与解密
- 统计分析与数据可视化（ECharts）：活跃天数、消息长度直方图、词云、年报热力图、群分析
- 联系人管理
- 朋友圈（SNS）浏览
- 多格式导出：JSON、HTML、Markdown、TXT、Excel、SQL、DOCX、ChatLab 等 11 种格式 ID
- HTTP API 接口（5031 端口，默认关闭）

## 快速开始

仅支持 **Windows 10+ x64** 和 **微信 4.1.x**（实测 4.1.8.107 / 4.1.13.65）。

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
audit/            # 本地取证与审计（gitignored，不入库）
```

## 已知限制

- 2026-10-09 起第三方原生组件（`wcdb_api.dll` / `welive.exe`）被厂商停用，DB 依赖功能全部不可用（见「当前状态」）
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
