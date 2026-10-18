import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { spentProofDisplayUrl, SPENT_CHANNEL_OPTIONS } from "../../utils/format";
import { subscribeSpentReview } from "../../utils/subscribe";
import type { SpentApplicationInput } from "../../utils/types";

interface ProofItem {
  /** 上传接口返回的原始值（提交时原样回传） */
  raw: string;
  /** 可展示地址（公开/本地路径）；私有 objectName 为空串，仅展示占位 */
  display: string;
}

const MAX_IMAGES = 3;

Page({
  data: {
    saving: false,
    uploading: false,
    error: "",
    errorField: "" as "" | "dealerName" | "orderNo" | "amount",
    channelOptions: SPENT_CHANNEL_OPTIONS.map((o) => o.label),
    channelIndex: 0,
    isDealer: false,
    dealerName: "",
    orderNo: "",
    amount: "",
    note: "",
    purchasedAt: "",
    today: "",
    images: [] as ProofItem[],
    maxImages: MAX_IMAGES,
  },

  /** 登录引导是否已触发（用户跳过登录返回时不再反复跳转） */
  loginPrompted: false,
  checkingSession: false,

  onLoad() {
    const now = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    this.setData({
      today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    });
    void this.checkSession();
  },

  onShow() {
    // 从登录页返回后重试会话检查（首次进入由 onLoad 触发）
    void this.checkSession();
  },

  async checkSession() {
    if (this.checkingSession) return;
    this.checkingSession = true;
    try {
      const loggedIn = await ensureSession();
      if (!loggedIn && !this.loginPrompted) {
        this.loginPrompted = true;
        wx.navigateTo({ url: "/pages/login/login" });
      }
    } finally {
      this.checkingSession = false;
    }
  },

  onChannelChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    this.setData({
      channelIndex: index,
      isDealer: SPENT_CHANNEL_OPTIONS[index]?.value === "DEALER",
      error: "",
      errorField: "",
    });
  },

  onDealerInput(e: WechatMiniprogram.Input) {
    this.setData({ dealerName: e.detail.value, error: "", errorField: "" });
  },

  onOrderInput(e: WechatMiniprogram.Input) {
    this.setData({ orderNo: e.detail.value, error: "", errorField: "" });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    this.setData({ amount: e.detail.value, error: "", errorField: "" });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ purchasedAt: String(e.detail.value), error: "", errorField: "" });
  },

  clearDate() {
    this.setData({ purchasedAt: "", error: "", errorField: "" });
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value, error: "", errorField: "" });
  },

  showFieldError(field: "dealerName" | "orderNo" | "amount", message: string) {
    this.setData({ error: message, errorField: field }, () => {
      wx.pageScrollTo({ selector: ".form-row-error", offsetTop: -140, duration: 250 });
    });
  },

  chooseImages() {
    if (this.data.uploading) return;
    const remaining = MAX_IMAGES - this.data.images.length;
    if (remaining <= 0) return;
    wx.chooseMedia({
      count: remaining,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath);
        void this.uploadAll(paths);
      },
    });
  },

  async uploadAll(paths: string[]) {
    this.setData({ uploading: true, error: "", errorField: "" });
    const uploaded: ProofItem[] = [];
    try {
      for (const path of paths) {
        const result = await api.uploadSpentProof(path);
        uploaded.push({ raw: result.url, display: spentProofDisplayUrl(result.url) });
      }
      this.setData({ uploading: false, images: [...this.data.images, ...uploaded] });
    } catch (e) {
      // 部分成功：保留已上传的，提示失败
      this.setData({
        uploading: false,
        images: [...this.data.images, ...uploaded],
        error: (e as ApiError).message || "凭证上传失败，请重试",
      });
    }
  },

  removeImage(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({
      images: this.data.images.filter((_, i) => i !== index),
      error: "",
      errorField: "",
    });
  },

  previewImage(e: WechatMiniprogram.TouchEvent) {
    const current = e.currentTarget.dataset.current as string;
    const urls = this.data.images.map((i) => i.display).filter(Boolean);
    if (!current || urls.length === 0) return;
    wx.previewImage({ urls, current });
  },

  async submit() {
    const { channelIndex, isDealer, dealerName, orderNo, amount, note, purchasedAt, images, saving, uploading } =
      this.data;
    if (saving || uploading) return;

    if (isDealer && !dealerName.trim()) {
      this.showFieldError("dealerName", "请填写经销商名称");
      return;
    }
    if (!orderNo.trim()) {
      this.showFieldError("orderNo", "请填写订单号或小票号");
      return;
    }
    const claimedAmount = amount.trim() ? Number(amount.trim()) : undefined;
    if (
      claimedAmount !== undefined &&
      (!/^\d+$/.test(amount.trim()) || claimedAmount < 1 || claimedAmount > 1_000_000)
    ) {
      this.showFieldError("amount", "申报金额需为 1~1,000,000 的整数（元）");
      return;
    }

    const payload: SpentApplicationInput = {
      channel: SPENT_CHANNEL_OPTIONS[channelIndex].value as SpentApplicationInput["channel"],
      orderNo: orderNo.trim(),
    };
    if (isDealer) payload.dealerName = dealerName.trim();
    if (claimedAmount !== undefined) payload.amountClaimed = claimedAmount;
    if (purchasedAt) payload.purchasedAt = purchasedAt;
    if (note.trim()) payload.note = note.trim();
    if (images.length > 0) payload.images = images.map((i) => i.raw);

    // 先置 saving 再弹订阅授权，避免订阅弹窗期间快速二次点击提交
    this.setData({ saving: true, error: "", errorField: "" });
    try {
      // 订阅审核结果通知（用户点击内触发，尽力而为）
      await subscribeSpentReview();
      await api.createSpentAdjustment(payload);
      wx.showToast({ title: "已提交，等待审核", icon: "success" });
      // 成功期间保持 saving=true，直到页面返回
      setTimeout(() => wx.navigateBack({ delta: 1 }), 800);
    } catch (e) {
      this.setData({ saving: false });
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ error: err.message || "提交失败，请稍后重试" });
    }
  },
});
