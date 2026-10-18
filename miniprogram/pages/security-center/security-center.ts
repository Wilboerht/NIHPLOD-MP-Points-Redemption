/**
 * 安全中心（设备管理 / 授权管理 / 账号绑定 / 登录历史 + 账号注销入口）
 *
 * 数据直连官网 OAuth 安全端点（/api/oauth/security/*），与网页端安全中心同源。
 * 安全约束（客户端提示 + 服务端强制）：
 * - 当前设备不可强制下线（服务端按「最近活跃」识别）
 * - 当前小程序自身的授权不可撤销
 * - 当前微信登录身份不可在小程序内解绑（防止失去登录方式）
 */
import { api, ApiError } from "../../utils/api";
import { ensureSession } from "../../utils/auth";
import { formatDateTime } from "../../utils/format";
import type {
  LoginHistoryItem,
  SecurityAuthorizationItem,
  SecurityDeviceItem,
  SecurityIdentityItem,
} from "../../utils/types";

const SEGMENTS = [
  { key: "devices", label: "设备" },
  { key: "authorizations", label: "授权" },
  { key: "bindings", label: "绑定" },
  { key: "history", label: "登录历史" },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]["key"];

const PROVIDER_LABELS: Record<string, string> = {
  wechat_open: "微信（开放平台）",
  wechat_mp: "微信（服务号）",
  wechat_miniprogram: "微信小程序",
  douyin: "抖音",
};

/** 当前小程序登录使用的身份 provider：不允许在小程序内解绑 */
const CURRENT_LOGIN_PROVIDER = "wechat_miniprogram";
/** 当前小程序 OAuth clientId：用于区分积分/测肤两个小程序身份 */
const CURRENT_LOGIN_CLIENT_ID = "wechat-mp-points";

/** 微信小程序身份展示名（同一 provider 下按 clientId 区分来源） */
function identityLabel(item: SecurityIdentityItem): string {
  if (item.provider !== CURRENT_LOGIN_PROVIDER) {
    return PROVIDER_LABELS[item.provider] ?? item.provider;
  }
  if (item.mpClientId === "wechat-mp-points") return "微信小程序（积分商城）";
  if (item.mpClientId === "wechat-mp-skin") return "微信小程序（肌智派）";
  return "微信小程序";
}

const LOGIN_TYPE_LABELS: Record<string, string> = {
  sms: "验证码",
  oauth: "OAuth 授权",
  password: "密码",
  admin: "管理员",
};

interface DeviceView extends SecurityDeviceItem {
  lastActiveText: string;
}

interface AuthorizationView extends SecurityAuthorizationItem {
  scopesText: string;
  createdText: string;
}

interface IdentityView extends SecurityIdentityItem {
  providerLabel: string;
  createdText: string;
  isCurrentLogin: boolean;
  /** 结合当前登录身份后的可解绑性 */
  canUnbind: boolean;
}

interface HistoryView extends LoginHistoryItem {
  typeLabel: string;
  dateText: string;
}

Page({
  data: {
    segments: SEGMENTS.map((s) => ({ key: s.key, label: s.label })),
    active: "devices" as SegmentKey,
    loading: true,
    needLogin: false,
    error: "",
    devices: [] as DeviceView[],
    authorizations: [] as AuthorizationView[],
    identities: [] as IdentityView[],
    history: [] as HistoryView[],
  },

  /** 各分段是否已加载（切换时命中缓存直接展示） */
  loaded: {
    devices: false,
    authorizations: false,
    bindings: false,
    history: false,
  } as Record<SegmentKey, boolean>,

  async onLoad() {
    await this.init();
  },

  onShow() {
    // 从登录页返回后重试
    if (this.data.needLogin && !this.data.loading) {
      void this.init();
    }
  },

  async init() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, needLogin: true });
      return;
    }
    this.setData({ needLogin: false });
    await this.loadSegment(this.data.active);
  },

  onSwitchSegment(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as SegmentKey;
    if (key === this.data.active) return;
    this.setData({ active: key, error: "" });
    if (!this.loaded[key]) void this.loadSegment(key);
  },

  async loadSegment(key: SegmentKey) {
    this.setData({ loading: true, error: "" });
    try {
      if (key === "devices") {
        const data = await api.securityDevices();
        this.setData({
          devices: data.devices.map((d) => ({
            ...d,
            lastActiveText: formatDateTime(d.lastActiveAt),
          })),
        });
      } else if (key === "authorizations") {
        const data = await api.securityAuthorizations();
        this.setData({
          authorizations: data.authorizations.map((a) => ({
            ...a,
            scopesText: a.scopes.length > 0 ? a.scopes.join(" / ") : "—",
            createdText: formatDateTime(a.createdAt),
          })),
        });
      } else if (key === "bindings") {
        const data = await api.securityIdentities();
        this.setData({
          identities: data.identities.map((i) => {
            // 旧服务端不返回 mpClientId 时保持全阻断兜底，避免误删当前登录方式
            const isCurrentLogin =
              i.provider === CURRENT_LOGIN_PROVIDER &&
              (i.mpClientId ? i.mpClientId === CURRENT_LOGIN_CLIENT_ID : true);
            return {
              ...i,
              providerLabel: identityLabel(i),
              createdText: formatDateTime(i.createdAt),
              isCurrentLogin,
              canUnbind: i.canUnbind && !isCurrentLogin,
            };
          }),
        });
      } else {
        const data = await api.securityLoginHistory();
        this.setData({
          history: data.attempts.map((h) => ({
            ...h,
            typeLabel: LOGIN_TYPE_LABELS[h.type] ?? h.type,
            dateText: formatDateTime(h.createdAt),
          })),
        });
      }
      this.loaded[key] = true;
      this.setData({ loading: false });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, needLogin: true });
        return;
      }
      this.setData({ loading: false, error: err.message || "加载失败" });
    }
  },

  /** 设备强制下线 */
  onRevokeDevice(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: "强制下线",
      content: "确定将该设备强制下线吗？该设备需要重新登录。",
      confirmColor: "#c25450",
      success: (res) => {
        if (res.confirm) void this.doRevokeDevice(id);
      },
    });
  },

  async doRevokeDevice(id: string) {
    wx.showLoading({ title: "处理中", mask: true });
    try {
      await api.revokeSecurityDevice(id);
      wx.hideLoading();
      wx.showToast({ title: "已强制下线", icon: "success" });
      this.loaded.devices = false;
      await this.loadSegment("devices");
    } catch (e) {
      wx.hideLoading();
      this.handleActionError(e);
    }
  },

  /** 撤销应用授权 */
  onRevokeAuthorization(e: WechatMiniprogram.TouchEvent) {
    const clientId = e.currentTarget.dataset.client as string;
    wx.showModal({
      title: "撤销授权",
      content: "确定撤销该应用的授权吗？撤销后其将无法访问你的账户信息。",
      confirmColor: "#c25450",
      success: (res) => {
        if (res.confirm) void this.doRevokeAuthorization(clientId);
      },
    });
  },

  async doRevokeAuthorization(clientId: string) {
    wx.showLoading({ title: "处理中", mask: true });
    try {
      await api.revokeSecurityAuthorization(clientId);
      wx.hideLoading();
      wx.showToast({ title: "已撤销授权", icon: "success" });
      this.loaded.authorizations = false;
      await this.loadSegment("authorizations");
    } catch (e) {
      wx.hideLoading();
      this.handleActionError(e);
    }
  },

  /** 解绑第三方身份 */
  onUnbindIdentity(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const identity = this.data.identities.find((i) => i.id === id);
    if (!identity) return;
    wx.showModal({
      title: "解除绑定",
      content: `确定解除「${identity.providerLabel}」的绑定吗？解除后将无法使用该平台登录。`,
      confirmColor: "#c25450",
      success: (res) => {
        if (res.confirm) void this.doUnbindIdentity(id);
      },
    });
  },

  async doUnbindIdentity(id: string) {
    wx.showLoading({ title: "处理中", mask: true });
    try {
      await api.unbindSecurityIdentity(id);
      wx.hideLoading();
      wx.showToast({ title: "已解除绑定", icon: "success" });
      this.loaded.bindings = false;
      await this.loadSegment("bindings");
    } catch (e) {
      wx.hideLoading();
      this.handleActionError(e);
    }
  },

  handleActionError(e: unknown) {
    const err = e as ApiError;
    if (err.status === 401) {
      this.setData({ needLogin: true });
      return;
    }
    wx.showToast({ title: err.message || "操作失败，请稍后重试", icon: "none" });
  },

  goAccountDeletion() {
    wx.navigateTo({ url: "/pages/account-deletion/account-deletion" });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
