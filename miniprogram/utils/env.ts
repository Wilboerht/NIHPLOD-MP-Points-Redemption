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
  /** 主动退出标记：抑制启动期静默登录（下次显式登录成功即清除） */
  loggedOut: "nihplod_points_logged_out",
} as const;

/**
 * 订阅消息模板 ID（微信公众平台创建后填入；留空 = 对应订阅请求自动跳过）
 * 官网 env 需配置同名模板：MP_POINTS_TEMPLATE_SHIPPED / MP_POINTS_TEMPLATE_SPENT_REVIEW
 */
export const SUBSCRIBE_TMPL_SHIPPED = "gn7tg4ZpQABFC3aQO6dDho_x4ZddIm_31B1wX5ChSvA";
export const SUBSCRIBE_TMPL_SPENT_REVIEW = "6hPzooJROfwlVrfS8GjMBP6DcBIB6i3Jy4OwALvwWQ0";
