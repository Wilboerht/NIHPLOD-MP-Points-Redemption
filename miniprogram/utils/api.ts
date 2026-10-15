/**
 * 带鉴权的请求封装与业务接口
 *
 * - 自动附加 Bearer access token
 * - 401 时静默刷新（单飞）并重放一次；刷新失败则清会话并抛 401
 * - 统一错误：抛 ApiError（status/code/message），页面只需捕获展示 message
 */
import { rawRequest, type HttpMethod, type RawResponse } from "./request";
import { getAccessToken, refreshAccessToken, clearSession } from "./auth";
import { BASE_URL } from "./env";
import type {
  AddressInput,
  AddressItem,
  GiftsData,
  PointsOverview,
  ProfileUpdateInput,
  RedeemResult,
  RedemptionsData,
  TrackingData,
  UserInfoClaims,
} from "./types";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface AuthRequestOptions {
  url: string;
  method?: HttpMethod;
  data?: Record<string, unknown>;
}

/** 单飞刷新：并发 401 只触发一次 refresh */
let refreshing: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = refreshAccessToken().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function extractError(statusCode: number, body: unknown): ApiError {
  const record = (body ?? {}) as {
    success?: boolean;
    error?: { code?: string; message?: string } | string;
    error_description?: string;
  };

  let code = "UNKNOWN";
  let message = "请求失败，请稍后重试";

  if (record.error && typeof record.error === "object") {
    code = record.error.code ?? code;
    message = record.error.message ?? message;
  } else if (typeof record.error === "string") {
    // OAuth 口径错误：{ error: "invalid_token", error_description }
    code = record.error;
    message = record.error_description ?? message;
  } else if (record.error_description) {
    message = record.error_description;
  }

  return new ApiError(statusCode, code, message);
}

/** 响应信封统一解析：业务端点 { success, data } 取 data；OAuth 扁平响应直接返回 */
function resolveEnvelope<T>(res: RawResponse): T {
  const body = res.data as {
    success?: boolean;
    data?: T;
    error?: unknown;
    error_description?: string;
  };

  if (res.statusCode >= 200 && res.statusCode < 300 && body.success !== false) {
    return (body.data !== undefined ? body.data : body) as T;
  }

  const error = extractError(res.statusCode, body);
  if (error.code === "account_disabled") {
    clearSession();
  }
  throw error;
}

export async function authRequest<T>(options: AuthRequestOptions): Promise<T> {
  const call = () =>
    rawRequest({
      ...options,
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });

  let res = await call();

  if (res.statusCode === 401) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await call();
    }
    if (res.statusCode === 401) {
      clearSession();
      throw new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录");
    }
  }

  return resolveEnvelope<T>(res);
}

/**
 * 带鉴权的文件上传（wx.uploadFile，multipart 字段名固定 file）：
 * 与 authRequest 同语义——401 时静默刷新并重放一次
 */
function uploadRequest<T>(url: string, filePath: string): Promise<T> {
  const doUpload = () =>
    new Promise<RawResponse>((resolve, reject) => {
      wx.uploadFile({
        url: `${BASE_URL}${url}`,
        filePath,
        name: "file",
        header: { Authorization: `Bearer ${getAccessToken()}` },
        success: (res) => {
          let data: unknown = res.data;
          try {
            data = JSON.parse(res.data);
          } catch {
            // 非 JSON 响应保持原样，交由信封解析报错
          }
          resolve({ statusCode: res.statusCode, data });
        },
        fail: (err) => reject(new Error(err.errMsg || "上传失败")),
      });
    });

  return (async () => {
    let res = await doUpload();
    if (res.statusCode === 401) {
      const refreshed = await refreshOnce();
      if (refreshed) {
        res = await doUpload();
      }
      if (res.statusCode === 401) {
        clearSession();
        throw new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录");
      }
    }
    return resolveEnvelope<T>(res);
  })();
}

// ============================================
// 业务接口（契约见官网 docs/sso-integration.md）
// ============================================

export const api = {
  /** 积分余额与最近 20 条流水 */
  points: () => authRequest<PointsOverview>({ url: "/api/oauth/points" }),

  /** 可兑换礼品（按当前等级折算积分） */
  gifts: () => authRequest<GiftsData>({ url: "/api/oauth/points/gifts" }),

  /** 兑换礼品（requestId 幂等） */
  redeem: (body: { productId: string; addressId: string; requestId: string }) =>
    authRequest<RedeemResult>({ url: "/api/oauth/points/redeem", method: "POST", data: body }),

  /** 兑换记录（offset 分页，每页 10 条） */
  redemptions: (offset: number) =>
    authRequest<RedemptionsData>({ url: `/api/oauth/points/redemptions?offset=${offset}` }),

  /** 兑换物流轨迹 */
  tracking: (redemptionId: string) =>
    authRequest<TrackingData>({
      url: `/api/oauth/points/redemptions/${redemptionId}/tracking`,
    }),

  /** 收货地址簿 */
  addresses: () => authRequest<{ addresses: AddressItem[] }>({ url: "/api/oauth/addresses" }),

  createAddress: (data: AddressInput) =>
    authRequest<{ address: AddressItem }>({
      url: "/api/oauth/addresses",
      method: "POST",
      data: { ...data },
    }),

  updateAddress: (id: string, data: AddressInput) =>
    authRequest<{ address: AddressItem }>({
      url: `/api/oauth/addresses/${id}`,
      // wx.request 不支持 PATCH；后端提供 PUT 兼容别名
      method: "PUT",
      data: { ...data },
    }),

  deleteAddress: (id: string) =>
    authRequest<Record<string, never>>({
      url: `/api/oauth/addresses/${id}`,
      method: "DELETE",
    }),

  /** 用户资料（GET；按 token scope 返回 nickname/avatar/gender/birthday 等） */
  userinfo: () => authRequest<UserInfoClaims>({ url: "/api/oauth/userinfo" }),

  /** 资料编辑（需 profile:write；PUT 为 PATCH 兼容别名，wx.request 不支持 PATCH） */
  updateProfile: (data: ProfileUpdateInput) =>
    authRequest<UserInfoClaims>({
      url: "/api/oauth/userinfo",
      method: "PUT",
      data: { ...data },
    }),

  /** 头像上传（≤5MB，JPG/PNG/WebP；返回绝对 URL，随后经 updateProfile 写入） */
  uploadAvatar: (filePath: string) =>
    uploadRequest<{ url: string }>("/api/oauth/userinfo/avatar", filePath),
};
