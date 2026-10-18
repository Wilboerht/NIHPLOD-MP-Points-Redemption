/**
 * 登录 / 绑定 / 会话管理
 *
 * 流程：wx.login → POST /api/auth/wechat/miniprogram-login（clientId=wechat-mp-points）
 * - 已绑定：直接得到 OAuth 双 Token（access 8h / refresh 30 天）
 * - 未绑定：返回 bindToken → 登录页引导「一键手机号」或短信验证码绑定
 */
import { rawRequest } from "./request";
import { MP_CLIENT_ID, STORAGE_KEYS } from "./env";
import { clearTransientCache } from "./cache";
import type { MpUser } from "./types";

interface LoginResponseData {
  needBinding: boolean;
  bindToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: MpUser;
}

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

export type LoginOutcome =
  | { kind: "ok" }
  | { kind: "need-binding"; bindToken: string }
  | { kind: "failed"; message: string; code?: string };

/** 绑定结果：不会出现 need-binding（bindToken 已由登录流程持有） */
export type BindOutcome =
  | { kind: "ok" }
  /** 绑定已完成（bindToken 已被服务端消费）但换发登录会话失败，可重试登录（无需再绑定） */
  | { kind: "bound-login-failed"; message: string }
  | { kind: "failed"; message: string; code?: string };

/** 绑定令牌失效类错误码：需重新静默登录换取新 bindToken 后再继续 */
export const STALE_BIND_TOKEN_CODES = [
  "BIND_TOKEN_EXPIRED",
  "INVALID_BIND_TOKEN",
  "BIND_TOKEN_USED",
] as const;

export function isStaleBindTokenError(code: string | undefined): boolean {
  return Boolean(code && (STALE_BIND_TOKEN_CODES as readonly string[]).includes(code));
}

// ============================================
// 本地会话存取
// ============================================

export function getAccessToken(): string {
  return (wx.getStorageSync(STORAGE_KEYS.accessToken) as string | undefined) ?? "";
}

export function getRefreshToken(): string {
  return (wx.getStorageSync(STORAGE_KEYS.refreshToken) as string | undefined) ?? "";
}

export function getStoredUser(): MpUser | null {
  const user = wx.getStorageSync(STORAGE_KEYS.user) as MpUser | undefined;
  return user && user.id ? user : null;
}

/** 资料编辑成功后同步本地缓存的用户资料（昵称/头像），供「我的」页展示 */
export function updateStoredUser(patch: Partial<MpUser>): void {
  const current = getStoredUser();
  if (!current) return;
  wx.setStorageSync(STORAGE_KEYS.user, { ...current, ...patch });
}

export function hasSession(): boolean {
  return Boolean(getAccessToken() || getRefreshToken());
}

function saveSession(data: {
  accessToken: string;
  refreshToken: string;
  user?: MpUser;
}): void {
  // 切换账号时清理上一账号的页面缓存（同账号刷新/续期不清理）
  const previousUser = getStoredUser();
  if (data.user && previousUser && previousUser.id !== data.user.id) {
    clearTransientCache();
  }
  wx.setStorageSync(STORAGE_KEYS.accessToken, data.accessToken);
  wx.setStorageSync(STORAGE_KEYS.refreshToken, data.refreshToken);
  if (data.user) wx.setStorageSync(STORAGE_KEYS.user, data.user);
  // 登录/刷新成功 = 用户已恢复会话：解除「主动退出」抑制
  wx.removeStorageSync(STORAGE_KEYS.loggedOut);
}

export function clearSession(): void {
  wx.removeStorageSync(STORAGE_KEYS.accessToken);
  wx.removeStorageSync(STORAGE_KEYS.refreshToken);
  wx.removeStorageSync(STORAGE_KEYS.user);
  clearTransientCache();
}

/** 用户是否已主动退出（退出后不再静默登录，直到显式重新登录） */
export function isLoggedOut(): boolean {
  return Boolean(wx.getStorageSync(STORAGE_KEYS.loggedOut));
}

// ============================================
// 登录
// ============================================

function wxLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error("wx.login 未返回 code"));
      },
      fail: () => reject(new Error("微信登录失败，请重试")),
    });
  });
}

/**
 * 静默登录（可选携带 phoneCode 一步完成绑定）。
 * 结果 need-binding 时返回 bindToken，由登录页引导完成绑定。
 */
export async function login(phoneCode?: string): Promise<LoginOutcome> {
  let code: string;
  try {
    code = await wxLogin();
  } catch (e) {
    return { kind: "failed", message: (e as Error).message };
  }

  try {
    const res = await rawRequest({
      url: "/api/auth/wechat/miniprogram-login",
      method: "POST",
      data: {
        code,
        clientId: MP_CLIENT_ID,
        ...(phoneCode ? { phoneCode } : {}),
      },
    });
    const body = res.data as ApiEnvelope<LoginResponseData>;

    if (res.statusCode === 200 && body.success && body.data) {
      if (body.data.needBinding) {
        return { kind: "need-binding", bindToken: body.data.bindToken ?? "" };
      }
      if (body.data.accessToken && body.data.refreshToken) {
        saveSession({
          accessToken: body.data.accessToken,
          refreshToken: body.data.refreshToken,
          user: body.data.user,
        });
        return { kind: "ok" };
      }
    }
    return { kind: "failed", message: body.error?.message ?? "登录失败，请重试", code: body.error?.code };
  } catch {
    return { kind: "failed", message: "网络异常，请稍后重试" };
  }
}

// ============================================
// Token 刷新（public client，refresh_token grant）
// ============================================

/**
 * 刷新结果：
 * - ok：已换发新 token
 * - invalid：refresh token 明确失效/被撤销，会话应清理
 * - transient：网络/服务端临时异常，保留会话，稍后重试
 */
export type RefreshOutcome = "ok" | "invalid" | "transient";

export async function refreshAccessToken(): Promise<RefreshOutcome> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return "invalid";
  try {
    const res = await rawRequest({
      url: "/api/oauth/token",
      method: "POST",
      data: {
        grant_type: "refresh_token",
        client_id: MP_CLIENT_ID,
        refresh_token: refreshToken,
      },
    });
    const body = res.data as { access_token?: string; refresh_token?: string };
    if (res.statusCode === 200 && body.access_token) {
      saveSession({
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? refreshToken,
      });
      return "ok";
    }
    if (res.statusCode === 400 || res.statusCode === 401) {
      // invalid_grant：refresh token 已失效/被撤销
      clearSession();
      return "invalid";
    }
    return "transient";
  } catch {
    // 网络异常：保留会话，由下次请求重试
    return "transient";
  }
}

/**
 * 单飞刷新：bootstrap 与 API 401 重放共用同一在途刷新，
 * 避免并发 refresh_token 触发服务端轮换互踢（后到者失败清会话）。
 */
let refreshingPromise: Promise<RefreshOutcome> | null = null;

export function refreshAccessTokenOnce(): Promise<RefreshOutcome> {
  if (!refreshingPromise) {
    refreshingPromise = refreshAccessToken().finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

// ============================================
// 绑定（未绑定用户：短信验证码）
// ============================================

/**
 * 绑定手机号。
 *
 * 注意：/api/auth/wechat/bind 返回的是**内部会话 token（HS256）**，不可用于
 * /api/oauth/* 资源端点，因此本函数不持久化其返回值；绑定成功后应调用
 * bindAndLogin()（或 login()）换取 OAuth 双 Token。
 */
export async function bind(
  bindToken: string,
  payload: { phoneCode: string } | { phone: string; code: string }
): Promise<BindOutcome> {
  try {
    const res = await rawRequest({
      url: "/api/auth/wechat/bind",
      method: "POST",
      data: { bindToken, ...payload },
    });
    const body = res.data as ApiEnvelope<Record<string, unknown>>;

    // 只要 bind 返回 success 即为绑定成功（其携带的内部会话 token 不使用）
    if (res.statusCode === 200 && body.success) {
      return { kind: "ok" };
    }
    return {
      kind: "failed",
      message: body.error?.message ?? "绑定失败，请重试",
      code: body.error?.code,
    };
  } catch {
    return { kind: "failed", message: "网络异常，请稍后重试" };
  }
}

/**
 * 绑定并登录（短信通道）：
 * bind 完成身份写入（ExternalIdentity）后，重新静默登录换取 RS256 OAuth 双 Token。
 *
 * 注意：bindToken 为服务端一次性令牌，bind 成功后即被消费——此后登录失败
 * 只能重试「登录」，不能重试「绑定」（详见 bound-login-failed 结果类型）。
 */
export async function bindAndLogin(
  bindToken: string,
  payload: { phone: string; code: string }
): Promise<BindOutcome> {
  const bound = await bind(bindToken, payload);
  if (bound.kind !== "ok") return bound;

  // 绑定已完成：登录失败（网络抖动等）重试一次，仍失败则交由调用方重试登录
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await login();
    if (outcome.kind === "ok") return { kind: "ok" };
    if (outcome.kind === "need-binding") break;
  }
  return { kind: "bound-login-failed", message: "绑定已完成，登录未完成，请重试登录" };
}

/** 发送绑定短信验证码（携带 bindToken 保证未注册号码也真实发码） */
export async function sendBindSmsCode(
  phone: string,
  bindToken: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await rawRequest({
      url: "/api/auth/send-code",
      method: "POST",
      data: { phone, type: "bind", bindToken },
    });
    const body = res.data as ApiEnvelope<{ expiresIn?: number }>;
    if (res.statusCode === 200 && body.success) return { ok: true };
    return { ok: false, message: body.error?.message ?? "验证码发送失败" };
  } catch {
    return { ok: false, message: "网络异常，请稍后重试" };
  }
}

// ============================================
// 退出登录
// ============================================

/** 撤销 refresh token（RFC 7009，public client）+ 清本地会话 + 置退出标记（抑制静默登录） */
export function logout(): void {
  const token = getRefreshToken();
  clearSession();
  pendingBindToken = "";
  wx.setStorageSync(STORAGE_KEYS.loggedOut, 1);
  if (!token) return;
  // 撤销请求后台静默：本地会话已清，不阻塞退出交互；失败由服务端 TTL 兜底
  void rawRequest({
    url: "/api/oauth/revoke",
    method: "POST",
    data: { token, token_type_hint: "refresh_token", client_id: MP_CLIENT_ID },
  }).catch(() => {
    // 本地会话已清，忽略服务端撤销失败
  });
}

// ============================================
// 启动与会话辅助
// ============================================

/** 未绑定状态暂存（登录页消费） */
let pendingBindToken = "";

export function getPendingBindToken(): string {
  return pendingBindToken;
}

export function setPendingBindToken(token: string): void {
  pendingBindToken = token;
}

/** 应用启动：恢复会话（refresh）或静默登录；need-binding 时暂存 bindToken */
let bootstrapPromise: Promise<void> | null = null;

async function doBootstrap(): Promise<void> {
  // 用户主动退出后不静默登录：由「去登录」按钮显式触发
  if (isLoggedOut()) return;
  if (hasSession()) {
    const refresh = await refreshAccessTokenOnce();
    if (refresh === "ok" || refresh === "transient") return;
  }
  const outcome = await login();
  if (outcome.kind === "need-binding") {
    pendingBindToken = outcome.bindToken;
  }
}

/** 启动期静默登录（单飞：app.onLaunch 与页面调用共享同一次执行） */
export function bootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = doBootstrap().finally(() => {
      bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

/**
 * 页面会话就绪检查：未登录时等待启动期静默登录完成（解决冷启动竞态）。
 * 返回 true 表示已建立会话；false 时页面应展示登录引导。
 */
export async function ensureSession(): Promise<boolean> {
  if (hasSession()) return true;
  await bootstrap();
  return hasSession();
}
