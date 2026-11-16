# MSG × WeFlow 状态对照表 · 2026-11-16

> 只读整理 + 本机实测 tip。权威进度仍以 Ref-Code `PROGRESS.md` 为准。  
> 上游候选细节：原仓 `audit/verify/UPSTREAM-PORT-CANDIDATES.md`（gitignored，仅本机）。

## 0. 仓库与 tip（本会话实测）

| 项 | 值 |
|----|-----|
| 原仓 | `E:\Code_zone\Msg_weflow` @ `master` **`aca5761`**（已合入 composite） |
| 工作树 | `E:\Work_zone\Ref-Code\msg-composite` @ `composite/p0-export-fixes` `5d6d578` |
| origin | `https://github.com/zzmkxd/MSG.git` |
| upstream | `https://github.com/hicccc77/WeFlow.git` |
| **upstream/main tip** | `91adcfd`（本会话 `git fetch`；旧记 `fb58afa`） |
| 相对 tip | `upstream...HEAD` = **5 \| 172**（上游多 5 / 我们多 172） |
| 上游新 5 提交 | dependabot：`vite` + npm_and_yarn group（**无功能 diff 需急 rebase**） |
| package | `name=msg` · `ai=^7.0.22`（composite）· `executableName/product`≈MSG |
| 原仓脏区 | `M resources/wcdb/win32/x64/wcdb_api.dll` + 若干 `scripts/.probe*`（**勿动**） |

## 1. 北极星（不变）

| 轨 | 目标 |
|----|------|
| A | Windows 版 MSG 功能齐、可打包；吸收上游**可移植**修复 + AI（保留 wxid + 内置解密） |
| B | 从 A 拆「可上游化」子集 → **先联系** hicccc77 → 小 PR（无私有 DLL 叙事） |

## 2. 硬阻塞（待人 / 厂商）

| ID | 现象 | 影响 | 处置 |
|----|------|------|------|
| B-DB | `wcdb_api.dll` `InitProtection=-101` | 聊/统计/导出等全 blocked | 无本地 C++ 源；勿回拨时间/伪造 API |
| B-WL | `welive.exe` expired | 导出链路即使 DB 好仍可能挂 | 待厂商/替代 |
| B-E2E | DOCX / 渲染 / G8 等 | 运行时验收搁置 | DB 恢复后补 |
| B-KEY | AI 真 Key 联调 | A2 E2E | awaiting-human |

`wx_key.dll`：**干净可用**（KNOWN-STATE）。

## 3. 已吸收（相对 7 月骨架 / 上游候选）

### 3.1 在 `master`（原仓历史，含批次 0）

| ID | 内容 | 证据 |
|----|------|------|
| P0-0a | 导出取消 ≠ 完成（`stopped`→`canceled`） | `7392574` + `useExportTasks.ts` 现有 `stopped` 分支 |
| P0-0b | 日期末秒 inclusive | `7392574` + `ExportDateRangeDialog` `23:59:59.999` 注释 |
| P0-6 相关 | ExportStats 等 R2–R5 | `7392574` |
| G1–G6/G12 | DOCX 接线、activeDays、直方图、热力、词频、托盘 | `b0e4dfb`（E2E 欠） |
| Win 产品修 | exe 名 MSG、Hello 回退、SNS HEVC、打包路径等 | `5a0fab0` 链 |

### 3.2 仅在 `composite/p0-export-fixes`（未合回 master）

| ID | Commit | 内容 |
|----|--------|------|
| P0-1/2/3 | `dcae08e` | HTML 分块 / 无限滚动脚本 / HtmlFormatter |
| P0-5 | `dcae08e` | `fileNaming` 指纹防覆盖 |
| P0-7 | `dcae08e` | `prepare-electron-runtime.cjs` |
| P0-11 | `dcae08e` | `weliveBridge` close 结算向 |
| P0-14/15/16 | `dcae08e` | Notification / ChatHistory / sharedMessageEvents |
| P0-4 | `1521ac2` | exportHtml.css + Styles 成对 a11y |
| P0-8 | `8b29916` | 增量：账号 scope + options 指纹 + hash |
| A2-0 | `c1af9cb` | `ai`/`@ai-sdk/*` + adapter；`testConnection`→`generateText` |
| 轨 B 备忘 | `docs/FORK-TO-PR.md` | 流程，非代码 |

## 4. 待移植队列（无人值守下一刀建议序）

> 默认仍在 **msg-composite** 单写者推进；合回 master / 发版需人闸。

| 顺位 | ID | 为何先做 | 风险 |
|------|-----|----------|------|
| 1 | **合入决策** | composite→master 是否开 PR/快进（6 commit） | 人闸 |
| 2 | P0-9 | sns 跨账号串号 | 中（触 SNS） |
| 3 | P0-10 | 多账号缓存隔离（最大块） | 高（前后端一致） |
| 4 | P0-12/13 | chatService `-2` 自愈 / dbSignature wal+shm | 中 |
| 5 | P1-4 / P2 小修 | jsonl U+2028、sessionStats 原子写、BrowserWindow 守卫等 | 低 |
| 6 | P1-3 | welive 完整性（**剔解密剥离行**） | 中；受 B-WL |
| 7 | P1-1/2 | 缓存加密 / systemAccountId | 低收益或需产品拍 |
| 8 | P1-5–9 | backup / chat 性能与缓存 | 中高 |
| 9 | P1-10 | errorCatalog 体系 | 中（入口改造） |
| 10 | P1-11 | 关系历程可视化（**不注入 AI 裁决**） | 中（体量大） |
| 11 | A2-1+ | 设置页 AI 区 / 主路径 SDK（禁 Agent 整树除非新 Plan） | 中；E2E 待 Key |
| 12 | 样式摘取 | App.scss flex 修复、ConfirmDialog reduced-motion、Sidebar lock 等 | 低；逐项 Plan |

## 5. 永排除（不要照抄）

| 类 | 代表 | 原因 |
|----|------|------|
| 改名噪音 | 32 文件 `wxid`→`accountId` 等 | 破坏真实微信路径 |
| 解密剥离 | `third-party-components.md`、删内置 DLL、keyProvider 插件化 | 与 MSG 定位冲突 |
| AI 整树（未开 Plan） | `src/pages/agent/**`、ai-elements、Settings AI 巨 SCSS、tts、electronNetProxy | 体积/依赖；A2 按切片开 |
| ABI 缺失 | `wcdb_set_my_account_id`、`insertTextMessage`、`reorderSessionsByTime`、`setMessageCursorProjection` | 本机 DLL ABSENT |
| 第二条 UI 栈 | radix/tailwind `components/ui` | 仅 AI 可达 |

## 6. 轨 B · 可上游化短名单（联系用，不开冷 PR）

原则：纯修复、可讲清、**不依赖「我们持有私有 DLL」叙事**、尽量不绑微信专有品牌争论。

| 候选 | 说明 | 注意 |
|------|------|------|
| HTML 导出分块 + 无限滚动 + a11y 成对样式 | 上游可能已有同源；提 PR 前 diff 对方 tip | 先联系 |
| 增量导出五重校验（条数/时间/账号/选项/hash） | 通用正确性 | 去掉 MSG 特有文案即可 |
| 导出取消状态机（stopped≠success） | 通用 | |
| 日期范围末分钟 inclusive | 通用 | |
| `prepare-electron-runtime` Windows 占用复制 | Win 友好；对方若仍支援 Win 才有意义 | 上游现偏插件化，需确认是否还要 |
| Notification / ChatHistory / ImageUpdate 小修 | 通用前端 | |

**不宜作首 PR：** 内置解密、wx_key 路径、MSG exe 改名、A2 AI SDK（对方栈可能不同）、任何 DLL 二进制。

流程：`docs/FORK-TO-PR.md`。

## 7. Windows 交付债（静态可跟；运行时待 DB）

| 项 | 状态 |
|----|------|
| `npm run typecheck` | ✅ 本会话 exit 0（composite） |
| 打包 / smoke:pack | 历史曾通；本轮未重跑（native/postinstall 可能需补） |
| 安装包 isPackaged / 资源路径 | `5a0fab0` 已修叙事 |
| DB 依赖功能 | ❌ blocked |
| composite → master | **已合** `aca5761`（2026-11-16）；日常 master 含 P0/A2/P2 |

## 8. 下一会话可直接开的无人值守实现刀（需新 Plan + 人闸写集）

推荐默认下一刀（实现，非本轮）：**P0-12 + P0-13** 或 **P2 极低风险小修捆**（jsonlLineReader + BrowserWindow 守卫 + sessionStats 原子写）——均不依赖 DB 恢复即可 typecheck；E2E 仍标 awaiting-human。

**本轮不做实现移植**（Plan 已禁）。
