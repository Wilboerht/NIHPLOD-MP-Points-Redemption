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

export interface GiftItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  priceYuan: number;
  /** 按当前等级折算所需积分；普通档为 null（不可兑礼） */
  cost: number | null;
  affordable: boolean;
  detail: {
    id: string;
    name: string;
    images?: ProductImage[];
    capacity?: string;
    description?: string | null;
  };
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
