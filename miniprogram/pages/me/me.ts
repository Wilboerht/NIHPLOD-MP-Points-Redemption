import { api } from "../../utils/api";
import { ensureSession, getStoredUser, updateStoredUser } from "../../utils/auth";
import {
  formatPoints,
  LEVEL_CARD_BG_IMAGES,
  maskPhone,
  resolveImageUrl,
} from "../../utils/format";
import { getStatusBarHeight } from "../../utils/ui";

/**
 * 小程序 ICP 备案号：备案通过后填入正式号码（如 "沪ICP备XXXXXXXX号-X"）。
 * 留空时页脚不展示备案行；小程序备案号与官网主体备案号后缀不同，
 * 以微信公众平台「小程序备案」查询结果为准。
 */
const ICP_BEIAN = "";

Page({
  data: {
    loggedIn: false,
    /** 首屏会话检查中（避免已登录用户闪现"未登录"卡片） */
    loading: true,
    /** 自定义导航栏状态栏高度（px） */
    statusBarHeight: 20,
    nickname: "微信用户",
    phoneMasked: "",
    avatar: "",
    availableText: "--",
    /** 个人资料卡背景样式（会员等级卡面 + 白色薄纱层） */
    cardStyle: "",
    /** 页脚：版权年份与 ICP 备案号（备案通过后替换 ICP_BEIAN） */
    year: new Date().getFullYear(),
    filingText: ICP_BEIAN,
  },

  onLoad() {
    // 页面为自定义导航栏（navigationStyle: custom），状态栏高度取全局缓存
    this.setData({ statusBarHeight: getStatusBarHeight() });
  },

  onShow() {
    void this.load();
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loggedIn: false, loading: false });
      return;
    }
    // 先用本地缓存的用户信息渲染，再用 userinfo 拉取最新资料覆盖
    // （官网侧修改头像/昵称后，登录时缓存的副本不会自动更新）
    const user = getStoredUser();
    this.setData({
      loggedIn: true,
      loading: false,
      nickname: user?.nickname || "微信用户",
      phoneMasked: user?.phone ? maskPhone(user.phone) : "",
      // 官网存储的 avatar 可能是相对路径（本地存储模式），补全为绝对地址
      avatar: user?.avatar ? resolveImageUrl(user.avatar) : "",
    });

    const [points, info, membership] = await Promise.all([
      api.points().catch(() => null),
      api.userinfo().catch(() => null),
      // 会员等级为增强模块：失败时资料卡使用纯色背景
      api.membership().catch(() => null),
    ]);
    if (points) {
      this.setData({ availableText: formatPoints(points.available) });
    }
    if (membership) {
      const bg = resolveImageUrl(LEVEL_CARD_BG_IMAGES[membership.membershipLevel] ?? "");
      this.setData({
        // 浅色卡面上叠加白色薄纱层，保证深色文字可读（与首页会员卡一致）
        cardStyle: bg
          ? `background-image: linear-gradient(rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.22)), url("${bg}");`
          : "",
      });
    }
    if (info) {
      // userinfo.avatar 为绝对地址（官网 resolveSsoAvatar 保证），无需再补全
      const avatar = info.avatar ? resolveImageUrl(info.avatar) : "";
      this.setData({
        nickname: info.nickname || user?.nickname || "微信用户",
        avatar,
      });
      const patch = {
        ...(info.nickname ? { nickname: info.nickname } : {}),
        ...(info.avatar ? { avatar: info.avatar } : {}),
      };
      if (Object.keys(patch).length > 0) updateStoredUser(patch);
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goAddresses() {
    wx.navigateTo({ url: "/pages/addresses/addresses" });
  },

  goProfileEdit() {
    wx.navigateTo({ url: "/pages/profile-edit/profile-edit" });
  },

  goVip() {
    wx.navigateTo({ url: "/pages/vip/vip" });
  },

  goSpentAdjust() {
    wx.navigateTo({ url: "/pages/spent-adjustments/spent-adjustments" });
  },

  goRecords() {
    wx.navigateTo({ url: "/pages/records/records" });
  },

  goLedger() {
    wx.navigateTo({ url: "/pages/points-ledger/points-ledger" });
  },

  goPrivacy() {
    wx.navigateTo({ url: "/pages/legal/legal?type=privacy" });
  },

  goFollowUs() {
    wx.navigateTo({ url: "/pages/follow-us/follow-us" });
  },

  goSecurityCenter() {
    wx.navigateTo({ url: "/pages/security-center/security-center" });
  },

  goTerms() {
    wx.navigateTo({ url: "/pages/legal/legal?type=terms" });
  },

  /** 打开积分规则抽屉（组件 components/rules-sheet） */
  openRules() {
    const sheet = this.selectComponent("#rules-sheet") as unknown as {
      show: () => void;
    } | null;
    sheet?.show();
  },
});
