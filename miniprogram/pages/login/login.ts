import {
  bindAndLogin,
  getPendingBindToken,
  hasSession,
  isLoggedOut,
  isStaleBindTokenError,
  login,
  sendBindSmsCode,
  setPendingBindToken,
} from "../../utils/auth";

Page({
  data: {
    phase: "loading" as "loading" | "ready" | "error",
    bindToken: "",
    phone: "",
    code: "",
    counting: 0,
    busy: false,
    error: "",
  },

  timer: 0,

  onLoad() {
    void this.init();
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  async init() {
    if (hasSession()) {
      this.done();
      return;
    }
    // 主动退出后：不自动静默登录，直接展示登录页（一键登录按钮 + 短信兜底仅在本微信号需要绑定时出现）
    if (isLoggedOut()) {
      this.setData({ phase: "ready", bindToken: "", error: "" });
      return;
    }
    await this.silentLogin();
  },

  /** 静默登录：已绑定直接登录成功；未绑定进入登录页（携带 bindToken，展示短信兜底） */
  async silentLogin() {
    let token = getPendingBindToken();
    if (!token) {
      const outcome = await login();
      if (outcome.kind === "ok") {
        this.done();
        return;
      }
      if (outcome.kind === "need-binding") {
        token = outcome.bindToken;
      } else {
        this.setData({ phase: "error", error: outcome.message });
        return;
      }
    }
    setPendingBindToken(token);
    this.setData({ phase: "ready", bindToken: token, error: "" });
  },

  /** 失败重试：重新初始化（退出态回到登录页，其余状态重试静默登录） */
  retry() {
    this.setData({ phase: "loading", error: "" });
    void this.init();
  },

  done() {
    wx.showToast({ title: "登录成功", icon: "success" });
    setTimeout(() => {
      this.leave();
    }, 600);
  },

  /** 有来源页（「去登录」引导进入）时原路返回，由来源页 onShow 刷新；否则回首页 tab */
  leave() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: "/pages/home/home" });
  },

  async onGetPhoneNumber(e: WechatMiniprogram.CustomEvent<{ code?: string }>) {
    const code = e.detail.code;
    if (!code) {
      this.setData({
        error: this.data.bindToken
          ? "未授权手机号，可使用下方短信验证码绑定"
          : "未授权手机号，请重试",
      });
      return;
    }
    this.setData({ busy: true, error: "" });
    // 微信原生一键登录：已绑定账户直接登录；新用户一步完成「创建官网账户 + 绑定手机号」
    const outcome = await login(code);
    if (outcome.kind === "ok") {
      this.setData({ busy: false });
      this.done();
      return;
    }
    if (outcome.kind === "need-binding") {
      this.setData({ busy: false, error: "绑定未完成，请重试或使用短信验证码" });
      return;
    }
    // 该微信已绑定其它真实账户（如微信侧换号）：手机号通道不可改绑，退回微信静默登录
    if (outcome.code === "WECHAT_ALREADY_BOUND") {
      const fallback = await login();
      this.setData({ busy: false });
      if (fallback.kind === "ok") {
        this.done();
        return;
      }
      this.setData({ error: outcome.message });
      return;
    }
    this.setData({ busy: false, error: outcome.message });
  },

  onPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ phone: e.detail.value, error: "" });
  },

  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ code: e.detail.value, error: "" });
  },

  async sendCode() {
    const phone = this.data.phone.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      this.setData({ error: "请输入正确的手机号" });
      return;
    }
    if (this.data.counting > 0) return;

    const result = await sendBindSmsCode(phone, this.data.bindToken);
    if (!result.ok) {
      this.setData({ error: result.message ?? "验证码发送失败" });
      return;
    }
    wx.showToast({ title: "验证码已发送", icon: "none" });
    this.setData({ counting: 60, error: "" });
    this.timer = setInterval(() => {
      const next = this.data.counting - 1;
      this.setData({ counting: Math.max(0, next) });
      if (next <= 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
      }
    }, 1000);
  },

  async submitSms() {
    const phone = this.data.phone.trim();
    const code = this.data.code.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      this.setData({ error: "请输入正确的手机号" });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      this.setData({ error: "请输入 6 位验证码" });
      return;
    }
    this.setData({ busy: true, error: "" });
    // 短信通道：bind 完成绑定后重新静默登录换取 OAuth 双 Token（bind 返回的会话 token 不适用）
    const outcome = await bindAndLogin(this.data.bindToken, { phone, code });
    this.setData({ busy: false });
    if (outcome.kind === "ok") {
      this.done();
      return;
    }
    if (outcome.kind === "bound-login-failed") {
      // bindToken 已被服务端消费：清空暂存后按普通登录流程重试（重试「绑定」必失败）
      setPendingBindToken("");
      this.setData({ bindToken: "", error: "" });
      wx.showToast({ title: "绑定已完成，正在登录", icon: "none" });
      void this.init();
      return;
    }
    if (isStaleBindTokenError(outcome.code)) {
      // bindToken 过期/已失效：清空后重新静默登录换取新令牌，再让用户重新获取验证码
      setPendingBindToken("");
      this.setData({
        bindToken: "",
        error: "绑定会话已失效，已自动刷新，请重新获取验证码",
      });
      void this.init();
      return;
    }
    this.setData({ error: outcome.message });
  },

  skip() {
    this.leave();
  },
});
