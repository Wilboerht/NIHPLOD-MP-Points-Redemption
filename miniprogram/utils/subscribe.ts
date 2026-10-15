/**
 * 订阅消息请求封装（fail-soft）
 *
 * 需在用户点击行为中调用（如提交按钮处理内）。模板 ID 未配置（空串）时直接跳过；
 * 用户拒绝、主开关关闭、接口异常等一律静默，不影响主流程。
 */
import { SUBSCRIBE_TMPL_SHIPPED, SUBSCRIBE_TMPL_SPENT_REVIEW } from "./env";

function requestSubscribe(tmplIds: Array<string>): Promise<void> {
  const valid = tmplIds.filter((id) => Boolean(id));
  if (valid.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: valid,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}

/** 兑换发货通知订阅（兑换确认时调用） */
export function subscribeShipped(): Promise<void> {
  return requestSubscribe([SUBSCRIBE_TMPL_SHIPPED]);
}

/** 补录审核结果订阅（提交补录申请时调用） */
export function subscribeSpentReview(): Promise<void> {
  return requestSubscribe([SUBSCRIBE_TMPL_SPENT_REVIEW]);
}
