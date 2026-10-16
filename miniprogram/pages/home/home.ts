import { api } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { setLastGifts } from "../../utils/cache";
import {
  formatDateOnly,
  formatPoints,
  LEDGER_TYPE_LABELS,
  LEVEL_CARD_BG_IMAGES,
  resolveImageUrl,
} from "../../utils/format";
import type { PointLedgerItem } from "../../utils/types";
import { getStatusBarHeight } from "../../utils/ui";

interface LedgerRow extends PointLedgerItem {
  typeLabel: string;
  dateText: string;
  amountText: string;
}

interface ExpiringRow {
  id: string;
  title: string;
  points: number;
  expiresAt: string;
}

interface HotGift {
  id: string;
  name: string;
  image: string | null;
  costText: string;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    /** 自定义导航栏状态栏高度（px），onLoad 时由全局缓存填充 */
    statusBarHeight: 20,
    availableText: "0",
    levelName: "",
    nextLevelTip: "",
    cardBg: "",
    hotGifts: [] as HotGift[],
    recent: [] as LedgerRow[],
    expiring: [] as ExpiringRow[],
    error: "",
  },

  onLoad() {
    // 首页为自定义导航栏（navigationStyle: custom），状态栏高度取全局缓存
    this.setData({ statusBarHeight: getStatusBarHeight() });
  },

  onShow() {
    void this.load();
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, error: "" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const [data, giftsData, membershipData] = await Promise.all([
        api.points(),
        // 精选好礼为增强模块：加载失败不影响积分主体展示
        api.gifts().catch(() => null),
        // 会员等级信息为增强模块：失败时不展示等级条
        api.membership().catch(() => null),
      ]);
      const recent: LedgerRow[] = data.recent.map((item) => ({
        ...item,
        typeLabel: LEDGER_TYPE_LABELS[item.type] ?? item.type,
        dateText: formatDateOnly(item.createdAt),
        amountText: `${item.amount > 0 ? "+" : ""}${formatPoints(item.amount)}`,
      }));

      const expiring = await this.loadExpiring(data.recent);

      // 精选好礼：取接口排序前 4 个；同时写入缓存，详情页可直接复用
      let hotGifts: HotGift[] = [];
      if (giftsData) {
        setLastGifts(giftsData.gifts);
        hotGifts = giftsData.gifts.slice(0, 4).map((g) => ({
          id: g.id,
          name: g.name,
          image: g.image ? resolveImageUrl(g.image) : null,
          costText: g.cost === null ? "未解锁" : `${formatPoints(g.cost)} 积分`,
        }));
      }

      this.setData({
        loading: false,
        loggedIn: true,
        availableText: formatPoints(data.available),
        levelName: membershipData?.currentLevel.name ?? "",
        // 会员卡背景图（按等级映射官网静态资源）；等级信息加载失败时为空白卡面
        cardBg: membershipData
          ? resolveImageUrl(LEVEL_CARD_BG_IMAGES[membershipData.membershipLevel] ?? "")
          : "",
        nextLevelTip: membershipData
          ? membershipData.nextLevel
            ? `再消费 ¥${formatPoints(membershipData.nextLevel.spentNeeded)} 升级${membershipData.nextLevel.name}`
            : "已达最高等级"
          : "",
        hotGifts,
        recent,
        expiring,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, error: err.message || "积分加载失败" });
    }
  },

  /**
   * 收集 30 天内即将过期积分（含剩余量）。
   * recent 不足 20 条时即近一年全量；否则翻积分明细页补齐（封顶 10 页 200 条）。
   */
  async loadExpiring(recent: PointLedgerItem[]): Promise<ExpiringRow[]> {
    if (recent.length < 20) return this.filterExpiring(recent);
    try {
      const items: PointLedgerItem[] = [];
      // 积分有效期 6 个月（日历月 181~184 天）：早于 190 天的流水必然已过期，可提前截止
      const cutoff = Date.now() - 190 * 24 * 60 * 60 * 1000;
      let offset = 0;
      for (let page = 0; page < 10; page++) {
        const data = await api.pointsLedger(offset);
        items.push(...data.items);
        const oldest = data.items[data.items.length - 1];
        if (!data.hasMore || !oldest || new Date(oldest.createdAt).getTime() < cutoff) break;
        offset += data.items.length;
      }
      return this.filterExpiring(items);
    } catch {
      // 明细接口异常时退回 recent（可能遗漏较早记录，不影响主体展示）
      return this.filterExpiring(recent);
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
      .map((r) => ({
        id: r.id,
        title: LEDGER_TYPE_LABELS[r.type] ?? r.type,
        points: r.remaining ?? 0,
        expiresAt: formatDateOnly(r.expiresAt),
      }));
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goGifts() {
    wx.switchTab({ url: "/pages/gifts/gifts" });
  },

  goLedger() {
    wx.navigateTo({ url: "/pages/points-ledger/points-ledger" });
  },

  goVip() {
    wx.navigateTo({ url: "/pages/vip/vip" });
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
