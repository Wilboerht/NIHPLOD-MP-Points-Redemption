import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatDateTime } from "../../utils/format";
import type { DeletionRequestInfo } from "../../utils/types";

/** 客服邮箱（与官网注销引导文案一致） */
const SERVICE_EMAIL = "service@nihplod.cn";

interface DeletionView extends DeletionRequestInfo {
  scheduledText: string;
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    submitting: false,
    /** 进行中的注销申请（冷静期），无则 null */
    request: null as DeletionView | null,
    warnings: [] as string[],
    reason: "",
    confirmed: false,
    error: "",
    email: SERVICE_EMAIL,
  },

  /** 登录引导是否已触发（用户跳过登录返回时不再反复跳转） */
  loginPrompted: false,
  checking: false,

  onLoad() {
    void this.check();
  },

  onShow() {
    // 从登录页返回后重试会话检查（首次进入由 onLoad 触发）
    void this.check();
  },

  async check() {
    if (this.checking) return;
    this.checking = true;
    try {
      const loggedIn = await ensureSession();
      if (!loggedIn) {
        this.setData({ loading: false, loggedIn: false });
        if (!this.loginPrompted) {
          this.loginPrompted = true;
          wx.navigateTo({ url: "/pages/login/login" });
        }
        return;
      }
      await this.load();
    } finally {
      this.checking = false;
    }
  },

  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const data = await api.deletionStatus();
      this.setData({
        loading: false,
        loggedIn: true,
        request: data.request ? this.decorate(data.request) : null,
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false });
        return;
      }
      this.setData({ loading: false, loggedIn: true, error: err.message || "加载失败" });
    }
  },

  decorate(request: DeletionRequestInfo): DeletionView {
    return { ...request, scheduledText: formatDateTime(request.scheduledAt) };
  },

  onReasonInput(e: WechatMiniprogram.Input) {
    this.setData({ reason: e.detail.value, error: "" });
  },

  onConfirmChange(e: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({ confirmed: e.detail.value.length > 0 });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.confirmed) {
      wx.showToast({ title: "请先勾选确认", icon: "none" });
      return;
    }
    wx.showModal({
      title: "确认申请注销",
      content: "冷静期内可随时撤回；生效后账号不可恢复，确定继续吗？",
      confirmText: "继续申请",
      confirmColor: "#c25450",
      success: (res) => {
        if (res.confirm) void this.doSubmit();
      },
    });
  },

  async doSubmit() {
    this.setData({ submitting: true, error: "" });
    try {
      const reason = this.data.reason.trim();
      const data = await api.requestDeletion(reason ? { reason } : {});
      this.setData({
        submitting: false,
        request: this.decorate(data.request),
        warnings: data.warnings ?? [],
        confirmed: false,
        reason: "",
      });
      wx.showToast({ title: "已提交注销申请", icon: "success" });
    } catch (e) {
      this.setData({ submitting: false });
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loggedIn: false });
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ error: err.message || "提交失败，请稍后重试" });
    }
  },

  withdraw() {
    if (this.data.submitting) return;
    wx.showModal({
      title: "撤回注销申请",
      content: "撤回后账号恢复正常使用，确定撤回吗？",
      success: (res) => {
        if (res.confirm) void this.doWithdraw();
      },
    });
  },

  async doWithdraw() {
    this.setData({ submitting: true, error: "" });
    try {
      await api.cancelDeletion();
      this.setData({ submitting: false, warnings: [] });
      wx.showToast({ title: "已撤回注销申请", icon: "success" });
      await this.load();
    } catch (e) {
      this.setData({ submitting: false });
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loggedIn: false });
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ error: err.message || "撤回失败，请稍后重试" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  copyEmail() {
    wx.setClipboardData({
      data: SERVICE_EMAIL,
      success: () => wx.showToast({ title: "邮箱已复制", icon: "none" }),
    });
  },
});
