# msg-composite 工作树说明

Ref-Code 隔离工作树：MSG × WeFlow **复合修复**试验区（不污染原仓工作区）。

| 项 | 值 |
|----|-----|
| 原仓（勿在此改业务） | `E:\Code_zone\Msg_weflow`（`master`） |
| 本目录 | `git worktree` → 分支 `composite/p0-export-fixes` |
| origin | `https://github.com/zzmkxd/MSG.git` |
| upstream（只读） | `https://github.com/hicccc77/WeFlow.git` |
| 上游 tip | `upstream/main` @ `fb58afa` |

## 暂存点（已 push）

| CP | Commit | 内容 |
|----|--------|------|
| CP1 | `dcae08e` | HTML 分块/滚动 + P0-5/7/11/14/15/16 |
| CP2 | `1521ac2` | P0-4 a11y CSS 双文件同步 |
| CP3 | `8b29916` | P0-8 增量五重校验 + `docs/FORK-TO-PR.md` |

轨 B 流程：[`docs/FORK-TO-PR.md`](docs/FORK-TO-PR.md)

## 切片状态

- P0-0a/0b：原仓已有（`7392574`）
- P0-1/2/3/4/5/7/8/11/14/15/16：已进分支
- Orchestrator `registerLogicalOutputPath`：API 已有，接线待做

## Gate

```bash
npm run typecheck
```

## 下一步（自主）

1. A2 AI SDK  
2. B：按 FORK-TO-PR 准备联系材料（不开冷 PR）
