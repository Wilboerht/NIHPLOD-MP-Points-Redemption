import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { findLastGift, setLastGifts } from "../../utils/cache";
import { formatPoints, resolveImageUrl } from "../../utils/format";
import type { GiftItem } from "../../utils/types";

type GiftView = GiftItem & { costText: string; priceText: string };

Page({
  data: {
    loading: true,
    needLogin: false,
    notFound: false,
    gift: null as GiftView | null,
    images: [] as string[],
    canRedeem: false,
    buttonText: "立即兑换",
    error: "",
  },

  giftId: "",

  onLoad(query: Record<string, string | undefined>) {
    this.giftId = query.id ?? "";
    void this.load();
  },

  onShow() {
    // 从登录页返回后（needLogin 置位）重试加载
    if (this.data.needLogin) {
      void this.load();
    }
  },

  async load() {
    if (!this.giftId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    // 分享/订阅消息可冷启动直达本页：等待启动期登录完成，未登录时展示登录引导
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, needLogin: true });
      return;
    }
    this.setData({ needLogin: false });
    try {
      let gift = findLastGift(this.giftId);
      if (!gift) {
        const data = await api.gifts();
        setLastGifts(data.gifts);
        gift = data.gifts.find((g) => g.id === this.giftId) ?? null;
      }
      if (!gift) {
        this.setData({ loading: false, notFound: true });
        return;
      }
      const detailImages = (gift.detail?.images ?? [])
        .map((i) => resolveImageUrl(i.url))
        .filter(Boolean);
      const images =
        detailImages.length > 0
          ? detailImages
          : gift.image
            ? [resolveImageUrl(gift.image)]
            : [];
      const canRedeem = gift.cost !== null && gift.affordable;
      this.setData({
        loading: false,
        gift: {
          ...gift,
          costText:
            gift.cost === null ? "普通会员未解锁兑礼" : `${formatPoints(gift.cost)} 积分`,
          priceText: `¥${formatPoints(gift.priceYuan)}`,
        },
        images,
        canRedeem,
        buttonText:
          gift.cost === null ? "升级银卡后解锁" : gift.affordable ? "立即兑换" : "积分不足",
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, needLogin: true });
        return;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goRedeem() {
    // 按钮已禁用，此为防御分支
    if (!this.data.canRedeem) return;
    wx.navigateTo({ url: `/pages/redeem/redeem?id=${this.giftId}` });
  },

  onShareAppMessage() {
    const name = this.data.gift?.name ?? "积分好礼";
    return {
      title: `${name} · NIHPLOD 积分礼遇`,
      path: `/pages/gift-detail/gift-detail?id=${this.giftId}`,
    };
  },

  onShareTimeline() {
    const name = this.data.gift?.name ?? "积分好礼";
    return { title: `${name} · NIHPLOD 积分礼遇` };
  },
});
