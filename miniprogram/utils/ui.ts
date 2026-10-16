/**
 * 界面辅助工具
 */

/**
 * 自定义导航栏：获取状态栏高度（px）
 * app.onLaunch 已通过 wx.getWindowInfo 缓存；异常场景兜底 20（iPhone 状态栏典型值）
 */
export function getStatusBarHeight(): number {
  const app = getApp<IAppOption>();
  return app?.globalData?.statusBarHeight || 20;
}
