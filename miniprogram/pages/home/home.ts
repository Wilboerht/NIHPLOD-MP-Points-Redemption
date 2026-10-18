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
import { getStatusBarHeight } from "../../utils/ui";

const SKIN_MP_APPID = "wxb52753aa11ed6654";


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
    availableText: "0",
    nickname: "微信用户",
    avatar: "",
    levelName: "",
    memberId: "",
    cardBg: "",
    hotGifts: [] as GiftRow[],
    expiring: [] as ExpiringRow[],
    skinUsage: null as SkinView | null,
    error: "",
  },

  /** 即将过期积分扫描中的防重入标记（不参与渲染） */
  expiringLoading: false,
  /** 扫描期间又触发了刷新：记录最新 recent，当前扫描结束后补扫一次 */
  expiringPending: null as PointLedgerItem[] | null,

  onLoad() {
    // 首页为自定义导航栏（navigationStyle: custom），状态栏高度取全局缓存
    this.setData({ statusBarHeight: getStatusBarHeight() });
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
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, error: "", skinUsage: null });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const [data, giftsData, membershipData, userinfoData] = await Promise.all([
        api.points(),
        // 精选好礼为增强模块：加载失败不影响积分主体展示
        api.gifts().catch(() => null),
        // 会员等级信息为增强模块：失败时不展示等级条
        api.membership().catch(() => null),
        // 昵称展示为增强模块：失败时回退本地缓存
        api.userinfo().catch(() => null),
      ]);

      // 精选好礼固定展示 3 个；同时写入缓存，详情页可直接复用
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
        // 会员卡背景图（按等级映射官网静态资源）；等级信息加载失败时为空白卡面
        cardBg: membershipData
          ? resolveImageUrl(LEVEL_CARD_BG_IMAGES[membershipData.membershipLevel] ?? "")
          : "",
        hotGifts,
      });
      // 即将过期与测肤用量均为增强模块：异步补充，不阻塞首页主体
      void this.loadExpiring(data.recent);
      void this.loadSkinUsage();
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false, skinUsage: null });
        return;
      }
      this.setData({ loading: false, error: err.message || "积分加载失败" });
    }
  },

  async loadSkinUsage() {
    try {
      const data = await api.skinTestUsage();
      this.setData({ skinUsage: buildSkinView(data.usage) });
    } catch {
      this.setData({ skinUsage: null });
    }
  },

  /**
   * 收集 30 天内即将过期积分（含剩余量）。
   * 异步补齐：recent 不足 20 条时即近一年全量；否则翻积分明细页，
   * 直到超出一年窗口或翻完（安全上限 50 页，避免异常数据导致无限请求）。
   */
  async loadExpiring(recent: PointLedgerItem[]): Promise<void> {
    if (this.expiringLoading) {
      // 扫描期间数据可能已变化（如刚完成兑换），记录最新数据，结束后补扫
      this.expiringPending = recent;
      return;
    }
    this.expiringLoading = true;
    try {
      if (recent.length < 20) {
        this.setData({ expiring: this.filterExpiring(recent) });
        return;
      }
      const items: PointLedgerItem[] = [];
      // 积分有效期 6 个月（日历月 181~184 天）：早于 190 天的流水必然已过期，可提前截止
      const cutoff = Date.now() - 190 * 24 * 60 * 60 * 1000;
      let offset = 0;
      for (let page = 0; page < 50; page++) {
        const data = await api.pointsLedger(offset);
        items.push(...data.items);
        const oldest = data.items[data.items.length - 1];
        if (!data.hasMore || !oldest || new Date(oldest.createdAt).getTime() < cutoff) break;
        offset += data.items.length;
      }
      this.setData({ expiring: this.filterExpiring(items) });
    } catch {
      // 明细接口异常时退回 recent（可能遗漏较早记录，不影响主体展示）
      this.setData({ expiring: this.filterExpiring(recent) });
    } finally {
      this.expiringLoading = false;
      const pending = this.expiringPending;
      this.expiringPending = null;
      if (pending) void this.loadExpiring(pending);
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
