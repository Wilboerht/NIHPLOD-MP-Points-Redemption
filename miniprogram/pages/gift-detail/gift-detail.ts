import { api } from "../../utils/api";
import { findLastGift, setLastGifts } from "../../utils/cache";
import { formatPoints, resolveImageUrl } from "../../utils/format";
import type { GiftItem } from "../../utils/types";

type GiftView = GiftItem & { costText: string; priceText: string };

Page({
  data: {
    loading: true,
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

  async load() {
    if (!this.giftId) {
      this.setData({ loading: false, notFound: true });
      return;
    }
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
      this.setData({ loading: false, error: (e as Error).message || "加载失败" });
    }
  },

  goRedeem() {
    if (!this.data.canRedeem) {
      wx.showToast({ title: this.data.buttonText, icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/redeem/redeem?id=${this.giftId}` });
  },
});
