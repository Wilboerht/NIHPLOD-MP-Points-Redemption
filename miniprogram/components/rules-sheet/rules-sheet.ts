/**
 * 积分规则半屏抽屉（「我的」与「积分」页共用）
 *
 * 页面通过 selectComponent 调用 show()，点击遮罩/✕ 或页面可调用 close() 收起。
 */
const RULES = [
  "消费 1 元 = 1 积分；官网 / 官方渠道订单均累积",
  "积分有效期 6 个月，过期自动失效",
  "银卡及以上会员可参与积分兑礼（兑礼率 1 / 1.3 / 1.5）",
  "累计消费满 ¥1,000 / ¥5,000 / ¥10,000 升级银卡 / 金卡 / 钻石卡",
];

Component({
  data: {
    open: false,
    closing: false,
    rules: RULES,
  },

  methods: {
    /** 供页面 selectComponent 调用 */
    show() {
      this.setData({ open: true, closing: false });
    },

    /** 收起（播放动画后移除节点） */
    close() {
      if (!this.data.open || this.data.closing) return;
      this.setData({ closing: true });
      setTimeout(() => this.setData({ open: false, closing: false }), 220);
    },

    /** 阻止抽屉/遮罩区域触摸滚动穿透 */
    noop() {},
  },
});
