import { api } from "../../utils/api";
import { ensureSession, getStoredUser, logout, updateStoredUser } from "../../utils/auth";
import { formatPoints, resolveImageUrl } from "../../utils/format";

function maskPhone(phone: string): string {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;
}

Page({
  data: {
    loggedIn: false,
    nickname: "微信用户",
    phoneMasked: "",
    avatar: "",
    availableText: "",
  },

  onShow() {
    void this.load();
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loggedIn: false });
      return;
    }
    // 先用本地缓存的用户信息渲染，再用 userinfo 拉取最新资料覆盖
    // （官网侧修改头像/昵称后，登录时缓存的副本不会自动更新）
    const user = getStoredUser();
    this.setData({
      loggedIn: true,
      nickname: user?.nickname || "微信用户",
      phoneMasked: user?.phone ? maskPhone(user.phone) : "",
      // 官网存储的 avatar 可能是相对路径（本地存储模式），补全为绝对地址
      avatar: user?.avatar ? resolveImageUrl(user.avatar) : "",
      availableText: "",
    });

    const [points, info] = await Promise.all([
      api.points().catch(() => null),
      api.userinfo().catch(() => null),
    ]);
    if (points) {
      this.setData({ availableText: formatPoints(points.available) });
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

  goAccountDeletion() {
    wx.navigateTo({ url: "/pages/account-deletion/account-deletion" });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "确定退出当前账号吗？退出后需重新登录",
      confirmColor: "#c25450",
      success: async (res) => {
        if (!res.confirm) return;
        await logout();
        wx.showToast({ title: "已退出", icon: "success" });
        setTimeout(() => wx.reLaunch({ url: "/pages/home/home" }), 500);
      },
    });
  },
});
