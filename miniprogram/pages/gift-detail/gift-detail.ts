import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { findLastGift, setLastGifts } from "../../utils/cache";
import { formatPoints, resolveImageUrl } from "../../utils/format";
import type { GiftItem, GiftPurchaseLink } from "../../utils/types";

type GiftView = GiftItem & { costText: string; priceText: string };

Page({
  data: {
    loading: true,
    needLogin: false,
    notFound: false,
    gift: null as GiftView | null,
    images: [] as string[],
    /** 当前画廊索引（多图时展示计数） */
    current: 0,
    benefits: [] as string[],
    purchaseLinks: [] as GiftPurchaseLink[],
    canRedeem: false,
    buttonText: "立即兑换",
    error: "",
  },

  giftId: "",
  /** 首次 onShow 与 onLoad 共用一次加载；之后从兑换/登录页返回时强制刷新 */
  hasShown: false,

  onLoad(query: Record<string, string | undefined>) {
    this.giftId = query.id ?? "";
    void this.load(false);
  },

  onShow() {
    if (this.hasShown) {
      void this.load(true);
      return;
    }
    this.hasShown = true;
  },

  async load(force: boolean) {
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
    this.setData({ loading: true, needLogin: false, error: "" });
    try {
      // force=true 时跳过缓存，确保兑换后返回拿到最新积分/可兑状态
      let gift = force ? null : findLastGift(this.giftId);
      if (!gift) {
        const data = await api.gifts();
        setLastGifts(data.gifts);
        gift = data.gifts.find((g) => g.id === this.giftId) ?? null;
      }
      if (!gift) {
        // 强制刷新时清除旧详情，避免下架后仍展示缓存内容
        this.setData({ loading: false, notFound: true, gift: null });
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
        notFound: false,
        error: "",
        gift: {
          ...gift,
          costText: gift.cost === null ? "银卡解锁" : `${formatPoints(gift.cost)} 积分`,
          priceText: `¥${formatPoints(gift.priceYuan)}`,
        },
        images,
        current: 0,
        // 核心功效标签（detail 全量下发，按需渲染）
        benefits: gift.detail?.benefits ?? [],
        purchaseLinks: gift.detail?.purchaseLinks ?? [],
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
      // 后台刷新失败时保留已有详情，避免把正常页面打成错误页
      if (force && this.data.gift) {
        this.setData({ loading: false, error: "" });
        return;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  /** 画廊滑动：记录当前索引用于计数 */
  onSwiperChange(e: WechatMiniprogram.CustomEvent<{ current: number }>) {
    this.setData({ current: e.detail.current });
  },

  /** 点击图片全屏预览 */
  previewImage(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const urls = this.data.images;
    if (urls.length === 0) return;
    wx.previewImage({ urls, current: urls[index] ?? urls[0] });
  },

  goRedeem() {
    // 按钮已禁用，此为防御分支
    if (!this.data.canRedeem) return;
    wx.navigateTo({ url: `/pages/redeem/redeem?id=${this.giftId}` });
  },

  openPurchaseLink(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const link = this.data.purchaseLinks[index];
    if (!link) return;

    const jump = link.jump;
    if (jump?.type === "miniprogram" && jump.shortLink) {
      wx.navigateToMiniProgram({
        shortLink: jump.shortLink,
        fail: () => this.tryAppIdJump(link),
      });
      return;
    }
    this.tryAppIdJump(link);
  },

  tryAppIdJump(link: GiftPurchaseLink) {
    const jump = link.jump;
    if (jump?.type === "miniprogram" && jump.appId && jump.path) {
      wx.navigateToMiniProgram({
        appId: jump.appId,
        path: jump.path,
        fail: () => this.copyPurchaseLink(link.url),
      });
      return;
    }
    this.copyPurchaseLink(link.url);
  },

  copyPurchaseLink(url: string) {
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: "链接已复制，请在浏览器打开", icon: "none" });
      },
    });
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
