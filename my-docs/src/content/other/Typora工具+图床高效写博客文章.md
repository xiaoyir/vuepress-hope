# Typora工具+图床，写博客文章，效率翻倍！（附typora破解安装教程）



在之前的文章中，用github搭建免费图床，已经详细介绍如何用PicGo来上传图片至图床，PicGo及图床配置也可查看之前的文章。但是在写博客文章时，如果每次在用到图片时都亲自动手上传一遍再获取图片链接，显得很麻烦，验证影响写作效率。这里介绍如何利用typora+picgo图床工具，实现图片快速保存以及写作自由。

Typora 是一款支持实时渲染的 Markdown 编辑器，它允许用户在编辑文档时即时看到最终的排版效果，以其简洁的界面、直观的操作和强大的功能而受到许多用户的喜爱，不过需要破解安装。
## Typora安装
### 下载
首先需要从官网下载安装包，地址https://typoraio.cn/

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526181911.png)

依照提示安装，选择创建桌面快捷方式，最后去除勾选 Launch Typora ，点击 Finish，先不用启动。

### 获取破解工具
```
链接：https://pan.baidu.com/s/1OskC-tpql2C4p3tcBpNB1Q 
提取码：q9zt
```
里面有两个exe文件，复制这两个exe文件到 typora 的安装目录下。

在Typora的安装目录里打开命令行窗口，依次输入如下命令。
```
.\node_inject.exe
.\license-gen.exe
```
等待命令行输出序列号xxx。
```
License for you: xxx
```
### 输入序列号
打开 Typora，输入邮箱和刚生成的序列号，选择激活，提示激活成功！

不过有时候可能激活会提示Failed to write your license to local machine。这是因为没有权限写入注册表，需要设置。

按Windows+R打开运行窗口，输入regedit打开注册表，找到Typora，然后在Typora上右键，点权限，选中Administrtors，把权限全部设置为允许。点击确定之后再回来重新激活typora就可以了。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526181943.png)

## 图像偏好设置
点击typora界面左上角的文件，选择偏好设置，点击图像，上传服务设定为PicGo，记得提前安装好PicGo和配置图床服务。按下图中的选项设置好配置。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526182012.png)
## 图片验证
在typora随便新建个md文件，直接把图片复制粘贴，PicGo会自动将图片上传至图床，然后typora将转换后的url写入到文件中，图片正常展示，非常方便快捷。

![](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240526181732.png)

## 结语
图片秒传后，写文章一下子就舒畅了许多，小义习惯在typora写完博客后保存，在idea用git提交，希望能够对大家有所帮助。