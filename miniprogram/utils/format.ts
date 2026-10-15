/** 格式化与文案映射 */
import { BASE_URL } from "./env";

/**
 * 图片 URL 归一化：商品图在本地存储模式下为相对路径（/uploads/...），
 * 小程序 <image> 无法解析相对路径，统一补全为官网绝对地址。
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** 千分位格式化（不依赖 Intl，兼容低端机型） */
export function formatPoints(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(value)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** ISO → YYYY-MM-DD */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO → YYYY-MM-DD HH:mm */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${formatDateOnly(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 积分流水类型文案 */
export const LEDGER_TYPE_LABELS: Record<string, string> = {
  CONSUME: "消费积分",
  REFUND: "退款冲正",
  BIRTHDAY: "生日礼遇",
  CHECKIN: "打卡奖励",
  REDEEM: "兑换扣减",
  EXPIRE: "积分过期",
  ADJUST: "平台调整",
};

/** 兑换状态文案 */
export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "待发货",
  FULFILLED: "已发货",
  CANCELLED: "已取消",
};

/** 兑换错误码文案补充（服务端已带 message，此处兜底） */
export const REDEEM_ERROR_MESSAGES: Record<string, string> = {
  NOT_ELIGIBLE: "银卡及以上会员才能参与积分兑礼",
  INSUFFICIENT: "可用积分不足",
  OUT_OF_STOCK: "礼品已兑完，请选择其他礼品",
  ADDRESS_NOT_FOUND: "收货地址不存在，请重新选择",
  PRODUCT_NOT_FOUND: "礼品不存在或已下架",
  PRODUCT_NOT_REDEEMABLE: "该礼品暂不支持积分兑换",
};

/** 生成幂等请求号（兑换用） */
export function genRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}
