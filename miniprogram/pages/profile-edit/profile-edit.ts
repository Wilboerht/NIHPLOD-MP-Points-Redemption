import { api, ApiError } from "../../utils/api";
import { ensureSession, updateStoredUser } from "../../utils/auth";
import { resolveImageUrl } from "../../utils/format";
import type { ProfileUpdateInput } from "../../utils/types";

const GENDER_OPTIONS: Array<{ label: string; value: "male" | "female" | null }> = [
  { label: "保密", value: null },
  { label: "男", value: "male" },
  { label: "女", value: "female" },
];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    saving: false,
    uploading: false,
    error: "",
    avatarUrl: "",
    originalAvatar: "",
    nickname: "",
    originalNickname: "",
    genderOptions: GENDER_OPTIONS.map((o) => o.label),
    genderIndex: 0,
    originalGenderIndex: 0,
    today: "",
    /** 生日是否已设置（已设置 = 服务端锁定，不可修改） */
    birthdaySet: false,
    birthdayText: "",
  },

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

  async load() {
    const loggedIn = await ensureSession();
    if (!loggedIn) {
      this.setData({ loading: false, loggedIn: false });
      return;
    }
    try {
      const info = await api.userinfo();
      const avatar = info.avatar ? resolveImageUrl(info.avatar) : "";
      const genderIndex = GENDER_OPTIONS.findIndex((o) => o.value === (info.gender ?? null));
      const index = genderIndex >= 0 ? genderIndex : 0;
      this.setData({
        loading: false,
        loggedIn: true,
        avatarUrl: avatar,
        originalAvatar: avatar,
        nickname: info.nickname ?? "",
        originalNickname: info.nickname ?? "",
        genderIndex: index,
        originalGenderIndex: index,
        birthdaySet: Boolean(info.birthday),
        birthdayText: info.birthday ? info.birthday.slice(0, 10) : "",
      });
    } catch (e) {
      const err = e as ApiError;
      this.setData({ loading: false, error: err.message || "资料加载失败" });
    }
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const tempPath = e.detail.avatarUrl;
    if (!tempPath) return;
    this.setData({ uploading: true, error: "" });
    try {
      const result = await api.uploadAvatar(tempPath);
      this.setData({ uploading: false, avatarUrl: resolveImageUrl(result.url) || tempPath });
    } catch (err) {
      this.setData({ uploading: false, error: (err as ApiError).message || "头像上传失败" });
    }
  },

  onNicknameInput(e: WechatMiniprogram.Input) {
    this.setData({ nickname: e.detail.value, error: "" });
  },

  onGenderChange(e: WechatMiniprogram.RadioGroupChange) {
    this.setData({ genderIndex: Number(e.detail.value), error: "" });
  },

  onBirthdayChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ birthdayText: String(e.detail.value), error: "" });
  },

  async save() {
    const {
      nickname,
      originalNickname,
      avatarUrl,
      originalAvatar,
      genderIndex,
      originalGenderIndex,
      birthdaySet,
      birthdayText,
      saving,
      uploading,
    } = this.data;
    if (saving || uploading) return;

    const trimmed = nickname.trim();
    if (trimmed.length > 20) {
      this.setData({ error: "昵称最多 20 个字符" });
      return;
    }

    // 仅提交有变更的字段（生日只允许"首次设置"提交一次，锁定后页面不再提供入口）
    const patch: ProfileUpdateInput = {};
    if (trimmed !== originalNickname) patch.nickname = trimmed;
    if (avatarUrl && avatarUrl !== originalAvatar) patch.avatar = avatarUrl;
    if (genderIndex !== originalGenderIndex) {
      patch.gender = GENDER_OPTIONS[genderIndex].value;
    }
    if (!birthdaySet && birthdayText) patch.birthday = birthdayText;

    if (Object.keys(patch).length === 0) {
      wx.showToast({ title: "未修改任何内容", icon: "none" });
      return;
    }

    this.setData({ saving: true, error: "" });
    try {
      await api.updateProfile(patch);
      updateStoredUser({
        ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
        ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
      });
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        wx.navigateTo({ url: "/pages/login/login" });
        return;
      }
      this.setData({ error: err.message || "保存失败" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
