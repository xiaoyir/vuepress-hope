# 用github搭建免费的私人图床，白嫖真香



大家好，我是小义。最近在弄个人博客网站，参考了一些前辈们的作品，发现大家存储图片的时候都是用的对外链接，不需要引用图片的相对路径，这样一篇博客文章只需要一个markdown格式的文件来保存就可以了，确实很方便。

存放图片的地方就是图床，是一个网络服务，用户在上面上传图片后，可以获取图片的链接，这个链接可以被用来在其他网站或服务中引用这些图片。图床可以满足用户在多个地方重复使用同一张图片，省时又省心，通常用于博客、论坛、社交媒体等平台，因为这些平台可能没有提供足够的存储空间来上传图片。话不多说，接下来教大家用github搭建一个免费的私人图床。

## 仓库配置

### 新建仓库
在github上新建一个空的仓库，权限选public公开。

### 生成token
生成一个自己github账号的token令牌，点击右上角头像->Settings->左侧底部Developer settings->Personal Access tokens->tokens->Generate New Token，后续需要用到（已有的请忽略）。token秘钥只显示一次，请妥善保存。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526101825.png)

## PicGo图床工具
### 下载安装
有了仓库，还需要一个快捷上传图片和生成链接的工具——PicGo。PicGo是一款开源的图床管理工具，支持多种图床服务，包括但不限于 GitHub、阿里云 OSS、腾讯云 COS、七牛云、SM.MS 等，它可以帮助用户方便地将图片上传到各种图床服务中。工具下载地址：https://github.com/Molunerfinn/PicGo/releases。windows就是选择64位exe下载。

### 配置github图床
安装完成后看到如下界面，点击github图床配置参数，设为默认图床，点击确定。
![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526101848.png)

### 验证图片上传
回到上传区，链接格式选markdown，选择所要上传的图片。

![](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526095646.png)


等待一会提示上传成功，可在相册中查看图片链接，放到浏览器中可以正常访问。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526101926.png)
### super-prefix插件设置

如果图片上传过多，文件命名就会比较杂乱，在PicGo上通过安装super-prefix插件，可以优雅地生成文件存储路径。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526101941.png)
安装好插件后，点击设置小图标，选择配置plugin，可按如下参数设置路径，这样文件在仓库下的存储路径就会是形如/img/hello/20240525180647.png的格式。
![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526101957.png)

## 结语
至此，私人图床的服务就已经弄好了，通过PicGo工具可以方便的实现图片上传。