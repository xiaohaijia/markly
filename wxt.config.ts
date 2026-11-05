import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      manifest.host_permissions = ["file:///*"];
    },
  },
  manifest: {
    name: "Markly · 网页批注",
    description: "给网页加一层你的思考。圈、划、写、找，所有批注保存在本地。",
    permissions: ["activeTab", "scripting", "storage"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    host_permissions: ["file:///*"],
    action: { default_title: "启用 Markly" },
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    minimum_chrome_version: "120",
  },
});
