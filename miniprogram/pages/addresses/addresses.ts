import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import type { AddressItem } from "../../utils/types";

Page({
  data: {
    loading: true,
    loggedIn: false,
    addresses: [] as AddressItem[],
    error: "",
  },

  requestVersion: 0,

  onShow() {
    void this.load();
  },

  async load() {
    const version = ++this.requestVersion;
    const loggedIn = await ensureSession();
    if (version !== this.requestVersion) return;
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, addresses: [] });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.addresses();
      if (version !== this.requestVersion) return;
      this.setData({ loading: false, loggedIn: true, addresses: data.addresses });
    } catch (e) {
      if (version !== this.requestVersion) return;
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false, addresses: [] });
        return;
      }
      this.setData({ loading: false, error: err.message || "地址加载失败" });
    }
  },

  add() {
    wx.navigateTo({ url: "/pages/address-edit/address-edit" });
  },

  edit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/address-edit/address-edit?id=${id}` });
  },

  remove(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: "删除地址",
      content: "确定删除该收货地址吗？",
      confirmColor: "#c25450",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteAddress(id);
          wx.showToast({ title: "已删除", icon: "success" });
          void this.load();
        } catch (err) {
          wx.showToast({ title: (err as Error).message || "删除失败", icon: "none" });
        }
      },
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
