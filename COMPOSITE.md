# msg-composite 工作树说明

Ref-Code 隔离工作树：MSG × WeFlow **复合修复**试验区（不污染原仓工作区）。

| 项 | 值 |
|----|-----|
| 原仓（勿在此改业务） | `E:\Code_zone\Msg_weflow`（`master`） |
| 本目录 | `git worktree` → 分支 `composite/p0-export-fixes` |
| origin | `https://github.com/zzmkxd/MSG.git` |
| upstream（只读） | `https://github.com/hicccc77/WeFlow.git` |
| 上游 tip（本轮） | `upstream/main` @ `fb58afa` |

产品说明见同目录 `readme.md`。

## 已完成切片

### 基线核实（轮 0）
- P0-0a / P0-0b：已在原仓 `7392574`，无需再改

### A1 非 AI 移植（本轮）
| ID | 内容 | 状态 |
|----|------|------|
| P0-5 | 导出会话文件名指纹防覆盖 | 已改 `fileNaming.ts` |
| P0-7 | prepare-runtime 内容比对 + EBUSY | 已改 `prepare-electron-runtime.cjs` |
| P0-11 | welive `exit`→`close` 结算 | 已改 `weliveBridge.ts`（未剥解密） |
| P0-14 | 通知点击 `targetRoute` | 已改 `NotificationWindow.tsx` |
| P0-15 | 聊天记录 payload `sessionId` | 已改 `ChatHistoryPage.tsx` |
| P0-16 | `ImageUpdatePayload` 字段 | 已改 `sharedMessageEvents.ts` |
| P0-1+P0-3 | HTML 分块 + 无限滚动 | NEW `htmlChunking.ts` / `htmlInfiniteScrollScript.ts`；改 `HtmlFormatter.ts` / `ExportContext.ts` |
| P0-2 | serializeHtmlScriptJson | 已并入 `htmlChunking`，Formatter 改 import |

## Gate

```bash
npm run typecheck
```

## 遗留风险（下一批）
- Orchestrator 尚未接线 `registerLogicalOutputPath`（当前 resolve 恒等，直写路径可用）
- P0-4 a11y CSS（`exportHtmlStyles`）未同步
- P0-8 增量导出 fingerprint 未做

## 双轨下一步
- **A1 续**：P0-4 / P0-8；orchestrator 逻辑路径
- **A2**：AI SDK（已推翻「不做 AI」）
- **B**：可上游化子集 → 联系 → PR

Plan：[`../.cursor/plans/20261024-msg-a1-nonai-ports.md`](../.cursor/plans/20261024-msg-a1-nonai-ports.md)
