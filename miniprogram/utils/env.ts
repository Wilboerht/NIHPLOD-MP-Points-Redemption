/**
 * 环境与常量配置
 *
 * dev：本地官网（微信开发者工具需勾选「不校验合法域名」）
 * prod：线上官网
 */
export type AppEnv = "dev" | "prod";

/** 当前环境：联调本地时改为 "dev" */
export const ENV: AppEnv = "prod";

/** 官网 API 基地址（正式环境需在小程序后台配置 request 合法域名） */
export const BASE_URL =
  (ENV as string) === "dev" ? "http://127.0.0.1:3000" : "https://nihplod.cn";

/** 官网 SSO 后台登记的 OAuth public client（需同时在官网 MINIPROGRAM_CLIENTS 配置微信凭证） */
export const MP_CLIENT_ID = "wechat-mp-points";

/** 本地存储键 */
export const STORAGE_KEYS = {
  accessToken: "nihplod_points_access_token",
  refreshToken: "nihplod_points_refresh_token",
  user: "nihplod_points_user",
} as const;
