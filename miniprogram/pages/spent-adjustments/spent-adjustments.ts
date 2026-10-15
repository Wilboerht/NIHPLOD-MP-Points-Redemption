import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import {
  formatDateOnly,
  formatPoints,
  spentProofDisplayUrl,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
} from "../../utils/format";
import type { SpentApplication } from "../../utils/types";

interface AppRow extends SpentApplication {
  channelLabel: string;
  statusLabel: string;
  dateText: string;
  amountText: string | null;
  reviewText: string | null;
  displayImages: string[];
  imageCount: number;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    rows: [] as AppRow[],
    pendingCount: 0,
    error: "",
  },

  onShow() {
    void this.load();
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, rows: [] });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.spentAdjustments();
      const rows: AppRow[] = data.applications.map((a) => ({
        ...a,
        channelLabel: SPENT_CHANNEL_LABELS[a.channel] ?? a.channel,
        statusLabel: SPENT_STATUS_LABELS[a.status] ?? a.status,
        dateText: formatDateOnly(a.createdAt),
        amountText:
          a.amountClaimed !== null ? `¥${formatPoints(a.amountClaimed)}` : null,
        reviewText:
          a.status === "APPROVED" && a.reviewAmount !== null
            ? `已核实 ¥${formatPoints(a.reviewAmount)}`
            : a.status === "REJECTED" && a.reviewNote
              ? `驳回原因：${a.reviewNote}`
              : null,
        displayImages: a.images.map(spentProofDisplayUrl).filter(Boolean),
        imageCount: a.images.length,
      }));
      this.setData({
        loading: false,
        loggedIn: true,
        rows,
        pendingCount: rows.filter((r) => r.status === "PENDING").length,
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "补录记录加载失败" });
    }
  },

  createNew() {
    wx.navigateTo({ url: "/pages/spent-adjustment-new/spent-adjustment-new" });
  },

  previewImage(e: WechatMiniprogram.TouchEvent) {
    const { urls, current } = e.currentTarget.dataset as {
      urls: string[];
      current: string;
    };
    if (!urls || urls.length === 0) return;
    wx.previewImage({ urls, current });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
