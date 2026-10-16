import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatPoints, LEVEL_CARD_BG_IMAGES, LEVEL_THEME_COLORS, resolveImageUrl } from "../../utils/format";
import type { MembershipLevelInfo, MembershipView, SkinTestUsage } from "../../utils/types";

/** 测肤小程序 appid（同一开放平台账号，用于跨小程序跳转） */
const SKIN_MP_APPID = "wxb52753aa11ed6654";

interface LevelCard extends MembershipLevelInfo {
  color: string;
  unlocked: boolean;
  isCurrent: boolean;
  thresholdText: string;
}

/** AI 测肤用量展示视图 */
interface SkinView {
  remainingText: string;
  usedText: string;
  quotaText: string;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    error: "",
    view: null as MembershipView | null,
    currentColor: "#78716c",
    totalSpentText: "0",
    spentNeededText: "",
    nextMinSpentText: "",
    levels: [] as LevelCard[],
    skinUsage: null as SkinView | null,
    /** 会员卡背景图（按等级映射官网静态资源） */
    cardBg: "",
  },

  onShow() {
    void this.load();
  },

  onShareAppMessage() {
    return { title: "NIHPLOD 会员礼遇，消费积分兑好礼", path: "/pages/home/home" };
  },

  onShareTimeline() {
    return { title: "NIHPLOD 会员礼遇，消费积分兑好礼" };
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const view = await api.membership();
      const levels: LevelCard[] = view.allLevels.map((level) => ({
        ...level,
        color: LEVEL_THEME_COLORS[level.level] ?? "#78716c",
        unlocked: level.minSpent <= view.totalSpent,
        isCurrent: level.level === view.membershipLevel,
        thresholdText:
          level.minSpent === 0 ? "注册即享" : `消费满 ¥${formatPoints(level.minSpent)}`,
      }));
      this.setData({
        loading: false,
        loggedIn: true,
        view,
        currentColor: LEVEL_THEME_COLORS[view.membershipLevel] ?? "#78716c",
        cardBg: resolveImageUrl(LEVEL_CARD_BG_IMAGES[view.membershipLevel] ?? ""),
        totalSpentText: formatPoints(view.totalSpent),
        spentNeededText: view.nextLevel ? formatPoints(view.nextLevel.spentNeeded) : "",
        nextMinSpentText: view.nextLevel ? formatPoints(view.nextLevel.minSpent) : "",
        levels,
        // 先重置，测肤用量异步补充（不阻塞会员主内容：子站降级时官网查询最长 3s）
        skinUsage: null,
      });
      void this.loadSkinUsage();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "会员信息加载失败" });
    }
  },

  /** 测肤用量为增强模块：接口/子站异常时隐藏卡片（fail-soft） */
  async loadSkinUsage() {
    try {
      const data = await api.skinTestUsage();
      this.setData({ skinUsage: this.buildSkinView(data.usage) });
    } catch {
      this.setData({ skinUsage: null });
    }
  },

  /** 组装 AI 测肤用量展示文案（usage 为 null 时返回 null，隐藏卡片） */
  buildSkinView(usage: SkinTestUsage | null): SkinView | null {
    if (!usage) return null;
    const unlimited = usage.quota.unlimited || usage.remaining === null;
    const quotaParts: string[] = [];
    if (usage.quota.dailyLimit !== null) {
      quotaParts.push(`每日最多 ${usage.quota.dailyLimit} 次`);
    }
    if (!unlimited && usage.quota.lifetimeLimit !== null) {
      quotaParts.push(`累计上限 ${usage.quota.lifetimeLimit} 次`);
    }
    return {
      remainingText: unlimited ? "不限次" : `剩余 ${usage.remaining} 次`,
      usedText: `已使用 ${usage.totalUsed} 次 · 今日 ${usage.todayUsed} 次`,
      quotaText: quotaParts.join(" · "),
    };
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
  },

  /** 跳转测肤小程序去使用测肤权益（未关联/未安装时引导搜索） */
  goSkinTest() {
    wx.navigateToMiniProgram({
      appId: SKIN_MP_APPID,
      fail: () => {
        wx.showToast({ title: "打开失败，请在微信中搜索「肌智派」", icon: "none" });
      },
    });
  },
});
