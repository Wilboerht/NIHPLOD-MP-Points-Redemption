import { api } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { setLastGifts } from "../../utils/cache";
import { formatDateOnly, formatPoints, LEDGER_TYPE_LABELS, resolveImageUrl } from "../../utils/format";
import type { PointLedgerItem } from "../../utils/types";

interface LedgerRow extends PointLedgerItem {
  typeLabel: string;
  dateText: string;
  amountText: string;
}

interface ExpiringRow {
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
    availableText: "0",
    levelName: "",
    nextLevelTip: "",
    hotGifts: [] as HotGift[],
    recent: [] as LedgerRow[],
    expiring: [] as ExpiringRow[],
    error: "",
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

      const now = Date.now();
      const deadline = now + 30 * 24 * 60 * 60 * 1000;
      const expiring: ExpiringRow[] = data.recent
        .filter((r) => {
          if (!r.expiresAt || !r.remaining || r.remaining <= 0 || r.amount <= 0) return false;
          const t = new Date(r.expiresAt).getTime();
          return !isNaN(t) && t > now && t <= deadline;
        })
        .map((r) => ({
          title: LEDGER_TYPE_LABELS[r.type] ?? r.type,
          points: r.remaining ?? 0,
          expiresAt: formatDateOnly(r.expiresAt),
        }));

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
