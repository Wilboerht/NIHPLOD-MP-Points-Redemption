import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import {
  formatDateOnly,
  formatPoints,
  SPENT_CHANNEL_LABELS,
  SPENT_STATUS_LABELS,
} from "../../utils/format";
import type { SpentApplication } from "../../utils/types";

interface AppRow extends SpentApplication {
  channelLabel: string;
  statusLabel: string;
  dateText: string;
  purchasedAtText: string | null;
  amountText: string | null;
  reviewText: string | null;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    rows: [] as AppRow[],
    pendingCount: 0,
    canSubmit: true,
    submitText: "申请补录",
    tipExpanded: false,
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
        purchasedAtText: formatDateOnly(a.purchasedAt) || null,
        amountText:
          a.amountClaimed !== null ? `¥${formatPoints(a.amountClaimed)}` : null,
        reviewText:
          a.status === "APPROVED" && a.reviewAmount !== null
            ? `已核实 ¥${formatPoints(a.reviewAmount)}`
            : a.status === "REJECTED" && a.reviewNote
              ? `驳回原因：${a.reviewNote}`
              : null,
      }));
      const pendingCount = rows.filter((r) => r.status === "PENDING").length;
      const canSubmit = pendingCount < 2;
      this.setData({
        loading: false,
        loggedIn: true,
        rows,
        pendingCount,
        canSubmit,
        submitText: canSubmit
          ? pendingCount > 0
            ? `申请补录 · ${pendingCount} 条待审`
            : "申请补录"
          : "待审核 2 条，暂不可申请",
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

  toggleTips() {
    this.setData({ tipExpanded: !this.data.tipExpanded });
  },

  createNew() {
    if (this.data.pendingCount >= 2) {
      wx.showToast({ title: "最多同时 2 条待审核", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/spent-adjustment-new/spent-adjustment-new" });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
