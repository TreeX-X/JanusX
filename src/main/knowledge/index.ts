/**
 * @file knowledge 模块门面（audit A5，当前为预备入口）
 * @description 目标：模块外（IPC 层、chat 编排等）一律经由本门面引用 knowledge
 *              服务，内部重组时只需维持此导出面稳定。
 *
 *              ⚠️ 暂未切换消费方：各 service 均为「import 即构造」的模块级单例
 *              （audit A4 问题），barrel re-export 会急切加载全部服务图，把窄依赖
 *              消费方（如只用 observation 的 git-handlers）耦合到 LLM 配置链上，
 *              并破坏单测的模块级 mock 隔离。待 A4 组合根把单例改为惰性注入后，
 *              再把消费方统一切到本门面。
 */

export { knowledgeContractService } from './contract-service'
export { knowledgeAuditService } from './audit-service'
export { knowledgeObservationService } from './observation-service'
export { knowledgeExtractService } from './extract-service'
export { knowledgeReviewService } from './review-service'
export { knowledgeSearchService } from './search-service'
export { knowledgeTruthService } from './truth-service'
export { knowledgeContextService } from './context-service'
export { knowledgeOperationsService } from './operations-service'
export { knowledgeRecallService } from './recall-service'
export { agentTurnRecorder } from './agent-turn-recorder'
export { knowledgeRootPath } from './constants'
