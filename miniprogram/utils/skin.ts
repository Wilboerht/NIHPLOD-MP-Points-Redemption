import type { SkinTestUsage } from "./types";

/** AI 测肤用量展示视图（首页 / 会员权益页共用） */
export interface SkinView {
  remainingText: string;
  usedText: string;
  quotaText: string;
  testedToday: boolean;
  checkedInToday: boolean;
  /** 子站是否已返回打卡字段（旧版子站无该字段时不展示打卡胶囊，避免误报） */
  checkedInKnown: boolean;
}

export function buildSkinView(usage: SkinTestUsage | null): SkinView | null {
  if (!usage) return null;
  // 兼容旧版子站未下发 remaining 的情况：用累计上限 - 已用次数兜底
  const remaining =
    usage.remaining ??
    (usage.quota.lifetimeLimit === null
      ? null
      : Math.max(0, usage.quota.lifetimeLimit - usage.totalUsed));
  const unlimited = usage.quota.unlimited || remaining === null;
  const quotaParts: string[] = [];
  if (usage.quota.dailyLimit !== null) {
    quotaParts.push(`每日最多 ${usage.quota.dailyLimit} 次`);
  }
  if (!unlimited && usage.quota.lifetimeLimit !== null) {
    quotaParts.push(`累计上限 ${usage.quota.lifetimeLimit} 次`);
  }
  return {
    remainingText: unlimited ? "不限次" : `剩余 ${remaining} 次`,
    usedText: `已使用 ${usage.totalUsed} 次 · 今日 ${usage.todayUsed} 次`,
    quotaText: quotaParts.join(" · "),
    testedToday: usage.todayUsed > 0,
    checkedInToday: usage.todayCheckedIn === true,
    checkedInKnown: typeof usage.todayCheckedIn === "boolean",
  };
}
