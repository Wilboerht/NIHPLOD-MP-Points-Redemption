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
    loadMoreError: "",
  },

  refreshing: false,
  requestVersion: 0,

  onShow() {
    void this.refresh();
  },

  onReachBottom() {
    void this.loadMore();
  },

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    const version = ++this.requestVersion;
    this.setData({ loading: true, error: "", loadMoreError: "", loadingMore: false });
    try {
      const loggedIn = await ensureSession();
      if (version !== this.requestVersion) return;
      if (!loggedIn) {
        this.setData({ loading: false, loggedIn: false, rows: [], hasMore: false, total: 0 });
        return;
      }
      const data = await api.pointsLedger(0);
      if (version !== this.requestVersion) return;
      this.setData({
        loading: false,
        loggedIn: true,
        rows: this.mapRows(data.items),
        hasMore: data.hasMore,
        total: data.total,
      });
    } catch (e) {
      if (version !== this.requestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false, rows: [], hasMore: false, total: 0 });
        return;
      }
      this.setData({ loading: false, error: err.message || "明细加载失败" });
    } finally {
      if (version === this.requestVersion) this.refreshing = false;
    }
  },

  async loadMore() {
    if (
      this.refreshing ||
      this.data.loading ||
      this.data.loadingMore ||
      !this.data.hasMore ||
      !this.data.loggedIn
    ) return;
    const version = this.requestVersion;
    this.setData({ loadingMore: true, loadMoreError: "" });
    try {
      const data = await api.pointsLedger(this.data.rows.length);
      if (version !== this.requestVersion) return;
      const existing = new Set(this.data.rows.map((row) => row.id));
      const additions = this.mapRows(data.items).filter((row) => !existing.has(row.id));
      this.setData({
        rows: [...this.data.rows, ...additions],
        hasMore: data.hasMore,
        total: data.total,
      });
    } catch (e) {
      if (version === this.requestVersion) {
        this.setData({ loadMoreError: (e as ApiError).message || "加载更多失败，点击重试" });
      }
    } finally {
      if (version === this.requestVersion) this.setData({ loadingMore: false });
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
