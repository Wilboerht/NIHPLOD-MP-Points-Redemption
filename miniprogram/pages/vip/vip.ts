import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatPoints, LEVEL_THEME_COLORS } from "../../utils/format";
import type { MembershipLevelInfo, MembershipView } from "../../utils/types";

interface LevelCard extends MembershipLevelInfo {
  color: string;
  unlocked: boolean;
  isCurrent: boolean;
  thresholdText: string;
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
        totalSpentText: formatPoints(view.totalSpent),
        spentNeededText: view.nextLevel ? formatPoints(view.nextLevel.spentNeeded) : "",
        nextMinSpentText: view.nextLevel ? formatPoints(view.nextLevel.minSpent) : "",
        levels,
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "会员信息加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
  },
});
