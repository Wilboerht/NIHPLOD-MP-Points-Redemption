import { api, ApiError } from "../../utils/api";
import { ensureSession, getStoredUser, logout, updateStoredUser } from "../../utils/auth";
import { maskPhone, resolveImageUrl } from "../../utils/format";
import type { ProfileUpdateInput } from "../../utils/types";

const GENDER_OPTIONS: Array<{ label: string; value: "male" | "female" | null }> = [
  { label: "保密", value: null },
  { label: "男", value: "male" },
  { label: "女", value: "female" },
];

/** 昵称输入防抖：停止输入后再提交，避免逐字请求 */
const NICKNAME_SAVE_DELAY = 600;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    uploading: false,
    error: "",
    avatarUrl: "",
    /** 绑定手机号（账号信息，只读脱敏展示） */
    phoneMasked: "",
    nickname: "",
    genderOptions: GENDER_OPTIONS.map((o) => o.label),
    genderIndex: 0,
    today: "",
    /** 生日是否已设置（已设置 = 服务端锁定，不可修改） */
    birthdaySet: false,
    birthdayText: "",
  },

  /** 最近一次保存成功的昵称 / 头像 / 生日，用于变更判断与失败回滚 */
  savedNickname: "",
  savedAvatarUrl: "",
  savedBirthday: "",
  /** 合并待提交字段，避免连续编辑时并发请求乱序 */
  pendingPatch: {} as ProfileUpdateInput,
  patchQueueRunning: false,
  nicknameTimer: 0,

  async onLoad() {
    const now = new Date();
    this.setData({
      today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    });
    await this.load();
  },

  onShow() {
    // 从登录页返回后（仍未登录态）重试加载
    if (!this.data.loading && !this.data.loggedIn) {
      void this.load();
    }
  },

  onHide() {
    // 离开页面前提交尚未触发的昵称防抖保存（会话失效时不再提交）
    if (this.data.loggedIn) {
      this.commitNickname(false);
    } else if (this.nicknameTimer) {
      clearTimeout(this.nicknameTimer);
      this.nicknameTimer = 0;
    }
  },

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false, error: "" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const info = await api.userinfo();
      const avatar = info.avatar ? resolveImageUrl(info.avatar) : "";
      const genderIndex = GENDER_OPTIONS.findIndex((o) => o.value === (info.gender ?? null));
      const index = genderIndex >= 0 ? genderIndex : 0;
      const storedUser = getStoredUser();
      this.savedNickname = info.nickname ?? "";
      this.savedAvatarUrl = avatar;
      this.savedBirthday = info.birthday ? info.birthday.slice(0, 10) : "";
      this.setData({
        loading: false,
        loggedIn: true,
        error: "",
        avatarUrl: avatar,
        // 手机号来自登录时缓存的用户信息（userinfo 不含完整号码）
        phoneMasked: storedUser?.phone ? maskPhone(storedUser.phone) : "",
        nickname: info.nickname ?? "",
        genderIndex: index,
        birthdaySet: Boolean(info.birthday),
        birthdayText: info.birthday ? info.birthday.slice(0, 10) : "",
      });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        this.setData({ loading: false, loggedIn: false, error: "" });
        return;
      }
      this.setData({ loading: false, error: err.message || "资料加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  /** 退出登录（账号操作归入个人资料页） */
  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需重新登录，积分与兑换记录不受影响。",
      confirmText: "退出",
      confirmColor: "#8a6d4b",
      success: (res) => {
        if (!res.confirm) return;
        // 退出前丢弃未提交的修改，避免退出后仍有自动保存请求
        if (this.nicknameTimer) {
          clearTimeout(this.nicknameTimer);
          this.nicknameTimer = 0;
        }
        this.pendingPatch = {};
        logout();
        wx.showToast({ title: "已退出", icon: "success" });
        setTimeout(() => wx.reLaunch({ url: "/pages/home/home" }), 500);
      },
    });
  },

  onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const tempPath = e.detail.avatarUrl;
    if (!tempPath || this.data.uploading) return;
    // 立即上传并预览；上传失败回滚到上次保存的头像
    this.setData({ avatarUrl: tempPath, uploading: true });
    void this.uploadAvatar(tempPath);
  },

  async uploadAvatar(tempPath: string) {
    try {
      const result = await api.uploadAvatar(tempPath);
      const url = resolveImageUrl(result.url);
      this.setData({ avatarUrl: url, uploading: false });
      this.queuePatch({ avatar: url });
    } catch (err) {
      this.setData({ avatarUrl: this.savedAvatarUrl, uploading: false });
      wx.showToast({ title: (err as ApiError).message || "头像上传失败", icon: "none" });
    }
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value });
    this.scheduleNicknameSave();
  },

  onNicknameBlur() {
    this.commitNickname(true);
  },

  scheduleNicknameSave() {
    if (this.nicknameTimer) clearTimeout(this.nicknameTimer);
    this.nicknameTimer = setTimeout(() => {
      this.nicknameTimer = 0;
      this.commitNickname(false);
    }, NICKNAME_SAVE_DELAY);
  },

  commitNickname(showHint: boolean) {
    if (!this.data.loggedIn) return;
    if (this.nicknameTimer) {
      clearTimeout(this.nicknameTimer);
      this.nicknameTimer = 0;
    }
    const nickname = this.data.nickname.trim();
    if (nickname === (this.pendingPatch.nickname ?? this.savedNickname)) return;
    if (!nickname) {
      if (showHint) wx.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }
    this.queuePatch({ nickname });
  },

  onGenderTap(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.genderIndex) return;
    this.setData({ genderIndex: index });
    this.queuePatch({ gender: GENDER_OPTIONS[index].value });
  },

  onBirthdayChange(e: WechatMiniprogram.PickerChange) {
    const birthday = String(e.detail.value);
    if (!birthday || this.data.birthdaySet) return;
    // 先锁定界面避免重复选择；保存失败时回滚为可编辑
    this.setData({ birthdayText: birthday, birthdaySet: true });
    this.queuePatch({ birthday });
  },

  /** 合并同一时间窗口内的修改，串行提交，避免字段互相覆盖 */
  queuePatch(patch: ProfileUpdateInput) {
    this.pendingPatch = { ...this.pendingPatch, ...patch };
    if (!this.patchQueueRunning) void this.flushPatches();
  },

  async flushPatches() {
    if (this.patchQueueRunning) return;
    this.patchQueueRunning = true;
    while (Object.keys(this.pendingPatch).length > 0) {
      const patch = this.pendingPatch;
      this.pendingPatch = {};
      try {
        await api.updateProfile(patch);
        this.onPatchSaved(patch);
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) {
          this.setData({ loggedIn: false, error: "" });
          wx.navigateTo({ url: "/pages/login/login" });
          break;
        }
        wx.showToast({ title: err.message || "自动保存失败", icon: "none" });
        // 已修改但未保存成功：回滚对应的本地展示，避免显示未生效的数据
        if (patch.avatar !== undefined) {
          this.setData({ avatarUrl: this.savedAvatarUrl });
        }
        if (patch.birthday !== undefined) {
          this.setData({ birthdaySet: false, birthdayText: this.savedBirthday });
        }
      }
    }
    this.patchQueueRunning = false;
  },

  onPatchSaved(patch: ProfileUpdateInput) {
    if (patch.nickname !== undefined) this.savedNickname = patch.nickname;
    if (patch.avatar !== undefined) this.savedAvatarUrl = patch.avatar;
    if (patch.birthday !== undefined) this.savedBirthday = patch.birthday;
    updateStoredUser({
      ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
      ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
    });
  },
});
