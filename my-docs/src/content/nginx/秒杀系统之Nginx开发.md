# 秒杀系统之Nginx开发



# **1\. 技术概述**

###   

### **1.1 nginx介绍**

Nginx 最早被发明出来，就是来应对互联网高速发展下，出现的并发几十万、上百万的网络请求连接场景的，传统 Apache 服务器无法有效地解决这种问题，而 Nginx 却具有并发能力强、资源消耗低的特性。总的来说，Nginx 有 5 大优点，即模块化、事件驱动、异步、非阻塞、多进程单线程。


Nginx 是由一个 master 进程和多个 worker 进程（可配置）来配合完成工作的。其中 master 进程负责 Nginx 配置文件的加载和 worker 进程的管理工作，而 worker 进程负责请求的处理与转发，进程之间相互隔离，互不干扰。同时每个进程中只有一个线程，这就省去了并发情况下的加锁以及线程的切换带来的性能损耗。

以 Linux 为例，Nginx 的工作模型采用的是 epoll 模型（即事件驱动模型），该模型是 IO 多路复用思想的一种实现方式，是异步非阻塞的，什么意思呢？就是一个请求进来后，会由一个 worker 进程去处理，当程序代码执行到 IO 时，比如调用外部服务或是通过 upstream 分发请求到后端 Web 服务时，IO 是阻塞的，但是 worker 进程不会一直在这等着，而是等 IO 有结果了再处理，在这期间它会去处理别的请求，这样就可以充分利用 CPU 资源去处理多个请求了。所以一个线程也能支持高并发的业务场景。

以下是nginx配置文件nginx.conf的结构图：

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173034.png)
*   全局模块配置：这里一般配置 Nginx 的进程数、日志目录与级别、CPU 绑核等；

*   events 模块配置：主要配置 Nginx 使用的工作模型，进程连接数限制等；

*   HTTP 模块配置：这里就是处理 HTTP 请求的相关配置，包括监控的域名、端口、URL 以及业务代码的配置引用等。


###   

### **1.2 openResty介绍**

Nginx 的底层模块一般都是用 C 语言写的，如果我们想在 Nginx 的基础之上写业务逻辑，还得借助 OpenResty。OpenResty 是一个基于 Nginx 与 Lua 的高性能 Web 平台，它使我们具备在 Nginx 上使用 Lua 语言来开发业务逻辑的能力，并充分利用 Nginx 的非阻塞 IO 模型，来帮助我们非常方便地搭建能够处理超高并发、扩展性极高的动态 Web 应用、Web 服务和动态网关。

###   

### **1.3 lua介绍**

之所以用lua语言来做nginx的开发，是因为Lua 的线程模型是单线程多协程的模式，而 Nginx 刚好是单进程单线程，天生的完美搭档。同时 Lua 是一种小巧的脚本语言，语法非常的简单，很容易学习掌握。openresty为nginx提供了share dict共享字典的功能，可以在nginx的多个worker之间共享数据，实现缓存功能。
```
# 共享字典，也叫本地缓存，设置名称为item_cache，大小150m
lua_shared_dict item_cache 150m;
```


## **2\. 环境搭建**

使用idea基于windows系统，配置Lua+OpenResty+Nginx开发环境步骤如下：

###   

### **1.1 idea插件**

1.idea安装EmmyLua、nginx Support、OpenResty Lua Support这三个插件，然后重启。重启后EmmyLua和OpenResty Lua Support插件可能会提示有冲突，忽略即可，无需其他操作。



2.去OpenResty官网下载最新版本的OpenRestry：http://openresty.org/cn/download.html

本次下载的是openresty-1.21.4.1-win64.zip，然后解压。

###   

### **1.2 新建项目**

1.新建lua项目，需要安装完EmmyLua插件才会出现下图中的lua标志。

![img_1](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173052.png)

2.项目新建完成后，点击界面左上角的run -> Edit configutations，配置nginx server。需要配置成我们第一步安装的OpenResty中的nginx。

![img_2](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173107.png)

3.根目录下新建一个build.xml文件，文件代码如下，注意location="D:\\myUtils\\openresty-1.21.4.1-win64" 这个地方需要修改成openresty的安装目录：

```
<?xml version="1.0" encoding="UTF-8"?>
<project name="demo-nginx" default="dist" basedir=".">
    <description>
        run demo-nginx
    </description>
    <!-- set global properties for this build -->
    <property name="openresty-home" location="D:\myUtils\openresty-1.21.4.1-win64"/>
    <property name="conf" location="${basedir}/conf"/>
    <property name="src" location="${basedir}/src"/>
    <property name="target-conf" location="${openresty-home}/conf"/>
    <property name="target-src" location="${openresty-home}/${ant.project.name}"/>

    <echo>ant配置</echo>
    <target name="clean" depends="">
        <echo>清理openresty目录( ${dist}下的conf,logs,janus,januslib)</echo>
        <delete dir="${target-conf}"/>
        <delete dir="${target-src}"/>
        <delete>
            <fileset dir="${openresty-home}/logs" includes="*.log"></fileset>
        </delete>
    </target>

    <target name="init" depends="clean">
        <echo>创建安装目录</echo>
        <mkdir dir="${target-conf}"/>
        <mkdir dir="${target-src}"/>
    </target>

    <target name="dist" depends="init" description="generate the distribution" >
        <echo>复制安装文件</echo>
        <copy todir="${target-conf}">
            <fileset dir="${conf}"></fileset>
        </copy>
        <copy todir="${target-src}">
            <fileset dir="${src}"></fileset>
        </copy>
    </target>

</project>
```

4.选择idea右侧Ant Build，选择刚刚配置的build.xml文件，最后点击OK：

![img_3](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173543.png)
5.在nginx中配置Run Ant target，选择dist。另外由于ant需要JDK环境，所以需要指定项目的JDK版本。选择File->Project Structure，Project选择JDK1.8。

![img_4](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173629.png)
###   

### **1.3 运行与测试**

1.在项目根目录下新建conf文件夹，在该文件夹下新建nginx.conf文件，代码如下：

```
worker_processes 1; #工作进程数            
error_log logs/error.log error;#日志路径  日志级别            
events {            
    worker_connections 256;#单进程最大连接数            
}            
http {            
    lua_package_path "demo-nginx/?.lua;;";            
    #include demo-nginx/domain/domain.com;            
           
           
    server {            
        listen 7081;            
        server_name  localhost;            
        default_type text/html;            
        location = /favicon.ico {            
            log_not_found off;            
            access_log off;            
        }            
           
        location /sayhello {            
            content_by_lua_file demo-nginx/test.lua;            
        }            
    }            
}            
```

2.在项目根目录下src文件夹下新建test.lua文件，代码如下：

```
local function main()            
    ngx.say("Hello World")            
end            
           
main()  
```

3.最后项目整体结构大致如下，点击右上角的nginx运行程序。

![img_5](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173737.png)
4.访问页面验证，成功返回。
![img_7](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525173906.png)

## **3\. 功能扩展**

###   

### **3.1 限流配置**

#### 

#### **3.1.1 控制速率**
```
#限流配置定义            
limit_req_zone $binary_remote_addr zone=contentRateLimit:10m rate=2r/s;            
server {            
  listen       80;            
  server_name  localhost;            
  location /read_content {            
    #限流配置引用            
    limit_req zone=contentRateLimit burst=4 nodelay;            
    content_by_lua_file /root/lua/read_content.lua;            
  }            
}    
```


这里定义了一个名为 contentRateLimit 的限流规则，根据请求的服务器 IP 来做限流，限流的速率为同一个IP地址 1 秒内只允许 2 个请求通过，即500ms处理一个请求。

这里的 10m 表示该规则申请的内存大小为 10m。假如一个 binary_remote_addr 占用的内存大小为 16 字节，那么 10M 的内存大概可以处理单机 10\*1024\*1024/16=655360 个请求。

burst 译为突发、爆发，表示在超过设定的处理速率后能额外处理的请求数。此处，\*\*burst=4 \*\*，表示若同时有4个请求到达，Nginx 会处理第一个请求，剩余3个请求将放入队列，然后每隔500ms从队列中获取一个请求进行处理。若请求数大于4，将拒绝处理多余的请求，直接返回503.

不过，单独使用burst参数并不实用。假设 burst=50 ，rate为10r/s，排队中的50个请求虽然每100ms会处理一个，但第50个请求却需要等待 50 \* 100ms即 5s，这么长的处理时间自然难以接受。因此单纯的增加burst的值(与rate相比的值)，是没有意义的，这个值不会太大。因此，burst往往结合nodelay一起使用，nodelay 是被限流后的策略，意为不等待，直接返回。

#### 

#### **3.1.2 控制并发量(连接数)**

ngx_http_limit_conn_module提供了限制连接数的能力。主要是利用limit_conn_zone和limit_conn两个指令，利用连接数限制某一IP连接的数量来控制流量。注意并非所有连接都被计算在内，只有当服务器正在处理请求并且已经读取了整个请求头时，才会计算有效连接。

```
#限流配置定义            
limit_req_zone $binary_remote_addr zone=contentRateLimit:10m rate=2r/s;            
           
#根据ip地址来限制并发数，内存大小为10M            
limit_conn_zone $binary_remote_addr zone=addr:10m;            
server {            
  listen       80;            
  server_name  localhost;            
           
  location /limit {            
    limit_conn addr 2;  #表示同一个地址只允许连接2次            
    proxy_pass http://192.168.12.1:9090;            
  }            
           
  location /read_content {            
    #限流配置引用            
    limit_req zone=contentRateLimit burst=4 nodelay;            
    content_by_lua_file /root/lua/read_content.lua;            
  }            
}           
```

图中设置访问某个后台请求http://192.168.12.1:9090/limit，同一IP只允许最大并发量为2。可在后台代码中设置休眠时间，方便测试。利用Jmeter验证，开3个线程的时候会发生异常，开2个就正常（测试结果略）。

```
@GetMapping("/limit")            
public String limit(){            
    System.out.println("休眠开始:"+Thread.currentThread().getId());            
    try {            
        Thread.sleep(1000);            
    } catch (InterruptedException e) {            
        e.printStackTrace();            
    }            
    System.out.println("休眠结束:"+Thread.currentThread().getId());            
    //业务逻辑代码            
    //...            
    return "success";            
} 
```

另外在限制每个客户端IP与服务器的并发连接数的同时，可限制所有客户端与服务器的总连接数。

```
limit_conn_zone $binary_remote_addr zone=perip:10m;            
limit_conn_zone $server_name zone=perserver:10m;            
server {              
  listen       80;            
  server_name  localhost;            
  charset utf-8;            
  location / {            
    limit_conn perip 10; #单个客户端ip与服务器的连接数．            
    limit_conn perserver 100; ＃限制所有客户端与服务器的总连接数            
      root   html;            
    index  index.html index.htm;            
  }            
}    
```

###   

### **3.2 lua实践**

下面通过模拟用户抢购商品下单时的场景，利用user_id限流，实现nginx结合lua的二次开发。交互时序图大致如下：

![img_8](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525174010.png)
1.配置set_common_var.lua脚本文件。

```
--通过请求URL获取st(security token)并赋值给变量st            
local param_st = ngx.var.arg_st            
if param_st == null then            
  param_st = ""            
end            
ngx.var.st = param_st            
--通过请求URL获取产品编码，并赋值给变量product_id            
local param_product_id = ngx.var.arg_productId            
if param_product_id == nil then            
  param_product_id = ""            
end            
ngx.var.product_id = param_product_id            
--通过cookie获取用户ID并赋值给user_id            
local user_id = ngx.var.cookie_user_id            
if user_id == nil then            
  user_id = ""            
end            
--打印值            
ngx.log(ngx.ERR,"---- user id is : "..user_id)            
return user_id        
```

如果请求url=http://127.0.0.1:8080/domain/test?st=09876tryu54321&productId=202210104591，则上图中的变量ngx.var.st=09876tryu54321，ngx.var.product_id=202210104591。nginx中的变量说明如下：

![img.png](秒杀系统之Nginx开发/configParam.png)
2.配置nginx.conf，在根目录下新建html文件夹，新建page.html和html_fail.html静态文件模拟请求。

```
log_format access '$remote_addr - $remote_user [$time_local] "$request" $status '            
    '"$upstream_addr" "$upstream_status" "$upstream_response_time" userId:"$user_id"';            
#限流规则            
limit_req_zone $user_id zone=limit_by_user:10m rate=1r/s;            
server {              
  listen       7081;            
  error_log  D://logs/domain-error.log error;            
  access_log  D://logs/domain-access.log access;            
  server_name  localhost;            
  default_type text/html;            
  set $st "";        
  set $product_id "";            
  set_by_lua_file $user_id D://2020CRPrograms/demo-nginx/lua/set_common_var.lua;            
  location /query {            
    limit_req zone=limit_by_user nodelay;            
    #proxy_pass http://xx.xx.xx.xx;            
    #设置返回的header,并将security token放在headers中            
    header_filter_by_lua_block{            
      -- 这里st的只是简单地将用户ID+时序图中的步骤编号做了MD5，生产上应加入商品编号、自定义加密key等            
      ngx.header["st"] = ngx.md5(ngx.var.user_id.."1")            
      ngx.header["Access-Control-Expose-Headers"] = "st"            
    }            
    rewrite_by_lua_block{            
        local function main()            
            ngx.say("请求成功，请继续下一步操作.")            
        end            
        main()            
    }            
  }            
           
  location /prePage {            
    default_type text/html;            
    rewrite_by_lua_block{            
      --先检验st            
      local _st = ngx.md5(ngx.var.user_id.."1")            
      --检验不通过时，以500状态码，返回对应错误页            
      if _st ~= ngx.var.st then            
        ngx.log(ngx.ERR,"st is not valid!")            
        return ngx.exit(500)            
      end            
      --检验通过时，再生成个新的st，用于下个接口校验            
      local new_st = ngx.md5(ngx.var.user_id.."2")            
      --ngx.exec执行内部跳转，浏览器url不会发生改变            
      --ngx.redirect(url,status)重定向，其中status为301或302            
      local redirect_url = "/page".."?productId="..ngx.var.product_id.."&st="..new_st            
      return ngx.redirect(redirect_url,302)            
    }            
    error_page 500 502 504 /html_fail.html;            
  }            
           
  location /page {            
    default_type text/html;            
    #proxy_pass http://xx.xx.xx.xx;            
    alias D://2020CRPrograms/demo-nginx/html;            
    index page.html;            
    error_page 500 502 504 /html_fail.html;            
  }            
           
  location = /html_fail.html{            
      default_type text/html;            
      root D://2020CRPrograms/demo-nginx/html;            
  }            
}           
```

这里根据user_id设置了限流规则，配置了四个location，访问的是静态页面，实际开发中应代理至后台。

![queryUrl](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525174104.png)
最后整体项目结构如下，项目地址https://github.com/xiaoyir/demo-nginx.git

![img_9](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525174031.png)
使用postman进行验证，访问query请求成功返回security token：st=aaa42296669b958c3cee6c0475c8093e


请求头添加返回的token，访问prePage请求，成功返回page页面。

![img_10](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525174041.png)

