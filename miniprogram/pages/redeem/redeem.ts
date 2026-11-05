import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { setLastGifts } from "../../utils/cache";
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
    needLogin: false,
    gift: null as GiftView | null,
    addresses: [] as AddressItem[],
    addressId: "",
    canRedeem: false,
    buttonText: "确认兑换",
    submitting: false,
    error: "",
  },

  giftId: "",
  giftRequestVersion: 0,
  addressRequestVersion: 0,
  /** 幂等请求号：进入页面生成一次，超时/网络失败重试复用；成功后清空 */
  requestId: "",

  onLoad(query: Record<string, string | undefined>) {
    this.giftId = query.id ?? "";
    this.requestId = genRequestId();
    void this.loadGift();
  },

  onShow() {
    // 从登录页返回：重新走登录/礼品/地址加载；从地址编辑页返回：只刷新地址簿
    if (this.data.needLogin && !this.data.loading) {
      void this.loadGift();
      return;
    }
    if (!this.data.loading && this.giftId) {
      void this.loadAddresses();
    }
  },

  async loadGift() {
    const version = ++this.giftRequestVersion;
    const loggedIn = await ensureSession();
    if (version !== this.giftRequestVersion) return;
    if (!loggedIn) {
      this.showLogin();
      return;
    }
    this.setData({ loading: true, needLogin: false, error: "" });
    try {
      const data = await api.gifts();
      if (version !== this.giftRequestVersion) return;
      setLastGifts(data.gifts);
      const gift = data.gifts.find((g) => g.id === this.giftId) ?? null;
      if (!gift) {
        this.setData({
          loading: false,
          gift: null,
          canRedeem: false,
          error: "礼品不存在或已下架",
        });
        return;
      }
      const canRedeem = gift.cost !== null && gift.affordable;
      this.setData({
        loading: false,
        gift: {
          ...gift,
          image: gift.image ? resolveImageUrl(gift.image) : null,
          costText:
            gift.cost === null ? "未解锁" : `${formatPoints(gift.cost)} 积分`,
          priceText: `¥${formatPoints(gift.priceYuan)}`,
        },
        canRedeem,
        buttonText:
          gift.cost === null ? "银卡解锁后可兑换" : gift.affordable ? "确认兑换" : "积分不足",
      });
      await this.loadAddresses();
    } catch (e) {
      if (version !== this.giftRequestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
    }
  },

  showLogin() {
    this.addressRequestVersion += 1;
    this.setData({
      loading: false,
      needLogin: true,
      gift: null,
      addresses: [],
      addressId: "",
      canRedeem: false,
      error: "",
    });
  },

  async loadAddresses() {
    const version = ++this.addressRequestVersion;
    try {
      const data = await api.addresses();
      if (version !== this.addressRequestVersion) return;
      const addresses = data.addresses;
      const picked =
        addresses.find((a) => a.id === this.data.addressId) ??
        addresses.find((a) => a.isDefault) ??
        addresses[0];
      this.setData({ addresses, addressId: picked ? picked.id : "" });
    } catch (e) {
      if (version !== this.addressRequestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      this.setData({ error: err.message || "地址加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  pickAddress(e: WechatMiniprogram.TouchEvent) {
    this.setData({ addressId: e.currentTarget.dataset.id as string });
  },

  addAddress() {
    wx.navigateTo({ url: "/pages/address-edit/address-edit" });
  },

  async submit() {
    const { gift, addressId, canRedeem, submitting } = this.data;
    if (!gift || submitting) return;
    if (!canRedeem) {
      wx.showToast({
        title: gift.cost === null ? "银卡解锁后可兑换" : "可用积分不足",
        icon: "none",
      });
      return;
    }
    if (!addressId) {
      wx.showToast({ title: "请先选择收货地址", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      // 订阅发货通知（用户点击内触发，尽力而为；未配置模板/拒绝订阅均不影响流程）
      await subscribeShipped();

      // 复用同一 requestId：超时/网络失败重试时服务端可识别重复请求
      const requestId = this.requestId || (this.requestId = genRequestId());
      await api.redeem({
        productId: gift.id,
        addressId,
        requestId,
      });
      this.requestId = "";
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
        this.showLogin();
        wx.navigateTo({ url: "/pages/login/login" });
      } else {
        // 服务端已带 message；错误码文案兜底（网络抖动/网关错误等场景）
        const friendly = REDEEM_ERROR_MESSAGES[err.code] ?? err.message;
        wx.showToast({ title: friendly || "兑换失败", icon: "none" });
      }
    }
  },
});
