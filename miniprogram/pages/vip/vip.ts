import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatPoints, LEVEL_CARD_BG_IMAGES, LEVEL_THEME_COLORS, resolveImageUrl } from "../../utils/format";
import { buildSkinView, type SkinView } from "../../utils/skin";
import type { MembershipLevelInfo, MembershipView } from "../../utils/types";

/** 测肤小程序 appid（同一开放平台账号，用于跨小程序跳转） */
const SKIN_MP_APPID = "wxb52753aa11ed6654";

interface LevelCard extends MembershipLevelInfo {
  color: string;
  unlocked: boolean;
  isCurrent: boolean;
  thresholdText: string;
  expanded: boolean;
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
    levels: [] as LevelCard[],
    skinUsage: null as SkinView | null,
    /** 会员卡背景样式（等级卡面 + 白色薄纱渐变） */
    cardStyle: "",
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
        expanded: false,
      }));
      const cardBg = resolveImageUrl(LEVEL_CARD_BG_IMAGES[view.membershipLevel] ?? "");
      this.setData({
        loading: false,
        loggedIn: true,
        view,
        currentColor: LEVEL_THEME_COLORS[view.membershipLevel] ?? "#78716c",
        // 与积分页一致：左上强、右下弱的薄纱渐变，保证文字可读并保留卡面纹理
        cardStyle: cardBg
          ? `background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.14) 100%), url("${cardBg}");`
          : "",
        totalSpentText: formatPoints(view.totalSpent),
        spentNeededText: view.nextLevel ? formatPoints(view.nextLevel.spentNeeded) : "",
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
      this.setData({ skinUsage: buildSkinView(data.usage) });
    } catch {
      this.setData({ skinUsage: null });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
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
