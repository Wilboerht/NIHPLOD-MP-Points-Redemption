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
    canExpandIngredients: false,
    canExpandUsage: false,
    expandedDetails: {
      ingredients: false,
      usage: false,
    },
    error: "",
  },

  giftId: "",
  requestVersion: 0,
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
    const version = ++this.requestVersion;
    if (!this.giftId) {
      this.setData({ loading: false, notFound: true, gift: null });
      return;
    }
    // 分享/订阅消息可冷启动直达本页：等待启动期登录完成，未登录时展示登录引导
    const loggedIn = await ensureSession();
    if (version !== this.requestVersion) return;
    if (!loggedIn) {
      this.showLogin();
      return;
    }
    this.setData({ loading: true, needLogin: false, error: "" });
    try {
      // force=true 时跳过缓存，确保兑换后返回拿到最新积分/可兑状态
      let gift = force ? null : findLastGift(this.giftId);
      if (!gift) {
        const data = await api.gifts();
        if (version !== this.requestVersion) return;
        setLastGifts(data.gifts);
        gift = data.gifts.find((g) => g.id === this.giftId) ?? null;
      }
      if (!gift) {
        // 强制刷新时清除旧详情，避免下架后仍展示缓存内容
        this.setData({ loading: false, notFound: true, gift: null, canRedeem: false });
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
      const ingredients = gift.detail?.ingredients ?? "";
      const usage = gift.detail?.usage ?? "";
      const shouldExpand = (text: string) => text.length > 160 || text.split(/\r?\n/).length > 3;
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
        buttonText: gift.cost === null ? "升级后解锁" : gift.affordable ? "立即兑换" : "积分不足",
        canExpandIngredients: shouldExpand(ingredients),
        canExpandUsage: shouldExpand(usage),
        expandedDetails: {
          ingredients: false,
          usage: false,
        },
      });
    } catch (e) {
      if (version !== this.requestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      // 后台刷新失败时保留已有详情，但明确提示数据可能滞后
      if (force && this.data.gift) {
        this.setData({ loading: false, error: "刷新失败，当前展示的信息可能不是最新" });
        return;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
    }
  },

  showLogin() {
    this.setData({
      loading: false,
      needLogin: true,
      gift: null,
      images: [],
      benefits: [],
      purchaseLinks: [],
      canRedeem: false,
      error: "",
    });
  },

  toggleDetail(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as "ingredients" | "usage";
    if (key !== "ingredients" && key !== "usage") return;
    const canExpand = key === "ingredients" ? this.data.canExpandIngredients : this.data.canExpandUsage;
    if (!canExpand) return;
    this.setData({
      [`expandedDetails.${key}`]: !this.data.expandedDetails[key],
    });
  },

  retry() {
    void this.load(true);
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
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
    if (jump?.type === "miniprogram" && jump.appId) {
      wx.navigateToMiniProgram({
        appId: jump.appId,
        ...(jump.path ? { path: jump.path } : {}),
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
