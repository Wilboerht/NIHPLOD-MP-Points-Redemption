import {
  bindAndLogin,
  getPendingBindToken,
  hasSession,
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
    this.setData({ phase: "ready", bindToken: token });
  },

  done() {
    wx.showToast({ title: "登录成功", icon: "success" });
    setTimeout(() => {
      wx.switchTab({ url: "/pages/home/home" });
    }, 600);
  },

  async onGetPhoneNumber(e: WechatMiniprogram.CustomEvent<{ code?: string }>) {
    const code = e.detail.code;
    if (!code) {
      this.setData({ error: "未授权手机号，可使用下方短信验证码绑定" });
      return;
    }
    this.setData({ busy: true, error: "" });
    // 一键登录直接走 miniprogram-login（一步完成绑定，直接签发 OAuth 双 Token）
    const outcome = await login(code);
    this.setData({ busy: false });
    if (outcome.kind === "ok") {
      this.done();
    } else if (outcome.kind === "need-binding") {
      this.setData({ error: "绑定未完成，请重试或使用短信验证码" });
    } else {
      this.setData({ error: outcome.message });
    }
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
    } else {
      this.setData({ error: outcome.message });
    }
  },

  skip() {
    wx.switchTab({ url: "/pages/home/home" });
  },
});
