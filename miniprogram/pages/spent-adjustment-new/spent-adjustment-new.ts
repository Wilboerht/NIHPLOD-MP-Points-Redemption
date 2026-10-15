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

  async onLoad() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      wx.navigateTo({ url: "/pages/login/login" });
      return;
    }
    const now = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    this.setData({
      today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    });
  },

  onChannelChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value);
    this.setData({
      channelIndex: index,
      isDealer: SPENT_CHANNEL_OPTIONS[index]?.value === "DEALER",
      error: "",
    });
  },

  onDealerInput(e: WechatMiniprogram.Input) {
    this.setData({ dealerName: e.detail.value, error: "" });
  },

  onOrderInput(e: WechatMiniprogram.Input) {
    this.setData({ orderNo: e.detail.value, error: "" });
  },

  onAmountInput(e: WechatMiniprogram.Input) {
    this.setData({ amount: e.detail.value, error: "" });
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ purchasedAt: String(e.detail.value), error: "" });
  },

  onNoteInput(e: WechatMiniprogram.Input) {
    this.setData({ note: e.detail.value, error: "" });
  },

  chooseImages() {
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
    this.setData({ uploading: true, error: "" });
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
    this.setData({ images: this.data.images.filter((_, i) => i !== index) });
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
      this.setData({ error: "请填写经销商名称" });
      return;
    }
    if (!orderNo.trim()) {
      this.setData({ error: "请填写订单号或小票号" });
      return;
    }
    const claimedAmount = amount.trim() ? Number(amount.trim()) : undefined;
    if (
      claimedAmount !== undefined &&
      (!/^\d+$/.test(amount.trim()) || claimedAmount < 1 || claimedAmount > 1_000_000)
    ) {
      this.setData({ error: "申报金额需为 1~1,000,000 的整数（元）" });
      return;
    }

    // 订阅审核结果通知（用户点击内触发，尽力而为）
    await subscribeSpentReview();

    const payload: SpentApplicationInput = {
      channel: SPENT_CHANNEL_OPTIONS[channelIndex].value as SpentApplicationInput["channel"],
      orderNo: orderNo.trim(),
    };
    if (isDealer) payload.dealerName = dealerName.trim();
    if (claimedAmount !== undefined) payload.amountClaimed = claimedAmount;
    if (purchasedAt) payload.purchasedAt = purchasedAt;
    if (note.trim()) payload.note = note.trim();
    if (images.length > 0) payload.images = images.map((i) => i.raw);

    this.setData({ saving: true, error: "" });
    try {
      await api.createSpentAdjustment(payload);
      wx.showToast({ title: "已提交，等待审核", icon: "success" });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 800);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ error: err.message || "提交失败，请稍后重试" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
