# 手写RPC框架，一小时足矣！

## 一、项目结构

RPC即远程过程调用，也叫远程方法调用，RPC框架可以实现调用方可以像调用本地方法一样调用远程服务的方法。要了解微服务和分布式，RPC必不可少，话不多说，下面直接开整。

环境：JDK1.8，Intellij idea. 新建rpc maven项目，分别创建comsumer、provider、provider-com、rpc-framework四个maven项目子模块，其中provider和provider-com都属于方法提供者，用来模拟远程服务，下面一一介绍。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180521.png)

## 二、框架封装

### 1\. maven依赖

rpc-framwork是框架的核心，需要处理网络请求，这里引入内嵌tomcat，通过http协议来实现远程过程调用。具体pom.xml文件如下：

```
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <parent>
        <artifactId>rpc</artifactId>
        <groupId>org.example</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <modelVersion>4.0.0</modelVersion>

    <artifactId>rpc-framework</artifactId>


    <dependencies>
        <dependency>
            <groupId>org.apache.tomcat.embed</groupId>
            <artifactId>tomcat-embed-core</artifactId>
            <version>9.0.69</version>
        </dependency>

        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-io</artifactId>
            <version>1.3.2</version>
        </dependency>
    </dependencies>
</project>
```

### 2.模块结构

![img_1](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180532.png)

### 3.common包

该包存放公共的实体，新建Invocation类用来存放接口信息， URLInfo类存放服务器信息。

```
//Invocation
public class Invocation implements Serializable {
    private String interfaceName;
    private String methodName;
    private Class[] parameterTypes;
    private Object[] parameters;
    private String version;

    public Invocation(String interfaceName, String methodName, Class[] parameterTypes, Object[] parameters) {
        this.interfaceName = interfaceName;
        this.methodName = methodName;
        this.parameterTypes = parameterTypes;
        this.parameters = parameters;
    }
    //...
}


//URLInfo
public class URLInfo implements Serializable {
    private String host;
    private Integer port;

    public URLInfo(String host, Integer port) {
        this.host = host;
        this.port = port;
    }
    //...
}
```

### 4.loadBalance包

该包存放负载均衡的一些算法实现。一般服务都会多节点部署，rpc框架需要通过负载均衡算法来决定消费者要调用哪一个服务的具体方法。这里只是简单的实现一个随机算法，实际的rpc框架如dubbo、spring Cloud的负载均衡实现都要复杂得多的多。

```
public class LoadBalanceRandom {

    public static URLInfo random(List<URLInfo> list) {
        Random random = new Random();
        int i = random.nextInt(list.size());
        return list.get(i);
    }
}
```

### 5.protocol

顾名思义，protocol 包用来处理协议的交互逻辑。首先新建一个HttpServer类用来启动tomcat服务。

```
public class HttpServer {

    public void start(String hostname, Integer port) {
        Tomcat tomcat = new Tomcat();
        Server server = tomcat.getServer();
        Service service = server.findService("Tomcat");
        Connector connector = new Connector();
        connector.setPort(port);
        Engine engine = new StandardEngine();
        engine.setDefaultHost(hostname);
        StandardHost host = new StandardHost();
        host.setName(hostname);
        String contextPath = "";
        Context context = new StandardContext();
        context.setPath(contextPath);
        context.addLifecycleListener(new Tomcat.FixContextListener());
        host.addChild(context);
        engine.addChild(host);
        service.setContainer(engine);
        service.addConnector(connector);

        tomcat.addServlet(contextPath, "dispatcher", new DispatchServlet());
        context.addServletMappingDecoded("/*", "dispatcher");
        try {
            tomcat.start();
            tomcat.getServer().await();
        } catch (LifecycleException e) {
            e.printStackTrace();
        }
    }
}
```

接着新建DispatchServlet和HttpServerHandler处理http请求。

```
//DispatchServlet 
public class DispatchServlet extends HttpServlet {

    @Override
    protected void service(HttpServletRequest req, HttpServletResponse resp) {
        new HttpServerHandler().handler(req, resp);
    }
}


//处理接收到的http请求
public class HttpServerHandler {

    public void handler(HttpServletRequest req, HttpServletResponse resp) {
        Invocation invocation = null;
        try {
            invocation = (Invocation) new ObjectInputStream(req.getInputStream()).readObject();
            String interfaceName = invocation.getInterfaceName();
            Class classImpl = LocalRegister.get(interfaceName + "v1.0");
            Method method = classImpl.getMethod(invocation.getMethodName(), invocation.getParameterTypes());
            String result = (String) method.invoke(classImpl.newInstance(), invocation.getParameters());
            IOUtils.write(result, resp.getOutputStream());
        } catch (IOException e) {
            e.printStackTrace();
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        } catch (NoSuchMethodException e) {
            e.printStackTrace();
        } catch (IllegalAccessException e) {
            e.printStackTrace();
        } catch (InstantiationException e) {
            e.printStackTrace();
        } catch (InvocationTargetException e) {
            e.printStackTrace();
        }

    }
}
```

最后建一个http客户端，用来发送请求

```
import java.net.URL;
//发送http请求
public class HttpClient {

    public <T> T send(String hostName, Integer post, Invocation invocation) throws IOException {
        try {
            URL url = new URL("http", hostName, post, "/");
            //打开连接
            HttpURLConnection urlConnection = (HttpURLConnection)url.openConnection();
            urlConnection.setRequestMethod("POST");
            urlConnection.setDoOutput(true);

            OutputStream outputStream = urlConnection.getOutputStream();
            ObjectOutputStream objectOutputStream = new ObjectOutputStream(outputStream);
            //通过对象输出流，将invocation对象序列化并写入到输出流中，发送给服务器
            objectOutputStream.writeObject(invocation);
            objectOutputStream.flush();
            objectOutputStream.close();

            //获取服务器返回结果
            InputStream inputStream = urlConnection.getInputStream();
            String s = IOUtils.toString(inputStream);
            return (T) s;
        } catch (MalformedURLException e) {
            e.printStackTrace();
        } catch (IOException e) {
            throw e;
        }
        return null;
    }
}
```

### 6.proxy包

消费者在结合rpc框架之后，不需要像发送http请求调用服务端接口那么麻烦去调远程的方法，而是可以通过代理来实现，把麻烦的东西统统丢给框架，

```
public class ProxyFactory {

    public static <T> T getProxy(final Class interfaceClass) {
        Object o = Proxy.newProxyInstance(interfaceClass.getClassLoader(), new Class[]{interfaceClass}, new InvocationHandler() {

            public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
                Invocation invocation = new Invocation(interfaceClass.getName(), method.getName(), method.getParameterTypes(), args);
                HttpClient httpClient = new HttpClient();
                //服务发现
                List<URLInfo> urlInfos = RemoteRegister.get(interfaceClass.getName());
                //服务调用, 服务重试
                List<URLInfo> invokeList = new ArrayList<>();
                Object result = null;
                int max = 3;
                while (max > 0) {
                    //负载均衡
                    urlInfos.remove(invokeList);
                    URLInfo urlInfo = LoadBalanceRandom.random(urlInfos);
                    invokeList.add(urlInfo);
                    try {
                        result = httpClient.send(urlInfo.getHost(), urlInfo.getPort(), invocation);
                        return result;
                    } catch (Exception e) {
                        if (--max != 0) {
                            System.out.println("服务异常，正在重试");
                            continue;
                        }
                        //e.printStackTrace();
                        return "服务调用出错";
                    }
                }
                return result;
            }
        });
        return (T) o;
    }
}
```

### 7.register

注册分本地注册和注册中心注册，本地注册存放接口名和接口实现类的映射，注册中心注册存放接口名和ip地址的映射。一般注册中心可以通过redis、zookeeper、nacos等来实现，其目的是将服务提供方暴露给消费者，这里简化方式，通过读取本地文件来实现。

```
public class LocalRegister {

    private static Map<String, Class> map = new HashMap<>();

    public static void register(String interfaceName, String version, Class implClass) {
        map.put(interfaceName + "v" + version, implClass);
    }

    public static Class get(String interfaceName) {
        return map.get(interfaceName);
    }
}
public class RemoteRegister {

    private static Map<String, List<URLInfo>> map = new HashMap<>();

    public static void register(String interfaceName, URLInfo urlInfo) {
        List<URLInfo> urlInfos = map.get(interfaceName);
        if (urlInfos == null){
            urlInfos = new ArrayList<>();
        }
        urlInfos.add(urlInfo);
        map.put(interfaceName, urlInfos);

        saveFile();
    }

    public static List<URLInfo> get(String interfaceName) {

        map = getFile();

        return map.get(interfaceName);
    }

    private static void saveFile() {
        try {
            FileOutputStream fileOutputStream = new FileOutputStream("/temp.txt");
            ObjectOutputStream objectOutputStream = new ObjectOutputStream(fileOutputStream);
            objectOutputStream.writeObject(map);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static Map<String, List<URLInfo>> getFile() {
        try {
            FileInputStream fileInputStream = new FileInputStream("/temp.txt");
            ObjectInputStream objectInputStream = new ObjectInputStream(fileInputStream);
            return (Map<String, List<URLInfo>>) objectInputStream.readObject();
        } catch (IOException e) {
            e.printStackTrace();
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        }
        return null;
    }
}
```

### 8.封装启动类

```
public class Bootstrap {

    private String host;

    private Integer port;

    public Bootstrap(String host, Integer port) {
        this.host = host;
        this.port = port;
    }

    public void start() {
        HttpServer httpServer = new HttpServer();
        httpServer.start(host, port);
    }

    public <T> void localRegister(Class<T> clazz, String version, Class<? extends T> clazzImpl) {
        //本地注册 <接口名,接口实现类>
        LocalRegister.register(clazz.getName(),version, clazzImpl);

    }

    public <T> void remoteRegister(Class<T> clazz) {
        //注册中心注册 <接口名, ip地址>
        URLInfo urlInfo = new URLInfo(host, port);
        RemoteRegister.register(clazz.getName(), urlInfo);
    }
}
```

## 三、方法提供者

### 1.provider-com模块

该模块用来放置对外接口，即从provider模块中抽离出可供外部调用的服务接口，不存放其他内容，方便消费者引用。

![img_2](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180551.png)

```
public interface SampleService {

    String milk(String brand);
}
```

### 2.provider模块

pom.xml引入provider-com和rpc-framework依赖包

```
    <dependencies>
        <dependency>
            <groupId>org.example</groupId>
            <artifactId>provider-com</artifactId>
            <version>1.0-SNAPSHOT</version>
        </dependency>

        <dependency>
            <groupId>org.example</groupId>
            <artifactId>rpc-framework</artifactId>
            <version>1.0-SNAPSHOT</version>
        </dependency>
    </dependencies>
```

```
//接口实现类
public class SampleServiceImpl implements SampleService {

    public String milk(String brand) {
        return "make "+ brand + " milk";
    }
}
```

```
//服务启动类
public class Provider {

//    public static void main(String[] args) {
//        //本地注册
//        LocalRegister.register(SampleService.class.getName(),"1.0", SampleServiceImpl.class);
//        //LocalRegister.register(SampleService.class.getName(),"2.0", SampleServiceImpl2.class);
//        //注册中心注册
//        URLInfo urlInfo = new URLInfo("localhost",8080);
//        RemoteRegister.register(SampleService.class.getName(), urlInfo);
//
//        HttpServer httpServer = new HttpServer();
//        httpServer.start(urlInfo.getHost(),urlInfo.getPort());
//    }

    public static void main(String[] args) {
        Bootstrap bootstrap = new Bootstrap("localhost", 8080);
        bootstrap.localRegister(SampleService.class, "1.0", SampleServiceImpl.class);
        bootstrap.remoteRegister(SampleService.class);
        bootstrap.start();
    }
}
```

## 四、方法消费者

同样引入provider-com和rpc-framework依赖包，然后通过代理来调用provider模块中SampleService的milk方法。

```
public class Consumer {
    public static void main(String[] args) {
        SampleService proxy = ProxyFactory.getProxy(SampleService.class);
        String blue = proxy.milk("yili");
        System.out.println(blue);
    }
}
```

## 五、远程调用

通过以上四大步骤，rpc框架代码已写完毕，启动provider，打印出tomcat日志说明服务正常运行。

![img_3](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180602.png)

接着启动comsumer，可以看到远程方法已被调用

![img_4](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180609.png)

## 六、总结

在上述项目中，当生产者模块启动服务时，就已经将自己注册到了注册中心中，消费费者这边通过ProxyFactory，会生成一个生产者对外暴露的接口类的代理对象，包含具体的服务器IP地址。当consumer调用provider接口时，rpc框架就会利用httpClient向生产者发起http请求。而生产者这边同样通过框架对http做了接收处理，请求最终会走到HttpServerHandler中，执行具体的方法调用，然后返回结果。