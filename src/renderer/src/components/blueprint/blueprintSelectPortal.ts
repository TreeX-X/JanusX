import { createContext, useContext } from 'react'

/**
 * 蓝图工作台专属下拉承载层 Context。
 *
 * 工作台开启时，BlueprintWorkbench 会向 body portal 一个 z-index 12001
 * （高于遮罩 12000）的零尺寸承载层，并通过本 Context 把该 DOM 节点
 * 暴露给画布内的所有 Select，使其下拉浮层进入比遮罩更高的层叠上下文。
 *
 * Provider 缺省（例如 BlueprintView 以 embedded 模式独立使用）时值为 null，
 * Select 的 getPortalContainer 回退为 undefined，浮层仍挂到 document.body，
 * 行为与引入本 Context 之前完全一致。
 */
export const BlueprintSelectPortalContext = createContext<HTMLDivElement | null>(null)

export function useBlueprintSelectPortal(): HTMLDivElement | null {
  return useContext(BlueprintSelectPortalContext)
}