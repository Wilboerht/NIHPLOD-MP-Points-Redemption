import { api, ApiError } from "../../utils/api";
import { findLastGift, setLastGifts } from "../../utils/cache";
import { formatPoints, genRequestId, resolveImageUrl } from "../../utils/format";
import type { AddressItem, GiftItem } from "../../utils/types";

type GiftView = GiftItem & { costText: string; priceText: string };

Page({
  data: {
    loading: true,
    gift: null as GiftView | null,
    addresses: [] as AddressItem[],
    addressId: "",
    submitting: false,
    error: "",
  },

  giftId: "",

  onLoad(query: Record<string, string | undefined>) {
    this.giftId = query.id ?? "";
    void this.loadGift();
  },

  onShow() {
    // 从地址编辑页返回时刷新地址簿（首次加载由 loadGift 负责）
    if (!this.data.loading && this.giftId) {
      void this.loadAddresses();
    }
  },

  async loadGift() {
    try {
      let gift = findLastGift(this.giftId);
      if (!gift) {
        const data = await api.gifts();
        setLastGifts(data.gifts);
        gift = data.gifts.find((g) => g.id === this.giftId) ?? null;
      }
      if (!gift) {
        this.setData({ loading: false, error: "礼品不存在或已下架" });
        return;
      }
      this.setData({
        loading: false,
        gift: {
          ...gift,
          image: gift.image ? resolveImageUrl(gift.image) : null,
          costText:
            gift.cost === null ? "未解锁" : `${formatPoints(gift.cost)} 积分`,
          priceText: `¥${formatPoints(gift.priceYuan)}`,
        },
      });
      await this.loadAddresses();
    } catch (e) {
      this.setData({ loading: false, error: (e as Error).message || "加载失败" });
    }
  },

  async loadAddresses() {
    try {
      const data = await api.addresses();
      const addresses = data.addresses;
      const picked =
        addresses.find((a) => a.id === this.data.addressId) ??
        addresses.find((a) => a.isDefault) ??
        addresses[0];
      this.setData({ addresses, addressId: picked ? picked.id : "" });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ error: err.message || "地址加载失败" });
    }
  },

  pickAddress(e: WechatMiniprogram.TouchEvent) {
    this.setData({ addressId: e.currentTarget.dataset.id as string });
  },

  addAddress() {
    wx.navigateTo({ url: "/pages/address-edit/address-edit" });
  },

  async submit() {
    const { gift, addressId, submitting } = this.data;
    if (!gift || submitting) return;
    if (!addressId) {
      wx.showToast({ title: "请先选择收货地址", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const result = await api.redeem({
        productId: gift.id,
        addressId,
        requestId: genRequestId(),
      });
      wx.showToast({
        title: result.duplicated ? "兑换成功" : "兑换成功",
        icon: "success",
      });
      setTimeout(() => {
        wx.switchTab({ url: "/pages/records/records" });
      }, 800);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
      } else if (err.status === 400 && err.code === "INSUFFICIENT") {
        wx.showToast({ title: "可用积分不足", icon: "none" });
      } else {
        wx.showToast({ title: err.message || "兑换失败", icon: "none" });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },
});
