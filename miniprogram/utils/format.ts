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

/** 千分位格式化（不依赖 Intl，兼容低端机型；最多保留两位小数） */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.round(Math.abs(value) * 100) / 100;
  const [intText, decText] = String(abs).split(".");
  const grouped = intText.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${decText ? `.${decText}` : ""}`;
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

/** 消费补录：渠道选项（表单提交用，白名单与服务端一致） */
export const SPENT_CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "TMALL", label: "天猫国际" },
  { value: "DOUYIN", label: "抖音商城" },
  { value: "XIAOHONGSHU", label: "小红书" },
  { value: "WECHAT_SHOP", label: "微信小铺" },
  { value: "OFFLINE", label: "线下专柜" },
  { value: "DEALER", label: "经销渠道" },
  { value: "OTHER", label: "其它" },
];

/** 消费补录：渠道展示文案（含历史渠道，存量数据展示用） */
export const SPENT_CHANNEL_LABELS: Record<string, string> = {
  TMALL: "天猫国际",
  DOUYIN: "抖音商城",
  XIAOHONGSHU: "小红书",
  WECHAT_SHOP: "微信小铺",
  OFFLINE: "线下专柜",
  DEALER: "经销渠道",
  OTHER: "其它",
  JD: "京东",
  MINIPROGRAM: "微信小程序",
};

/** 消费补录：状态文案 */
export const SPENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

/** 会员等级主题色（WXSS 不便直接使用 Tailwind 类名，按等级映射） */
export const LEVEL_THEME_COLORS: Record<string, string> = {
  REGULAR: "#78716c",
  SILVER: "#8a8a8a",
  GOLD: "#c98a1f",
  DIAMOND: "#5f63c7",
};

/**
 * 会员卡背景图（与官网 VipPanel 的 CARD_BG_IMAGES 一致，官网静态资源按等级映射；
 * 卡面为浅色纹理，使用方需配白色薄纱层 + 深色文字保证可读性）
 */
export const LEVEL_CARD_BG_IMAGES: Record<string, string> = {
  REGULAR: "/images/membership-card-regular.png",
  SILVER: "/images/membership-card-silver.jpg",
  GOLD: "/images/membership-card-gold.png",
  DIAMOND: "/images/membership-card-diamond.png",
};

/**
 * 消费补录凭证展示地址：公开 URL / 本地路径可直接展示；
 * 私有 objectName（需鉴权签名，小程序 <image> 无法携带鉴权头）返回空串，
 * 页面仅展示"已上传"占位。
 */
export function spentProofDisplayUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return resolveImageUrl(raw);
  return "";
}

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
