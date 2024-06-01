import { defineClientConfig } from "vuepress/client";
import { setupTransparentNavbar } from "vuepress-theme-hope/presets/transparentNavbar.js";
import { setupRunningTimeFooter } from "vuepress-theme-hope/presets/footerRunningTime.js";
import { setupSnowFall } from "vuepress-theme-hope/presets/snowFall.js";

export default defineClientConfig({
    setup: () => {
        setupTransparentNavbar({ type: "homepage" });
        setupRunningTimeFooter(
            new Date("2022-01-01"),
            {
                "/": "Running time: :day days :hour hours :minute minutes :second seconds",
                "/zh/": "已运行 :day 天 :hour 小时 :minute 分钟 :second 秒",
            },
            true,
        );
        //雪花特效
        //setupSnowFall();
    },
});