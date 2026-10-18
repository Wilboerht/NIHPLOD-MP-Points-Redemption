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
  },

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
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, rows: [], hasMore: false });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.redemptions(0);
      this.setData({
        loading: false,
        loggedIn: true,
        rows: this.mapRows(data.redemptions),
        hasMore: data.hasMore,
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "记录加载失败" });
    }
  },

  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    try {
      const data = await api.redemptions(this.data.rows.length);
      this.setData({
        loadingMore: false,
        rows: [...this.data.rows, ...this.mapRows(data.redemptions)],
        hasMore: data.hasMore,
      });
    } catch {
      this.setData({ loadingMore: false });
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
