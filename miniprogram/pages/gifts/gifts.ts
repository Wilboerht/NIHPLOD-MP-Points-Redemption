import { api } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatPoints, resolveImageUrl } from "../../utils/format";
import { setLastGifts } from "../../utils/cache";
import type { GiftItem } from "../../utils/types";

interface GiftRow extends GiftItem {
  costText: string;
  priceText: string;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    availableText: "0",
    redeemTip: "",
    gifts: [] as GiftRow[],
    error: "",
  },

  onShow() {
    void this.load();
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
      this.setData({
        loading: false,
        loggedIn: true,
        availableText: formatPoints(data.available),
        redeemTip:
          data.redeemRate === null
            ? "普通会员仅累积积分，累计消费满 ¥1,000 升级银卡后解锁兑礼"
            : `当前兑礼率 1:${data.redeemRate}`,
        gifts: data.gifts.map((g) => ({
          ...g,
          image: g.image ? resolveImageUrl(g.image) : null,
          costText: g.cost === null ? "未解锁" : `${formatPoints(g.cost)} 积分`,
          priceText: `¥${formatPoints(g.priceYuan)}`,
        })),
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
