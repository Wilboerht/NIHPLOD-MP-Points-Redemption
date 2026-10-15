/// <reference types="miniprogram-api-typings" />

/** App 全局类型（与 app.ts 的 App<IAppOption> 对应） */
interface IAppOption {
  globalData: {
    statusBarHeight: number;
  };
}
