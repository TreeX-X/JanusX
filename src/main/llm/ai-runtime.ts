/**
 * @file AI SDK 运行时垫层
 * @description 对 `ai` 包的唯一 re-export 出口（audit A7：意图说明，勿"优化"删除）。
 *              作用：
 *              1. 把第三方 SDK 依赖收敛到单点，主进程业务代码不直接 import 'ai'，
 *                 升级/替换 AI SDK 版本时只改这里（llm-core 内部另有自己的依赖面）。
 *              2. `src/main/index.ts` 的 llm-runtime smoke 测试按名探测这三个导出，
 *                 确保打包产物里 AI SDK 可用——重命名导出会破坏 smoke 检查。
 */
export { generateObject, generateText, streamText } from 'ai'
