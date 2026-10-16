# nihplod-points-mp

NIHPLOD 积分小程序（纯积分兑换）：微信登录 → 积分余额/近一年明细（含流水号）→ 会员权益 → 兑礼 → 收货地址 / 兑换记录 / 顺丰物流 / 消费补录 / 资料编辑 / 分享与订阅消息 / 账号注销。

小程序**直连官网 OAuth 端点**（无需自建后端），登录与业务契约见官网仓库 `docs/sso-integration.md`「微信小程序接入（独立小程序）」章节。

## 目录结构

```
miniprogram/
├── app.ts / app.json / app.wxss     # 应用入口与全局样式
├── utils/
│   ├── env.ts      # 环境配置（BASE_URL / clientId）
│   ├── request.ts  # wx.request Promise 封装（不含鉴权）
│   ├── auth.ts     # 登录 / 绑定 / 刷新 / 退出（token 管理）
│   ├── api.ts      # 带鉴权的请求封装（401 单飞刷新重放）+ 业务接口
│   ├── cache.ts    # 页面间轻量数据传递（兑换记录详情）
│   ├── subscribe.ts # 订阅消息请求封装（fail-soft）
│   ├── format.ts   # 格式化与文案映射
│   └── types.ts    # 与官网接口契约对齐的类型
└── pages/          # home / gifts / gift-detail / redeem / addresses / address-edit / records / record-detail / profile-edit / points-ledger / vip / spent-adjustments / spent-adjustment-new / account-deletion / login / me
```

## 初始化配置

1. **AppID**：`project.config.json` 中已配置正式 AppID（`wx9fb8f3d1c719c4ed`），更换主体时在此替换；
2. **后端地址**：`miniprogram/utils/env.ts` 的 `ENV`（`prod` 连线上 `https://nihplod.cn`，`dev` 连本地 `http://127.0.0.1:3000`，需在开发者工具「详情 → 本地设置」勾选「不校验合法域名」）；
3. **微信平台**：小程序需绑定与官网同一微信开放平台账号（UnionID 聚合），并配置 request 合法域名 `https://nihplod.cn`；使用一键手机号需在「用户隐私保护指引」声明收集手机号与收货地址；
4. **官网侧**：SSO 后台创建 public OAuth Client `wechat-mp-points`（scopes 建议: `openid profile phone membership profile:write birthday`——`profile:write`/`birthday` 供「编辑资料」页；redirectUris 需填一个 https 公网占位回调地址；建议 `accessTokenTtlSeconds=900`），并在 `MINIPROGRAM_CLIENTS` 登记该 client 的 AppID/AppSecret。

## 开发

```bash
npm install       # 安装 miniprogram-api-typings（仅类型检查用）
npm run typecheck # tsc --noEmit
```

微信开发者工具直接导入本目录（`miniprogramRoot` 已指向 `miniprogram/`），工具内置 TS 编译（`useCompilerPlugins: ["typescript"]`），无需额外构建。

## 登录链路

1. 启动/进入页面 → `wx.login` → `POST /api/auth/wechat/miniprogram-login`（`clientId: wechat-mp-points`）；
2. 已绑定用户：直接获得 accessToken（8h，RS256）+ refreshToken（30 天），access 过期由 `utils/api.ts` 静默刷新重放一次；
3. 未绑定用户（新用户/微信占位号）：跳转登录页——「一键手机号」携带 phoneCode 再次调 `miniprogram-login` 一步完成；短信通道走 `POST /api/auth/wechat/bind`（bindToken），绑定成功后自动重新静默登录换取 OAuth 双 Token（bind 返回的内部会话 token 不用于业务接口，见 `utils/auth.ts` 注释）。
