import { api } from "../../utils/api";
import { ensureSession, getStoredUser } from "../../utils/auth";
import { setLastGifts } from "../../utils/cache";
import {
  formatDateOnly,
  formatPoints,
  LEDGER_TYPE_LABELS,
  LEVEL_CARD_BG_IMAGES,
  mapGiftRow,
  resolveImageUrl,
} from "../../utils/format";
import type { GiftRow } from "../../utils/format";
import { buildSkinView, type SkinView } from "../../utils/skin";
import type { PointLedgerItem } from "../../utils/types";
import { getNavigationBarHeight, getStatusBarHeight } from "../../utils/ui";

const SKIN_MP_APPID = "wxb52753aa11ed6654";
const EXPIRING_CACHE_TTL = 5 * 60 * 1000;

interface ExpiringRow {
  id: string;
  title: string;
  points: number;
  pointsText: string;
  expiresAt: string;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    /** 自定义导航栏状态栏高度（px），onLoad 时由全局缓存填充 */
    statusBarHeight: 20,
    navigationBarHeight: 44,
    availableText: "0",
    nickname: "微信用户",
    avatar: "",
    levelName: "",
    memberId: "",
    cardBg: "",
    hotGifts: [] as GiftRow[],
    expiring: [] as ExpiringRow[],
    skinUsage: null as SkinView | null,
    skinUsageLoading: false,
    skinUsageError: false,
    error: "",
  },

  requestVersion: 0,
  skinRequestVersion: 0,
  expiringLoading: false,
  expiringPending: null as { items: PointLedgerItem[]; version: number } | null,
  expiringCacheKey: "",
  expiringLoadedAt: 0,

  onLoad() {
    this.setData({
      statusBarHeight: getStatusBarHeight(),
      navigationBarHeight: getNavigationBarHeight(),
    });
  },

  onShow() {
    void this.load();
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    try {
      await this.load();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async load() {
    const version = ++this.requestVersion;
    const loggedIn = await ensureSession();
    if (version !== this.requestVersion) return;
    if (!loggedIn) {
      this.skinRequestVersion += 1;
      this.expiringPending = null;
      this.expiringCacheKey = "";
      this.expiringLoadedAt = 0;
      this.setData({
        loading: false,
        loggedIn: false,
        error: "",
        hotGifts: [],
        expiring: [],
        skinUsage: null,
        skinUsageLoading: false,
        skinUsageError: false,
      });
      return;
    }
    this.setData({ loading: true, error: "", skinUsageLoading: true, skinUsageError: false });
    void this.loadSkinUsage();
    try {
      const [data, giftsData, membershipData, userinfoData] = await Promise.all([
        api.points(),
        api.gifts().catch(() => null),
        api.membership().catch(() => null),
        api.userinfo().catch(() => null),
      ]);
      if (version !== this.requestVersion) return;

      let hotGifts: GiftRow[] = [];
      if (giftsData) {
        setLastGifts(giftsData.gifts);
        hotGifts = giftsData.gifts.slice(0, 3).map(mapGiftRow);
      }

      const storedUser = getStoredUser();
      const avatar = userinfoData?.avatar || storedUser?.avatar || "";
      this.setData({
        loading: false,
        loggedIn: true,
        availableText: formatPoints(data.available),
        nickname: userinfoData?.nickname || storedUser?.nickname || "微信用户",
        avatar: avatar ? resolveImageUrl(avatar) : "",
        levelName: membershipData?.currentLevel.name ?? "",
        memberId: membershipData?.memberId ?? "",
        cardBg: membershipData
          ? resolveImageUrl(LEVEL_CARD_BG_IMAGES[membershipData.membershipLevel] ?? "")
          : "",
        hotGifts,
      });
      void this.loadExpiring(data.recent, version);
    } catch (e) {
      if (version !== this.requestVersion) return;
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        this.skinRequestVersion += 1;
        this.expiringPending = null;
        this.expiringCacheKey = "";
        this.expiringLoadedAt = 0;
        this.setData({
          loading: false,
          loggedIn: false,
          hotGifts: [],
          expiring: [],
          skinUsage: null,
          skinUsageLoading: false,
          skinUsageError: false,
        });
        return;
      }
      this.setData({ loading: false, error: err.message || "积分加载失败" });
    }
  },

  async loadSkinUsage() {
    const version = ++this.skinRequestVersion;
    this.setData({ skinUsageLoading: true, skinUsageError: false });
    try {
      const data = await api.skinTestUsage();
      if (version !== this.skinRequestVersion) return;
      const usage = buildSkinView(data.usage);
      this.setData({
        skinUsage: usage,
        skinUsageLoading: false,
        skinUsageError: !usage,
      });
    } catch {
      if (version !== this.skinRequestVersion) return;
      this.setData({ skinUsage: null, skinUsageLoading: false, skinUsageError: true });
    }
  },

  reloadSkinUsage() {
    if (this.data.loggedIn) void this.loadSkinUsage();
  },

  /**
   * 收集 30 天内即将过期积分。流水未变化时缓存 5 分钟，避免每次返回首页都翻页扫描。
   */
  async loadExpiring(recent: PointLedgerItem[], version: number): Promise<void> {
    if (version !== this.requestVersion) return;
    const cacheKey = recent.length > 0 ? `${recent[0].id}:${recent.length}` : "empty";
    if (
      cacheKey === this.expiringCacheKey &&
      Date.now() - this.expiringLoadedAt < EXPIRING_CACHE_TTL
    ) return;
    if (this.expiringLoading) {
      this.expiringPending = { items: recent, version };
      return;
    }
    this.expiringLoading = true;
    try {
      if (recent.length < 20) {
        if (version !== this.requestVersion) return;
        this.setData({ expiring: this.filterExpiring(recent) });
        this.expiringCacheKey = cacheKey;
        this.expiringLoadedAt = Date.now();
        return;
      }
      const items: PointLedgerItem[] = [];
      const cutoff = Date.now() - 190 * 24 * 60 * 60 * 1000;
      let offset = 0;
      for (let page = 0; page < 50; page++) {
        const data = await api.pointsLedger(offset);
        if (version !== this.requestVersion) return;
        items.push(...data.items);
        const oldest = data.items[data.items.length - 1];
        if (!data.hasMore || !oldest || new Date(oldest.createdAt).getTime() < cutoff) break;
        offset += data.items.length;
      }
      if (version !== this.requestVersion) return;
      this.setData({ expiring: this.filterExpiring(items) });
      this.expiringCacheKey = cacheKey;
      this.expiringLoadedAt = Date.now();
    } catch {
      if (version === this.requestVersion) {
        this.setData({ expiring: this.filterExpiring(recent) });
      }
    } finally {
      this.expiringLoading = false;
      const pending = this.expiringPending;
      this.expiringPending = null;
      if (pending) void this.loadExpiring(pending.items, pending.version);
    }
  },

  filterExpiring(items: PointLedgerItem[]): ExpiringRow[] {
    const now = Date.now();
    const deadline = now + 30 * 24 * 60 * 60 * 1000;
    return items
      .filter((r) => {
        if (!r.expiresAt || !r.remaining || r.remaining <= 0 || r.amount <= 0) return false;
        const t = new Date(r.expiresAt).getTime();
        return !isNaN(t) && t > now && t <= deadline;
      })
      .map((r) => {
        const points = r.remaining ?? 0;
        return {
          id: r.id,
          title: LEDGER_TYPE_LABELS[r.type] ?? r.type,
          points,
          pointsText: formatPoints(points),
          expiresAt: formatDateOnly(r.expiresAt),
        };
      });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
  },

  goVip() {
    wx.navigateTo({ url: "/pages/vip/vip" });
  },

  /** 等级提升：进入消费补录，提交未计入的官方渠道订单 */
  goSpentAdjust() {
    wx.navigateTo({ url: "/pages/spent-adjustments/spent-adjustments" });
  },

  goSkinTest() {
    wx.navigateToMiniProgram({
      appId: SKIN_MP_APPID,
      fail: () => {
        wx.showToast({ title: "打开失败，请在微信中搜索「肌智派」", icon: "none" });
      },
    });
  },

  openGift(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/gift-detail/gift-detail?id=${id}` });
  },

  onShareAppMessage() {
    return { title: "NIHPLOD 积分礼遇，好礼免费兑", path: "/pages/home/home" };
  },

  onShareTimeline() {
    return { title: "NIHPLOD 积分礼遇，好礼免费兑" };
  },
});
