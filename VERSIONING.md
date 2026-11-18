# MSG 版本与安装包命名

## 规则

1. `package.json` → `"version"` 是唯一真源（semver）。
2. electron-builder 产物固定：`MSG-<version>-Setup.exe`。
3. 桌面/分发拷贝**必须同名**；功能说明写进 `CHANGELOG.md`，不要写进文件名冒充版本号。
4. 每开一列功能列车：次版本 `0.N.0`；同列车热修：`0.N.x`。

## 反例（已禁止）

- `MSG-0.1.0-Setup-聊天分析导出修复.exe`
- `MSG-0.1.0-Setup-双人分析与年报加厚.exe`

两者版本号相同，无法区分迭代。

## 正例

- `MSG-0.3.0-Setup.exe` ← 看 CHANGELOG 0.3.0 节
- `MSG-0.3.1-Setup.exe` ← 0.3 列车热修
- `MSG-0.2.0-Setup.exe` ← 上一列车
