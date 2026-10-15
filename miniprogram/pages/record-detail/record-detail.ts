import { api, ApiError } from "../../utils/api";
import { getLastRedemption } from "../../utils/cache";
import { formatDateTime, formatPoints, REDEMPTION_STATUS_LABELS } from "../../utils/format";
import type { RedemptionItem, TrackingData, TrackingRoute } from "../../utils/types";

type ItemView = RedemptionItem & { statusText: string; dateText: string; pointsText: string };

Page({
  data: {
    loading: true,
    item: null as ItemView | null,
    tracking: null as (TrackingData & { rows: TrackingRoute[] }) | null,
    trackingLoading: false,
    trackingMessage: "",
    error: "",
  },

  redemptionId: "",

  async onLoad(query: Record<string, string | undefined>) {
    this.redemptionId = query.id ?? "";
    const cached = getLastRedemption();
    if (cached && cached.id === this.redemptionId) {
      this.setData({ loading: false, item: this.decorate(cached) });
    } else {
      await this.loadFromList();
    }
    void this.loadTracking();
  },

  decorate(item: RedemptionItem): ItemView {
    return {
      ...item,
      statusText: REDEMPTION_STATUS_LABELS[item.status] ?? item.status,
      dateText: formatDateTime(item.createdAt),
      pointsText: `-${formatPoints(item.points)} 积分`,
    };
  },

  async loadFromList() {
    try {
      const data = await api.redemptions(0);
      const item = data.redemptions.find((r) => r.id === this.redemptionId);
      if (!item) {
        this.setData({ loading: false, error: "兑换记录不存在" });
        return;
      }
      this.setData({ loading: false, item: this.decorate(item) });
    } catch (e) {
      this.setData({ loading: false, error: (e as ApiError).message || "加载失败" });
    }
  },

  async loadTracking() {
    if (!this.redemptionId) return;
    this.setData({ trackingLoading: true, trackingMessage: "" });
    try {
      const data = await api.tracking(this.redemptionId);
      const rows = (data.routes ?? []).slice().reverse();
      this.setData({
        trackingLoading: false,
        tracking: { ...data, rows },
        trackingMessage: data.supported
          ? data.error ?? ""
          : "物流查询暂不可用，可凭运单号在顺丰官网查询",
      });
    } catch (e) {
      const err = e as ApiError;
      this.setData({
        trackingLoading: false,
        tracking: null,
        trackingMessage:
          err.code === "NO_WAYBILL" ? "商家尚未录入运单号，发货后可查看物流" : err.message,
      });
    }
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
