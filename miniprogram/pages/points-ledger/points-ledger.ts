import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatDateTime, formatPoints, LEDGER_TYPE_LABELS } from "../../utils/format";
import type { LedgerItem } from "../../utils/types";

interface LedgerRow extends LedgerItem {
  typeLabel: string;
  dateText: string;
  amountText: string;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    loggedIn: false,
    rows: [] as LedgerRow[],
    hasMore: false,
    total: 0,
    error: "",
  },

  onShow() {
    void this.refresh();
  },

  onReachBottom() {
    void this.loadMore();
  },

  async refresh() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, rows: [], hasMore: false });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.pointsLedger(0);
      this.setData({
        loading: false,
        loggedIn: true,
        rows: this.mapRows(data.items),
        hasMore: data.hasMore,
        total: data.total,
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "明细加载失败" });
    }
  },

  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore || !this.data.loggedIn) return;
    this.setData({ loadingMore: true });
    try {
      const data = await api.pointsLedger(this.data.rows.length);
      this.setData({
        loadingMore: false,
        rows: [...this.data.rows, ...this.mapRows(data.items)],
        hasMore: data.hasMore,
        total: data.total,
      });
    } catch {
      this.setData({ loadingMore: false });
    }
  },

  mapRows(items: LedgerItem[]): LedgerRow[] {
    return items.map((item) => ({
      ...item,
      typeLabel: LEDGER_TYPE_LABELS[item.type] ?? item.type,
      dateText: formatDateTime(item.createdAt),
      amountText: `${item.amount > 0 ? "+" : ""}${formatPoints(item.amount)}`,
    }));
  },

  copyReference(e: WechatMiniprogram.TouchEvent) {
    const ref = e.currentTarget.dataset.ref as string;
    if (!ref) return;
    wx.setClipboardData({
      data: ref,
      success: () => wx.showToast({ title: "流水号已复制", icon: "none" }),
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
