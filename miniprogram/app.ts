import { bootstrap } from "./utils/auth";

App<IAppOption>({
  globalData: {
    statusBarHeight: 0,
    navigationBarHeight: 44,
  },

  onLaunch() {
    try {
      const info = wx.getWindowInfo();
      this.globalData.statusBarHeight = info.statusBarHeight ?? 0;
    } catch {
      this.globalData.statusBarHeight = 0;
    }
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      const gap = Math.max(0, menu.top - this.globalData.statusBarHeight);
      if (menu.height > 0) this.globalData.navigationBarHeight = menu.height + gap * 2;
    } catch {
      this.globalData.navigationBarHeight = 44;
    }
    // 启动即尝试恢复/建立会话；need-binding 状态由登录页消费
    void bootstrap();
  },
});
