/**
 * src/main/project/utils/port-extractor.ts
 *
 * 端口号提取工具
 * 职责：
 * 1. 从日志输出中自动检测服务器端口号
 * 2. 支持多种框架的日志格式
 */

/**
 * PortExtractor - 从日志中提取端口号
 *
 * 支持的格式：
 * - Next.js: "- Local:        http://localhost:3000"
 * - Vite: "Local:   http://localhost:5173/"
 * - Django: "Starting development server at http://127.0.0.1:8000/"
 * - Flask: "Running on http://localhost:5000"
 * - Node/Express: "Server listening on port 3000"
 * - Go: "listening on :8080"
 * - Rust: "listening on 127.0.0.1:8000"
 */
export class PortExtractor {
  // 所有可能的端口号匹配模式
  private static readonly PATTERNS = [
    // localhost:port or 127.0.0.1:port
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/,

    // 192.168.x.x:port 或其他 IP
    /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)/,

    // "port 3000" 或 "PORT 3000" 形式
    /(?:port|PORT)\s+(\d+)/,

    // ":port" 形式（Go、Rust 风格）
    /:(\d+)(?:\s|$)/,

    // "on port" 或 "on :port"
    /on\s+(?::)?(\d+)/,

    // http://... 格式
    /https?:\/\/[^:]+:(\d+)/,

    // "address :::3000" 或类似格式
    /address\s+.*:(\d+)/,
  ]

  /**
   * 从日志行提取端口号
   *
   * @param line 日志行
   * @returns 提取到的端口号，或 null
   */
  static extract(line: string): number | null {
    if (!line || line.length === 0) {
      return null
    }

    // 遍历所有模式尝试匹配
    for (const pattern of this.PATTERNS) {
      const match = line.match(pattern)
      if (match) {
        // 获取端口号（通常在第一个捕获组）
        const portStr = match[match.length - 1]
        const port = parseInt(portStr, 10)

        // 验证端口号有效性
        if (this.isValidPort(port)) {
          return port
        }
      }
    }

    return null
  }

  /**
   * 验证端口号的合法性
   */
  private static isValidPort(port: number): boolean {
    return port >= 1 && port <= 65535 && Number.isInteger(port)
  }

  /**
   * 从多行输出中提取第一个端口号
   * 用于扫描整个日志
   */
  static extractFromMultiline(text: string): number | null {
    const lines = text.split('\n')
    for (const line of lines) {
      const port = this.extract(line)
      if (port !== null) {
        return port
      }
    }
    return null
  }

  /**
   * 获取所有匹配的端口号（可能有多个）
   */
  static extractAll(text: string): number[] {
    const ports = new Set<number>()
    const lines = text.split('\n')

    for (const line of lines) {
      const port = this.extract(line)
      if (port !== null) {
        ports.add(port)
      }
    }

    return Array.from(ports).sort((a, b) => a - b)
  }
}

export default PortExtractor
