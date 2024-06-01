# 将域名托管到Cloudflare



使用 Github Pages 可以很方便地搭建个人博客静态网站，但在国内访问速度不佳，而且网站访问地址都是xxx.github.io/xxx，也没有体现个性化，可以考虑通过自定义域名+Cloudflare来提升静态资源的访问速度。

## 自定义域名
自定义域名这里以腾讯云为例，得现在腾讯云平台购买一个域名，然后进入云解析DNS，设置域名解析。

添加两条记录，第一条类型为A，主机记录为@，记录值185.199.108.153，不确定的话可以ping自己的username.github.io看一下；第二条记录类型为CNAME，主机记录为www, 记录值为username.github.io。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240527012821.png)
保存之后在github的静态网站仓库里就会有一个CHAME文件，没有就新建一个，里面写上自己购买的域名。

点击仓库的Setting，左侧找到Pages，在custom domain里面输入自定义的域名，然后勾选Enforce HTTPS，加密更安全。

## 将域名托管到Cloudflare

进入Cloudflare官网注册账号后，点击右上角的add site添加站点。输入要托管的域名，套餐选择free免费版，点击继续。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240527012837.png)

Cloudflare会扫描域名原有的DNS记录并复制过来，先不用添加新的记录，点击继续，找到Cloudflare提供的NameServer。

回到域名管理控制台，选择修改DNS服务器，自定义DNS，填上Cloudflare给的DNS地址，提交。

![](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240527012729.png)
回到Cloudflare，点完成。大概等几分钟，在首页，添加的域名显示active（有效），即已激活。

在网站管理页，添加DNS记录，开启代理。
![](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240527012730.png)

至此，已完成将域名托管到Cloudflare平台。试着用新域名访问静态网站，可以发现速度快了许多。

