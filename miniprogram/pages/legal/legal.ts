/**
 * 法务页面（隐私政策 / 服务条款，小程序简版）
 *
 * 直接渲染内置简版文案（utils/legal-text.ts），不依赖 web-view / 业务域名；
 * 完整条款以官网公布版本为准。入口：「我的」页菜单（隐私政策 / 服务条款）。
 */
import { LEGAL_DOCS } from "../../utils/legal-text";

type LegalType = keyof typeof LEGAL_DOCS;

Page({
  data: {
    doc: LEGAL_DOCS.privacy,
  },

  onLoad(query: Record<string, string | undefined>) {
    const type: LegalType = query.type === "terms" ? "terms" : "privacy";
    const doc = LEGAL_DOCS[type];
    wx.setNavigationBarTitle({ title: doc.title });
    this.setData({ doc });
  },
});
