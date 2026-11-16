# Fork → 对齐 → 复合修复 → PR（轨 B 备忘）

面向 MSG×WeFlow。轨 A 产品修复在 `composite/*` 分支；轨 B 回馈上游时再拆「可上游化」子集。

## 行业标准步骤（压缩版）

1. **Fork**：GitHub 上 fork `hicccc77/WeFlow`（或保持 MSG 为独立产品仓，仅 cherry-pick 上游提交）。
2. **Clone / worktree**：本地 `origin`=自己的 fork/MSG；`upstream`=官方 WeFlow（只读 fetch）。
3. **同步主线**：`git fetch upstream` → 在干净分支 `git merge` 或 `rebase` upstream/main（冲突按「保留微信标识 + 内置解密」策略解，禁止照抄去品牌/插件化剥离）。
4. **Topic 分支**：每功能一分支，如 `composite/p0-export-fixes`；小步 commit；推 `origin`。
5. **自测 Gate**：至少 `npm run typecheck`；有则 smoke；附复现说明。
6. **开 PR 到自己的默认分支**（内部验收）→ 再开 **PR 到 upstream**（需先联系维护者；范围要小、无私有 DLL 叙事、无密钥）。
7. **审阅循环**：按 review 改；勿 force-push 共享分支除非约定；squash 或按仓库规范。
8. **合并后**：删 topic 分支；`fetch upstream` 回灌本地。

## MSG 特有约束

- 保留 `wxid` / `WeChat Files`；勿跟上游 `accountId` 全仓改名。
- 勿把「用户自配第三方解密插件」当默认；MSG 持有内置 DLL。
- AI 功能依赖 `@ai-sdk/*`：可进 MSG；提上游 PR 时确认对方是否仍保留 AI 栈。
- 联系作者优先于冷 PR；撤库/重写史说明对方可能对二改敏感。

## 本仓现状

| 项 | 值 |
|----|-----|
| 工作树 | `E:\Work_zone\Ref-Code\msg-composite` |
| 分支 | `composite/p0-export-fixes`（已跟踪 origin） |
| upstream | `https://github.com/hicccc77/WeFlow.git` |

更细的可移植分级见原仓（gitignored）`audit/verify/UPSTREAM-PORT-CANDIDATES.md`。
