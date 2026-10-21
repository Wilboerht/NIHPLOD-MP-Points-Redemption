import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import {
  formatPoints,
  LEVEL_CARD_BG_IMAGES,
  LEVEL_TEXT_COLORS,
  LEVEL_THEME_COLORS,
  resolveImageUrl,
} from "../../utils/format";
import { buildSkinView, type SkinView } from "../../utils/skin";
import type { MembershipLevelInfo, MembershipView } from "../../utils/types";

/** 测肤小程序 appid（同一开放平台账号，用于跨小程序跳转） */
const SKIN_MP_APPID = "wxb52753aa11ed6654";

interface LevelCard extends MembershipLevelInfo {
  /** 进度条/徽标等强调色 */
  color: string;
  /** 等级名称文字色（比强调色更深，保证可读性） */
  textColor: string;
  unlocked: boolean;
  isCurrent: boolean;
  thresholdText: string;
  /** 距离该等级还差多少累计消费 */
  spentNeededText: string;
  /** 当前累计消费 / 该等级门槛，0-100 */
  progress: number;
  expanded: boolean;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    error: "",
    view: null as MembershipView | null,
    currentColor: "#78716c",
    cardBg: "",
    totalSpentText: "0",
    spentNeededText: "",
    levels: [] as LevelCard[],
    skinUsage: null as SkinView | null,
    skinUsageLoading: false,
    skinUsageError: false,
  },

  onShow() {
    void this.load();
  },

  async onPullDownRefresh() {
    try {
      await this.load();
    } finally {
      wx.stopPullDownRefresh();
    }
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
      this.setData({ loading: false, loggedIn: false, skinUsageLoading: false });
      return;
    }
    this.setData({ loading: true, error: "", skinUsageLoading: true, skinUsageError: false });
    try {
      const view = await api.membership();
      const levels: LevelCard[] = view.allLevels.map((level) => {
        const spentNeeded = Math.max(0, level.minSpent - view.totalSpent);
        const progress =
          level.minSpent > 0
            ? Math.min(100, Math.round((view.totalSpent / level.minSpent) * 100))
            : 100;
        return {
          ...level,
          color: LEVEL_THEME_COLORS[level.level] ?? "#78716c",
          textColor: LEVEL_TEXT_COLORS[level.level] ?? "#5f5a54",
          unlocked: level.minSpent <= view.totalSpent,
          isCurrent: level.level === view.membershipLevel,
          thresholdText:
            level.minSpent === 0 ? "注册即享" : `消费满 ¥${formatPoints(level.minSpent)}`,
          spentNeededText: formatPoints(spentNeeded),
          progress,
          expanded: false,
        };
      });

      this.setData({
        loading: false,
        loggedIn: true,
        view,
        currentColor: LEVEL_THEME_COLORS[view.membershipLevel] ?? "#78716c",
        cardBg: resolveImageUrl(LEVEL_CARD_BG_IMAGES[view.membershipLevel] ?? ""),
        totalSpentText: formatPoints(view.totalSpent),
        spentNeededText: view.nextLevel ? formatPoints(view.nextLevel.spentNeeded) : "",
        levels,
        skinUsage: null,
        skinUsageLoading: true,
        skinUsageError: false,
      });
      void this.loadSkinUsage();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false, skinUsageLoading: false });
        return;
      }
      this.setData({
        loading: false,
        error: err.message || "会员信息加载失败",
        skinUsageLoading: false,
        skinUsageError: true,
      });
    }
  },

  /** 测肤用量为增强模块：接口/子站异常时保留卡片并允许重试（fail-soft） */
  async loadSkinUsage() {
    this.setData({ skinUsageLoading: true, skinUsageError: false });
    try {
      const data = await api.skinTestUsage();
      const usage = buildSkinView(data.usage);
      this.setData({
        skinUsage: usage,
        skinUsageLoading: false,
        skinUsageError: !usage,
      });
    } catch {
      this.setData({ skinUsage: null, skinUsageLoading: false, skinUsageError: true });
    }
  },

  reloadSkinUsage() {
    void this.loadSkinUsage();
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
  },

  /** 录入消费：直达补录表单 */
  goSpendForm() {
    wx.navigateTo({ url: "/pages/spent-adjustment-new/spent-adjustment-new" });
  },

  /** 查看已提交的消费补录记录 */
  goSpendHistory() {
    wx.navigateTo({ url: "/pages/spent-adjustments/spent-adjustments" });
  },

  /** 展开/收起等级权益（同时只展开一个） */
  toggleLevel(e: WechatMiniprogram.TouchEvent) {
    const level = e.currentTarget.dataset.level as string;
    const levels = this.data.levels.map((item) => ({
      ...item,
      expanded: item.level === level ? !item.expanded : false,
    }));
    this.setData({ levels });
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
