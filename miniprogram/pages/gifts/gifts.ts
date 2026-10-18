import { api } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import {
  formatPoints,
  LEVEL_CARD_BG_IMAGES,
  LEVEL_NAME_LABELS,
  mapGiftRow,
  resolveImageUrl,
} from "../../utils/format";
import type { GiftRow } from "../../utils/format";
import { setLastGifts } from "../../utils/cache";
import { getStatusBarHeight } from "../../utils/ui";

Page({
  data: {
    loading: true,
    loggedIn: false,
    /** 自定义导航栏状态栏高度（px） */
    statusBarHeight: 20,
    availableText: "0",
    /** 当前等级是否可参与兑礼（普通会员为 false，展示升级引导） */
    canRedeem: false,
    /** 会员等级名称（头部积分卡） */
    levelName: "",
    /** 头部积分卡背景样式（会员等级卡面 + 白色薄纱层） */
    cardStyle: "",
    gifts: [] as GiftRow[],
    error: "",
  },

  onLoad() {
    // 页面为自定义导航栏（navigationStyle: custom），状态栏高度取全局缓存
    this.setData({ statusBarHeight: getStatusBarHeight() });
  },

  onShow() {
    void this.load();
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    try {
      await this.load();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, error: "" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.gifts();
      setLastGifts(data.gifts);
      const canRedeem = data.redeemRate !== null;
      const cardBg = resolveImageUrl(LEVEL_CARD_BG_IMAGES[data.membershipLevel] ?? "");
      this.setData({
        loading: false,
        loggedIn: true,
        availableText: formatPoints(data.available),
        canRedeem,
        levelName: LEVEL_NAME_LABELS[data.membershipLevel] ?? "",
        // 卡面左上强、右下弱的薄纱渐变：保证文字可读同时保留卡面纹理
        cardStyle: cardBg
          ? `background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.14) 100%), url("${cardBg}");`
          : "",
        gifts: data.gifts.map(mapGiftRow),
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "礼品加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goVip() {
    wx.navigateTo({ url: "/pages/vip/vip" });
  },

  goLedger() {
    wx.navigateTo({ url: "/pages/points-ledger/points-ledger" });
  },

  goRecords() {
    wx.navigateTo({ url: "/pages/records/records" });
  },

  /** 获取积分：进入消费补录，提交未计入的官方渠道订单 */
  goSpentAdjust() {
    wx.navigateTo({ url: "/pages/spent-adjustments/spent-adjustments" });
  },

  /** 积分规则（组件 components/rules-sheet，与「我的」页共用） */
  openRules() {
    const sheet = this.selectComponent("#rules-sheet") as unknown as {
      show: () => void;
    } | null;
    sheet?.show();
  },

  onShareAppMessage() {
    return { title: "NIHPLOD 积分礼遇，好礼免费兑", path: "/pages/gifts/gifts" };
  },

  onShareTimeline() {
    return { title: "NIHPLOD 积分礼遇，好礼免费兑" };
  },

  openGift(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/gift-detail/gift-detail?id=${id}` });
  },
});
