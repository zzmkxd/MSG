import { join, dirname } from 'path'

/**
 * GUI 子系统应用经快捷方式/资源管理器启动时，stdout/stderr 可能是已关闭的管道：
 * 任何 console 写入都会触发 EPIPE 'error' 事件 → 未捕获异常 → 启动即崩溃
 * （曾表现为 NotificationWindow 延时创建日志 EPIPE 崩溃）。
 * 这里先挂上兜底监听，吞掉管道类错误。
 */
function guardConsolePipes() {
    for (const stream of [process.stdout, process.stderr]) {
        if (!stream || typeof (stream as any).on !== 'function') continue
        stream.on('error', (err: NodeJS.ErrnoException) => {
            // 静默吞掉 EPIPE 等管道写入错误；其余错误也吞掉，避免无监听时的未捕获异常
            void err
        })
    }
}
guardConsolePipes()

/**
 * 强制将本地资源目录添加到 PATH 最前端，确保优先加载本地 DLL
 * 解决系统中存在冲突版本的数据服务导致的应用崩溃问题
 */
function enforceLocalDllPriority() {
    const isDev = !!process.env.VITE_DEV_SERVER_URL
    const sep = process.platform === 'win32' ? ';' : ':'

    let possiblePaths: string[] = []

    if (isDev) {
        // 开发环境
        possiblePaths.push(join(process.cwd(), 'resources'))
    } else {
        // 生产环境
        possiblePaths.push(dirname(process.execPath))
        if (process.resourcesPath) {
            possiblePaths.push(process.resourcesPath)
        }
    }

    const dllPaths = possiblePaths.join(sep)

    if (process.env.PATH) {
        process.env.PATH = dllPaths + sep + process.env.PATH
    } else {
        process.env.PATH = dllPaths
    }

    
}

try {
    enforceLocalDllPriority()
} catch (e) {
    console.error('[WeFlow] Failed to enforce local service priority:', e)
}
