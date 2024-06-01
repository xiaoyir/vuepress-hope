<!-- .vuepress/components/BlogHero.vue -->
<script setup lang="ts">
import BlogHero from "vuepress-theme-hope/blog/components/BlogHero.js";
import BingHeroBackground from "vuepress-theme-hope/presets/BingHeroBackground.js";
import HitokotoBlogHero from "vuepress-theme-hope/presets/HitokotoBlogHero.js";
</script>

<template>
  <BlogHero>
    <template #bg>
<!--      <BingHeroBackground />-->
<!--      <div class="vp-blog-mask" style="background: url(https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/2024/06/01/13-28-44-aaa00a33b57f92a7445e2695964a5aec-xyr-blogbg-990121.png) center center / cover no-repeat;">-->
<!--      </div>-->
      <div class="vp-blog-mask" style="background: url(/assets/images/blogbg.jpeg) center center / cover no-repeat;">
      </div>
    </template>
    <template #info="info">
      <HitokotoBlogHero v-bind="info" />
    </template>
  </BlogHero>
</template>