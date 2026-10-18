/**
 * 页面间轻量数据传递（避免为跳转详情重复请求分页接口）
 * 记录页点击条目时写入，详情页读取；id 不匹配时详情页回落为重新查询首页数据。
 */
import type { GiftItem, RedemptionItem } from "./types";

let lastRedemption: RedemptionItem | null = null;
let lastGifts: GiftItem[] = [];

export function setLastRedemption(item: RedemptionItem | null): void {
  lastRedemption = item;
}

export function getLastRedemption(): RedemptionItem | null {
  return lastRedemption;
}

export function setLastGifts(gifts: GiftItem[]): void {
  lastGifts = gifts;
}

export function findLastGift(id: string): GiftItem | null {
  return lastGifts.find((g) => g.id === id) ?? null;
}

/** 清除跨页面临时数据（退出登录、切换账号、会话失效时调用） */
export function clearTransientCache(): void {
  lastRedemption = null;
  lastGifts = [];
}
