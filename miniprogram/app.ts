import { bootstrap } from "./utils/auth";

App<IAppOption>({
  globalData: {
    statusBarHeight: 0,
  },

  onLaunch() {
    try {
      const info = wx.getWindowInfo();
      this.globalData.statusBarHeight = info.statusBarHeight ?? 0;
    } catch {
      this.globalData.statusBarHeight = 0;
    }
    // 启动即尝试恢复/建立会话；need-binding 状态由登录页消费
    void bootstrap();
  },
});
