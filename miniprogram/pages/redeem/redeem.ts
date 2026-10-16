import { api, ApiError } from "../../utils/api";
import { findLastGift, setLastGifts } from "../../utils/cache";
import {
  formatPoints,
  genRequestId,
  REDEEM_ERROR_MESSAGES,
  resolveImageUrl,
} from "../../utils/format";
import { subscribeShipped } from "../../utils/subscribe";
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
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
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
      // 订阅发货通知（用户点击内触发，尽力而为；未配置模板/拒绝订阅均不影响流程）
      await subscribeShipped();

      await api.redeem({
        productId: gift.id,
        addressId,
        requestId: genRequestId(),
      });
      // 成功提示期间保持 submitting=true，避免 800ms 跳转窗口内重复提交
      wx.showToast({ title: "兑换成功", icon: "success" });
      setTimeout(() => {
        // 记录页已不是 tab 页：redirectTo 替换当前确认页，返回时回到礼品详情
        wx.redirectTo({ url: "/pages/records/records" });
      }, 800);
    } catch (e) {
      this.setData({ submitting: false });
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
      } else {
        // 服务端已带 message；错误码文案兜底（网络抖动/网关错误等场景）
        const friendly = REDEEM_ERROR_MESSAGES[err.code] ?? err.message;
        wx.showToast({ title: friendly || "兑换失败", icon: "none" });
      }
    }
  },
});
