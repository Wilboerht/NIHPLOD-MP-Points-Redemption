import { api } from "../../utils/api";
import { ensureSession, getStoredUser, logout } from "../../utils/auth";
import { formatPoints } from "../../utils/format";

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
    const user = getStoredUser();
    this.setData({
      loggedIn: true,
      nickname: user?.nickname || "微信用户",
      phoneMasked: user?.phone ? maskPhone(user.phone) : "",
      avatar: user?.avatar ?? "",
      availableText: "",
    });
    try {
      const data = await api.points();
      this.setData({ availableText: formatPoints(data.available) });
    } catch {
      // 余额加载失败不阻塞本页
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

  goRecords() {
    wx.switchTab({ url: "/pages/records/records" });
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
