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
