import { api, ApiError } from "../../utils/api";
import type { AddressItem } from "../../utils/types";

type AddressErrorField = "recipient" | "phone" | "region" | "detail";

Page({
  data: {
    id: "",
    recipient: "",
    phone: "",
    region: "",
    regionArray: [] as string[],
    detail: "",
    isDefault: false,
    saving: false,
    loading: false,
    error: "",
    errorField: "" as "" | AddressErrorField,
  },

  async onLoad(query: Record<string, string | undefined>) {
    const id = query.id ?? "";
    wx.setNavigationBarTitle({ title: id ? "编辑地址" : "新增地址" });
    if (!id) return;
    this.setData({ id, loading: true });
    try {
      const data = await api.addresses();
      const address = data.addresses.find((a: AddressItem) => a.id === id);
      if (address) {
        this.setData({
          recipient: address.recipient,
          phone: address.phone,
          region: address.region,
          regionArray: address.region.split(/[\s,，]+/).filter(Boolean),
          detail: address.detail,
          isDefault: address.isDefault,
        });
      }
    } catch (e) {
      this.setData({ error: (e as ApiError).message || "地址加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRecipientInput(e: WechatMiniprogram.Input) {
    this.setData({ recipient: e.detail.value, error: "", errorField: "" });
  },

  onPhoneInput(e: WechatMiniprogram.Input) {
    this.setData({ phone: e.detail.value, error: "", errorField: "" });
  },

  onRegionChange(e: WechatMiniprogram.PickerChange) {
    const value = e.detail.value as string[];
    this.setData({
      regionArray: value,
      region: value.join(" "),
      error: "",
      errorField: "",
    });
  },

  onDetailInput(e: WechatMiniprogram.Input) {
    this.setData({ detail: e.detail.value, error: "", errorField: "" });
  },

  onDefaultChange(e: WechatMiniprogram.SwitchChange) {
    this.setData({ isDefault: e.detail.value, error: "", errorField: "" });
  },

  showFieldError(field: AddressErrorField, message: string) {
    this.setData({ error: message, errorField: field }, () => {
      wx.pageScrollTo({ selector: ".form-row-error", offsetTop: -140, duration: 250 });
    });
  },

  async save() {
    const { id, recipient, phone, region, detail, isDefault, saving } = this.data;
    if (saving) return;
    if (!recipient.trim()) {
      this.showFieldError("recipient", "请填写收货人姓名");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      this.showFieldError("phone", "请输入正确的手机号");
      return;
    }
    if (!region) {
      this.showFieldError("region", "请选择省市区");
      return;
    }
    if (!detail.trim()) {
      this.showFieldError("detail", "请填写详细地址");
      return;
    }

    this.setData({ saving: true, error: "", errorField: "" });
    try {
      const payload = {
        recipient: recipient.trim(),
        phone: phone.trim(),
        region,
        detail: detail.trim(),
        isDefault,
      };
      if (id) {
        await api.updateAddress(id, payload);
      } else {
        await api.createAddress(payload);
      }
      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 500);
    } catch (e) {
      this.setData({ error: (e as ApiError).message || "保存失败" });
    } finally {
      this.setData({ saving: false });
    }
  },
});
