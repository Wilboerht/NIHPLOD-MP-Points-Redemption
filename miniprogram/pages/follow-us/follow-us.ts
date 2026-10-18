import { resolveImageUrl } from "../../utils/format";

/** 官方微信公众号名称（复制后可直接在微信搜索） */
const WECHAT_ACCOUNT = "NIHPLOD";

Page({
  data: {
    accountName: WECHAT_ACCOUNT,
    /** 官网底部展示的官方微信公众号二维码 */
    qrUrl: resolveImageUrl("/images/wechat-qrcode.jpg"),
    qrFailed: false,
  },

  copyAccount() {
    wx.setClipboardData({
      data: WECHAT_ACCOUNT,
      success: () => {
        wx.showToast({ title: "已复制，请前往微信搜索", icon: "none" });
      },
    });
  },

  onQrError() {
    this.setData({ qrFailed: true });
  },

  onShareAppMessage() {
    return { title: "关注 NIHPLOD 官方微信公众号", path: "/pages/follow-us/follow-us" };
  },
});
