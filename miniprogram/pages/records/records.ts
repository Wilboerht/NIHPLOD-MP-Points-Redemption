import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { setLastRedemption } from "../../utils/cache";
import { formatDateOnly, formatPoints, REDEMPTION_STATUS_LABELS, resolveImageUrl } from "../../utils/format";
import type { RedemptionItem } from "../../utils/types";

interface RedemptionRow extends RedemptionItem {
  statusText: string;
  dateText: string;
  pointsText: string;
  imageUrl: string | null;
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    loggedIn: false,
    rows: [] as RedemptionRow[],
    hasMore: false,
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

  /** 下拉刷新 */
  async onPullDownRefresh() {
    try {
      await this.refresh();
    } finally {
      wx.stopPullDownRefresh();
    }
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
        this.setData({ loading: false, loggedIn: false, rows: [], hasMore: false });
        return;
      }
      const data = await api.redemptions(0);
      if (version !== this.requestVersion) return;
      this.setData({
        loading: false,
        loggedIn: true,
        rows: this.mapRows(data.redemptions),
        hasMore: data.hasMore,
      });
    } catch (e) {
      if (version !== this.requestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false, rows: [], hasMore: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "记录加载失败" });
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
      const data = await api.redemptions(this.data.rows.length);
      if (version !== this.requestVersion) return;
      const existing = new Set(this.data.rows.map((row) => row.id));
      const additions = this.mapRows(data.redemptions).filter((row) => !existing.has(row.id));
      this.setData({
        rows: [...this.data.rows, ...additions],
        hasMore: data.hasMore,
      });
    } catch (e) {
      if (version === this.requestVersion) {
        this.setData({ loadMoreError: (e as ApiError).message || "加载更多失败，点击重试" });
      }
    } finally {
      if (version === this.requestVersion) this.setData({ loadingMore: false });
    }
  },

  mapRows(items: RedemptionItem[]): RedemptionRow[] {
    return items.map((r) => ({
      ...r,
      statusText: REDEMPTION_STATUS_LABELS[r.status] ?? r.status,
      dateText: formatDateOnly(r.createdAt),
      pointsText: `-${formatPoints(r.points)} 积分`,
      imageUrl: r.image ? resolveImageUrl(r.image) : null,
    }));
  },

  open(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const item = this.data.rows.find((r) => r.id === id);
    if (item) setLastRedemption(item);
    wx.navigateTo({ url: `/pages/record-detail/record-detail?id=${id}` });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
