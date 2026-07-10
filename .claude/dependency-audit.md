# 依赖审计（精要）

> 审计日期：2026-07-09。全量 38 个依赖（25 prod + 13 dev）逐项审查，全部 Windows 兼容，许可证合规。

## 需执行的操作

| # | 操作 | 说明 |
|---|------|------|
| 1 | **移除 `@vscode/sudo-prompt`** | Linux 提权，Windows 无用 |
| 2 | **合并 pnpm.overrides → npm overrides** | 7 个 CVE 修复在 npm 下无效，需迁到 `overrides` 段 |
| 3 | **锁定 React + TS 版本** | `^19.2.3` → `19.2.3`，`^6.0.3` → `6.0.3`（均为预发布/大版本） |

## npm overrides 补全

现有 `overrides` 段缺 `lodash`、`rollup`、`minimatch`、`ajv`，完整版：

```json
"overrides": {
  "brace-expansion": "^5.0.6",
  "node-abi": ">=4.33.0",
  "exceljs": { "uuid": "11.1.1" },
  "fast-uri": "^3.1.3",
  "form-data": "^4.0.6",
  "ip-address": "^10.2.0",
  "picomatch": "^4.0.4",
  "js-yaml": "^4.3.0",
  "tar": "^7.5.19",
  "tmp": "^0.2.7",
  "immutable": "^5.1.5",
  "lodash": ">=4.17.21",
  "rollup": ">=4.0.0",
  "minimatch": ">=3.1.2",
  "ajv": ">=8.18.0"
}
```

## 原生模块 asarUnpack

electron-builder 打包时需 `asarUnpack` 的模块（含预编译 .node/.wasm/.exe）：

| 模块 | 类型 |
|------|------|
| `sherpa-onnx-node` | win-x64 预编译 .node |
| `@hicccc77/electron-liquid-glass` | DXGI/D3D11 .node |
| `ffmpeg-static` | 预编译 ffmpeg.exe |
| `silk-wasm` | WASM 文件 |

其余 4 个原生/WASM 模块（`koffi`、`fzstd`、`jieba-wasm`、`sharp`）标准安装即可。

## 系统要求

| 要求 | 最低 |
|------|------|
| OS | Windows 10 1809+ |
| 架构 | x64 / arm64 |
| GPU | DirectX 11（亚克力玻璃效果） |
| VC++ 运行库 | 2015-2022（`extraFiles` 已含 msvcp140/vcruntime140，建议 installer.nsh 加 Redistributable 下载兜底） |

## 风险备忘

- **ffmpeg GPL 二进制**：`ffmpeg-static` 内含 GPL ffmpeg，与项目 AGPL-3.0 兼容，记录即可
- **2 个包许可证未标注**：`@hicccc77/electron-liquid-glass`、`wechat-emojis`，需确认合规
