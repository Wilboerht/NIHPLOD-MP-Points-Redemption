Component({
  options: {
    virtualHost: true,
  },

  externalClasses: ["custom-class"],

  properties: {
    src: {
      type: String,
      value: "",
    },
    mode: {
      type: String,
      value: "aspectFill",
    },
    lazy: {
      type: Boolean,
      value: false,
    },
    fallback: {
      type: String,
      value: "NIHPLOD",
    },
    alt: {
      type: String,
      value: "",
    },
  },

  data: {
    failed: false,
  },

  observers: {
    src() {
      this.setData({ failed: false });
    },
  },

  methods: {
    onError() {
      this.setData({ failed: true });
    },
  },
});
