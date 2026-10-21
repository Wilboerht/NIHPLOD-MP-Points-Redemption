/** 与官网 OAuth 资源端点契约对齐的数据类型（docs/sso-integration.md） */

export interface MpUser {
  id: string;
  phone: string;
  nickname: string | null;
  avatar: string | null;
}

export type PointLedgerType =
  | "CONSUME"
  | "REFUND"
  | "BIRTHDAY"
  | "CHECKIN"
  | "REDEEM"
  | "EXPIRE"
  | "ADJUST";

export interface PointLedgerItem {
  id: string;
  type: PointLedgerType;
  amount: number;
  remaining: number | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** GET /api/oauth/points */
export interface PointsOverview {
  available: number;
  frozen: number;
  nextReleaseAt: string | null;
  recent: PointLedgerItem[];
}

export interface ProductImage {
  url: string;
  alt?: string;
}

export type GiftPurchaseJump =
  | { type: "miniprogram"; shortLink?: string; appId?: string; path?: string }
  | { type: "copy" };

export interface GiftPurchaseLink {
  id: string;
  platform: string;
  platformKey?: string | null;
  url: string;
  miniProgramShortLink?: string | null;
  miniProgramPath?: string | null;
  jump?: GiftPurchaseJump;
}

/** 礼品详情（与官网 ProductData 对齐；服务端 detail 字段的完整形状） */
export interface GiftDetail {
  id: string;
  name: string;
  /** 英文名（可能为空） */
  nameEn?: string | null;
  slug?: string;
  description?: string | null;
  /** 参考价（元） */
  price?: number;
  capacity?: string | null;
  origin?: string | null;
  images?: ProductImage[];
  category?: { name: string };
  ingredients?: string | null;
  usage?: string | null;
  /** 核心功效标签 */
  benefits?: string[];
  purchaseLinks?: GiftPurchaseLink[];
}

export interface GiftItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  priceYuan: number;
  /** 按当前等级折算所需积分；普通档为 null（不可兑礼） */
  cost: number | null;
  affordable: boolean;
  detail: GiftDetail;
}

/** GET /api/oauth/points/gifts */
export interface GiftsData {
  membershipLevel: string;
  redeemRate: number | null;
  available: number;
  frozen: number;
  gifts: GiftItem[];
}

/** POST /api/oauth/points/redeem */
export interface RedeemResult {
  redemptionId: string;
  points: number;
  available: number;
  duplicated: boolean;
}

export type RedemptionStatus = "PENDING" | "FULFILLED" | "CANCELLED";

export interface RedemptionItem {
  id: string;
  productName: string;
  /** 产品主图（可能为 null：产品已删除或无图） */
  image: string | null;
  priceYuan: number;
  points: number;
  status: RedemptionStatus;
  recipient: string | null;
  phone: string | null;
  address: string | null;
  carrier: string | null;
  waybillNo: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

/** GET /api/oauth/points/redemptions */
export interface RedemptionsData {
  redemptions: RedemptionItem[];
  hasMore: boolean;
  total: number;
}

export interface TrackingRoute {
  time: string;
  description: string;
  location?: string;
}

/** GET /api/oauth/points/redemptions/{id}/tracking */
export interface TrackingData {
  waybillNo: string;
  carrier: string | null;
  supported: boolean;
  routes: TrackingRoute[] | null;
  error: string | null;
}

export interface AddressItem {
  id: string;
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault: boolean;
}

export interface AddressInput {
  recipient: string;
  phone: string;
  region: string;
  detail: string;
  isDefault?: boolean;
}

/** GET /api/oauth/userinfo 响应（按 token scope 裁剪） */
export interface UserInfoClaims {
  sub: string;
  nickname?: string | null;
  avatar?: string | null;
  gender?: "male" | "female" | null;
  birthday?: string | null;
  has_password?: boolean;
}

/** PATCH（兼容 PUT）/api/oauth/userinfo 请求体（只提交需要变更的字段） */
export interface ProfileUpdateInput {
  nickname?: string;
  avatar?: string;
  /** YYYY-MM-DD；生日首次设置后锁定（服务端返回 birthday_locked） */
  birthday?: string;
  gender?: "male" | "female" | null;
}

// ============================================
// 积分明细（近一年）
// ============================================

export interface LedgerItem {
  id: string;
  type: PointLedgerType;
  amount: number;
  remaining: number | null;
  note: string | null;
  /** 业务流水号（商城单据号 / 幂等键） */
  reference: string;
  expiresAt: string | null;
  createdAt: string;
}

/** GET /api/oauth/points/ledger */
export interface LedgerPage {
  items: LedgerItem[];
  hasMore: boolean;
  total: number;
}

// ============================================
// 会员视图（GET /api/oauth/membership）
// ============================================

export interface LevelBenefitItem {
  icon: string;
  title: string;
  desc: string;
}

export type MembershipLevelKey = "REGULAR" | "SILVER" | "GOLD" | "DIAMOND";

export interface MembershipLevelInfo {
  level: MembershipLevelKey;
  name: string;
  nameEn: string;
  icon: string;
  minSpent: number;
  maxSpent: number | null;
  benefits: LevelBenefitItem[];
  colorClass: string;
}

export interface NextLevelInfo {
  level: MembershipLevelKey;
  name: string;
  minSpent: number;
  spentNeeded: number;
  progress: number;
}

export interface MembershipView {
  sub?: string;
  membershipLevel: MembershipLevelKey;
  memberId: string;
  totalSpent: number;
  currentLevel: MembershipLevelInfo;
  nextLevel: NextLevelInfo | null;
  allLevels: MembershipLevelInfo[];
}

// ============================================
// AI 测肤用量（GET /api/oauth/skin-test-usage）
// ============================================

/** AI 测肤用量（会员权益；来源测肤子站，不可用时为 null） */
export interface SkinTestUsage {
  /** 子站会员等级标识；从未测肤的用户可能为 null */
  level: string | null;
  totalUsed: number;
  todayUsed: number;
  quota: {
    /** 累计上限（null = 不限）；unlimited 为 true 时无累计上限 */
    lifetimeLimit: number | null;
    dailyLimit: number | null;
    unlimited: boolean;
  };
  /** 剩余次数；null = 不限次 */
  remaining: number | null;
  /** 今日是否已完成手动打卡（自动测肤日记不计入）；旧版子站可能缺失 */
  todayCheckedIn?: boolean;
}

// ============================================
// 消费补录
// ============================================

export type SpentChannel =
  | "TMALL"
  | "DOUYIN"
  | "XIAOHONGSHU"
  | "WECHAT_SHOP"
  | "OFFLINE"
  | "DEALER"
  | "OTHER";

export type SpentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface SpentApplication {
  id: string;
  channel: SpentChannel | "JD" | "MINIPROGRAM";
  orderNo: string;
  dealerName: string | null;
  amountClaimed: number | null;
  purchasedAt: string | null;
  images: string[];
  note: string | null;
  status: SpentStatus;
  reviewAmount: number | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface SpentApplicationInput {
  channel: SpentChannel;
  orderNo: string;
  dealerName?: string;
  amountClaimed?: number;
  purchasedAt?: string;
  images?: string[];
  note?: string;
}

// ============================================
// 账号注销（GET/POST/DELETE /api/oauth/account/deletion）
// ============================================

/** 进行中的注销申请（冷静期内可撤回） */
export interface DeletionRequestInfo {
  status: "PENDING" | "RUNNING";
  requestedAt: string;
  scheduledAt: string;
  /** 距离生效剩余天数（向上取整） */
  remainingDays: number;
}

// ============================================
// 安全中心（GET/DELETE /api/oauth/security/*）
// ============================================

/** 活跃设备/会话（脱敏 IP；OAuth 场景最近活跃会话标记为当前） */
export interface SecurityDeviceItem {
  id: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

/** 已授权应用（按 client 去重） */
export interface SecurityAuthorizationItem {
  clientId: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  /** 是否为当前小程序自身 */
  isCurrentClient: boolean;
}

/** 第三方绑定身份（不含 openid） */
export interface SecurityIdentityItem {
  id: string;
  provider: string;
  /** 来源小程序 clientId（仅 wechat_miniprogram 身份可能有；旧服务端可能缺失） */
  mpClientId?: string | null;
  nickname: string | null;
  avatar: string | null;
  createdAt: string;
  lastSyncAt: string;
  canUnbind: boolean;
}

/** 登录历史（最近 50 条） */
export interface LoginHistoryItem {
  id: string;
  /** password | sms | oauth | admin */
  type: string;
  success: boolean;
  reason: string | null;
  ipAddress: string;
  createdAt: string;
}
