/**
 * wx.request Promise 封装（不含鉴权）
 * 带鉴权与 401 刷新的请求统一走 utils/api.ts 的 authRequest
 */
import { BASE_URL } from "./env";

/** wx.request 官方支持的 method 白名单（不含 PATCH，地址编辑走后端 PUT 兼容别名） */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RawRequestOptions {
  /** 以 / 开头的官网路径，如 /api/oauth/points */
  url: string;
  method?: HttpMethod;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface RawResponse {
  statusCode: number;
  /** 响应体（wx.request 已按 content-type 解析 JSON） */
  data: unknown;
}

export function rawRequest(options: RawRequestOptions): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method ?? "GET",
      data: options.data,
      header: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      success: (res) => {
        resolve({ statusCode: res.statusCode, data: res.data as unknown });
      },
      fail: (err) => {
        reject(new Error(err.errMsg || "网络请求失败"));
      },
    });
  });
}
