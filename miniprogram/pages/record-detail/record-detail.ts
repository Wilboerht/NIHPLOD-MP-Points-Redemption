import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { getLastRedemption } from "../../utils/cache";
import {
  formatDateTime,
  formatPoints,
  REDEMPTION_STATUS_LABELS,
  resolveImageUrl,
} from "../../utils/format";
import type { RedemptionItem, TrackingData, TrackingRoute } from "../../utils/types";

interface ItemView extends RedemptionItem {
  statusText: string;
  statusHint: string;
  dateText: string;
  pointsText: string;
  imageUrl: string | null;
}

const STATUS_HINTS: Record<string, string> = {
  PENDING: "商家正在备货，发货后可查看物流",
  FULFILLED: "商品已发货，物流动态见下方",
  CANCELLED: "兑换已取消，扣减积分已原路退回",
};

/** 轨迹行：字段可能重复（同一时刻多条），预生成稳定 key 供 wx:for 使用 */
interface TrackingRow extends TrackingRoute {
  key: string;
}

Page({
  data: {
    loading: true,
    needLogin: false,
    item: null as ItemView | null,
    tracking: null as (TrackingData & { rows: TrackingRow[] }) | null,
    trackingLoading: false,
    trackingMessage: "",
    error: "",
  },

  redemptionId: "",
  requestVersion: 0,

  onLoad(query: Record<string, string | undefined>) {
    this.redemptionId = query.id ?? "";
    void this.load();
  },

  onShow() {
    if (this.data.needLogin && !this.data.loading) void this.load();
  },

  async load() {
    const version = ++this.requestVersion;
    this.setData({ loading: true, needLogin: false, error: "" });
    if (!this.redemptionId) {
      this.setData({ loading: false, error: "兑换记录参数缺失" });
      return;
    }

    const loggedIn = await ensureSession();
    if (version !== this.requestVersion) return;
    if (!loggedIn) {
      this.showLogin();
      return;
    }

    const cached = getLastRedemption();
    if (cached && cached.id === this.redemptionId) {
      this.setData({ loading: false, item: this.decorate(cached) });
      void this.loadTracking();
      return;
    }
    if (await this.loadFromList(version)) void this.loadTracking();
  },

  showLogin() {
    this.setData({
      loading: false,
      needLogin: true,
      item: null,
      tracking: null,
      trackingLoading: false,
      trackingMessage: "",
      error: "",
    });
  },

  decorate(item: RedemptionItem): ItemView {
    return {
      ...item,
      statusText: REDEMPTION_STATUS_LABELS[item.status] ?? item.status,
      statusHint: STATUS_HINTS[item.status] ?? "",
      dateText: formatDateTime(item.createdAt),
      pointsText: `-${formatPoints(item.points)} 积分`,
      imageUrl: item.image ? resolveImageUrl(item.image) : null,
    };
  },

  async loadFromList(version: number): Promise<boolean> {
    try {
      let offset = 0;
      while (version === this.requestVersion) {
        const data = await api.redemptions(offset);
        if (version !== this.requestVersion) return false;
        const item = data.redemptions.find((r) => r.id === this.redemptionId);
        if (item) {
          this.setData({ loading: false, item: this.decorate(item) });
          return true;
        }
        if (!data.hasMore || data.redemptions.length === 0) break;
        offset += data.redemptions.length;
      }
      if (version !== this.requestVersion) return false;
      this.setData({ loading: false, error: "兑换记录不存在" });
      return false;
    } catch (e) {
      if (version !== this.requestVersion) return false;
      const err = e as ApiError;
      if (err.status === 401) {
        this.showLogin();
        return false;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
      return false;
    }
  },

  async loadTracking() {
    if (!this.redemptionId) return;
    const version = this.requestVersion;
    this.setData({ trackingLoading: true, trackingMessage: "" });
    try {
      const data = await api.tracking(this.redemptionId);
      if (version !== this.requestVersion) return;
      const rows: TrackingRow[] = (data.routes ?? [])
        .slice()
        .reverse()
        .map((route, index) => ({ ...route, key: `${index}` }));
      this.setData({
        trackingLoading: false,
        tracking: { ...data, rows },
        trackingMessage: data.supported
          ? data.error ?? ""
          : "物流查询暂不可用，可凭运单号在顺丰官网查询",
      });
    } catch (e) {
      if (version !== this.requestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      this.setData({
        trackingLoading: false,
        tracking: null,
        trackingMessage:
          err.code === "NO_WAYBILL" ? "商家尚未录入运单号，发货后可查看物流" : err.message,
      });
    }
  },

  retry() {
    void this.load();
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  copyWaybill() {
    const waybill = this.data.tracking?.waybillNo || this.data.item?.waybillNo;
    if (!waybill) return;
    wx.setClipboardData({
      data: waybill,
      success: () => wx.showToast({ title: "运单号已复制", icon: "none" }),
    });
  },
});
