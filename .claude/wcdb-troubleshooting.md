# WCDB 连接失败排查指南

> 基于 WeFlow `wcdbCore.ts` 完整初始化链路分析。

## 初始化链路

```
Renderer (React) → IPC → WcdbService (proxy) → WcdbWorker (子线程) → WcdbCore (koffi FFI)
                                                                          │
                                                              ┌───────────┘
                                                              ▼
                                                      koffi.load("wcdb_api.dll")
                                                              │
                                                      InitProtection(resPath)  ← 最可能失败
                                                              │
                                                      wcdbInit()
                                                              │
                                                      wcdbOpenAccount(session.db, hexKey)
```

## 依赖的 DLL（`resources/wcdb/win32/x64/`）

- `wcdb_api.dll` — 主库，暴露 ~60 个 C 函数
- `WCDB.dll` — 微信 WCDB 框架本体
- `SDL2.dll` — 辅助依赖
- `msvcp140.dll` / `vcruntime140.dll` — VC++ Redistributable

## 错误码速查

| 错误码 | 阶段 | 含义 | 排查 |
|--------|------|------|------|
| `-2301` | DLL 加载 | `InitProtection` 符号不存在 | DLL 版本不对，检查 wcdb_api.dll |
| `-2302` | DLL 加载 | koffi 加载 DLL 抛异常 | 缺少 VC++ 运行库，或 DLL 文件损坏 |
| `-2303` | 初始化 | 初始化返回 false，无具体错误 | Worker 线程可能未启动成功 |
| 自定义负数 | InitProtection | WCDB 授权/保护校验失败 | 资源路径内缺少 WCDB 配置/密钥文件 |
| 自定义负数 | wcdbInit | WCDB 内部初始化失败 | 通常在 InitProtection 之后，级联失败 |
| `-3001` | openAccount | `db_storage/` 目录不存在 | 账号目录选错，或微信未登录 |
| `-3002` | openAccount | `session.db` 未找到 | db_storage 下目录结构不完整 |
| `-3003` | openAccount | 返回无效句柄 | 密钥格式错误或 DB 状态异常 |
| `-3004` | openAccount | 恢复连接时异常 | 上次连接未正确关闭 |
| `-1006` | wcdbInit | **Node 版本不匹配**：tsx/Node 22.x 独立进程不支持 WCDB SDK | 在 Electron (Node 24.x) 中运行，而非 tsx 命令行 |
| Worker 异常退出 | Worker | Worker 进程 crash | 大概率是 VC++ 运行库缺失 |

## 快速诊断步骤

1. 确认错误码 → 对照上表锁定阶段
2. `-1006`（最常见）→ **确认运行环境是 Electron 主进程，不是 tsx/Node.js 命令行**。`InitProtection=0` 但 `wcdb_init=-1006` = Node 版本问题。
3. `-2301/-2302` → 检查 `resources/wcdb/win32/x64/` 下三个 DLL 是否存在且完整
4. `-2302` + Worker 异常 → 安装 VC++ 2015-2022 Redistributable
5. `InitProtection` 失败 → 检查 `resources/wcdb/` 下是否缺配置文件（加密狗/授权文件）
6. `openAccount` 失败 → 先验证密钥是否正确，再验证 db_storage/ 目录路径
