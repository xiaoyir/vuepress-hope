---
title: Java21新特性
index: false
icon: laptop-code
category:
  - java
---
# Spring正式弃用Java 8，还不赶紧学Java 21!

## Java 8被弃用了

作为Java开发程序员，相信大家都对spring框架很熟悉，无论是搭建微服务还是开发web应用，都离不开spring全家桶。但是Spring官方最近整了个大活，他们弃用Java 8 了！


Spring Framework从6.0版本开始，IntelliJ IDEA从2023.3版本开始，Spring Boot从3.0版本开始，这三个都不再支持JDK 1.8，而是需要JDK 17或更高版本。这对于能用就用，不能用再换，喜欢使用Java 8 的大多数程序员来说，简直是晴天霹雳，这就好比你本来已经习惯了用筷子夹肉，突然筷子换成了刀叉，工具不一样总是会让人膈应。

从Spring boot的脚手架官网中，地址https://start.spring.io/可以看出，spring initializr中确实没有了Java 8，真是时代抛弃你，招呼都不打一声。

![spring-init](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525165018.png)
## 要不要换，该不该换

不过大家也不用慌，可以改用阿里云的脚手架https://start.aliyun.com/，或者自己从0到1搭建适配java8版本的springboot项目都是可以的，相信这些也都难不倒各位大佬们。

但是java如今都已经迭代到21版本了，也引入了很多新的特性，做了不少提升性能的改进，为什么国外都推荐使用java17或java21，但是国内还是喜欢用java8呢？

首先一个就是历史原因，维护老项目，Java 8确实是一个非常稳定和成熟的版本，拥有很好的生态和兼容性，可以满足大多数公司的使用需求，就连小义现在负责的项目，也是使用的java 8 。其次就是成本和风险，Java 8之后的版本都有一些破坏性的变化，比如模块化、弃用和移除一些API等，升级有安全隐患。这些或许是国内很多公司没有选择升级JDK的原因吧。

然而Spring官方代表的就是权威，总不能一直苟着用java8吧。很重要的一点是，Java 8的支持时间已经接近尾声，将于2030年结束，而Java 17和Java 21都是长期支持（LTS）版本，可以得到更长时间的维护和更新，而不是每半年就换一个版本。另外Java 17和Java 21都与云原生和微服务的发展趋势相适应，可以让Java应用更容易地部署和管理在云端，也可以利用模块化和AOT等技术，减少Java应用的体积和启动时间。现实就是这么残酷。


在15、16年的时候，java8还是很新的，那时候也很多人说要坚守java7，结果呢，还不是被淘汰了。前几年，新兴的go语言因为具备java8所没有的一些特性，比如更轻量级的线程——协程，而大受青睐，不少大佬还不惜一切代价从底层翻新，把项目从java换成了go。也正因编程语言之间的相互竞争，java才能不断迭代更新自我完善，在21版本也引入了虚拟线程来支持类似于go协程的这一高性能实现方式。

## Java 21新特性

所以技术还是要学的，不能固步自封，还是先来熟悉一下java21在代码方面都新增了哪些特性吧。

### 1、序列集合

是一种表示按照预定义的顺序排列的元素的集合的接口，可以提供更统一和高效的操作。例如，创建一个有序的集合可以使用SequencedSet接口，并使用first()和last()方法来获取第一个和最后一个元素，或者使用reverseIterator()方法来逆序遍历集合。
```
// 创建一个有序的集合  
SequencedSet<String> names = new LinkedHashSet<>();  
names.add("Alice");  
names.add("Bob");  
names.add("Charlie");

// 获取第一个和最后一个元素  
System.out.println(names.first()); // Alice  
System.out.println(names.last()); // Charlie

// 逆序遍历集合  
for (String name : names.reverseIterator()) {  
System.out.println(name);  
}  
// Charlie  
// Bob  
// Alice
```


### 2、分代ZGC

是一种将Z垃圾回收器扩展为维护年轻对象和年老对象的独立生成的功能，可以提高应用程序性能和内存利用率。要启用分代 ZGC，可以使用-XX:+UseZGC -XX:+ZGenerational选项。

### 3、记录模式

是一种用于解构记录值的模式匹配功能，可以嵌套记录模式和类型模式，实现数据导航和处理。例如，可以使用记录模式来匹配一个记录类型的对象，并提取其中的组件值。
```
// 定义一个记录类型  
record Point(int x, int y) {}  
// 创建一个记录对象  
Point p = new Point(10, 20);  
// 使用记录模式匹配记录对象，并提取组件值  
if (p instanceof Point(int x, int y)) {  
System.out.println(x + y); // 30  
}
```


### 4、switch 模式匹配

是一种用于switch表达式和语句的模式匹配功能，可以针对多个模式测试表达式，每个模式都有一个特定的操作，实现复杂的面向数据的查询。例如，可以使用switch模式匹配来根据不同的类型和值进行格式化。

```
// 定义一个格式化的方法，使用switch模式匹配
static String formatterPatternSwitch(Object obj) {
    return switch (obj) {
        case Integer i -> String.format("int %d", i);
        case Long l -> String.format("long %d", l);
        case Double d -> String.format("double %f", d);
        case String s -> String.format("String %s", s);
        default -> obj.toString();
    };
}
// 调用格式化的方法
System.out.println(formatterPatternSwitch(10)); // int 10
System.out.println(formatterPatternSwitch(10L)); // long 10
System.out.println(formatterPatternSwitch(10.0)); // double 10.000000
System.out.println(formatterPatternSwitch("Hello")); // String Hello
```
### 5、虚拟线程

本次升级重中之重，是一种轻量级线程的功能，可以显著减少编写、维护和观察高吞吐量并发应用程序的工作量。虚拟线程可以使用Thread.ofVirtual()方法来创建，并使用start()方法来启动，与普通线程的用法类似，但是虚拟线程不需要使用线程池来复用，也不需要使用同步机制来避免竞争，而是可以自动调度和管理。
```
// 创建一个虚拟线程  
Thread vt = Thread.ofVirtual().start(() -> {  
System.out.println("Hello from virtual thread");  
});  
// 等待虚拟线程结束  
vt.join();
```


### 6、密钥封装机制API

是一种用于密钥封装机制的API，这是一种使用公钥加密来保护对称密钥的加密技术。例如，可以使用KeyAgreement类来实现密钥封装机制，如下所示：

```
// 生成公钥和私钥
KeyPairGenerator kpg = KeyPairGenerator.getInstance("EC");
kpg.initialize(256);
KeyPair kp = kpg.generateKeyPair();
PublicKey pub = kp.getPublic();
PrivateKey priv = kp.getPrivate();
// 生成对称密钥
KeyGenerator kg = KeyGenerator.getInstance("AES");
kg.init(256);
SecretKey sk = kg.generateKey();
// 使用公钥加密对称密钥
KeyAgreement ka = KeyAgreement.getInstance("ECDH");
ka.init(priv);
ka.doPhase(pub, true);
byte[] wrapped = ka.wrap(sk);
// 使用私钥解密对称密钥
ka.init(priv);
ka.doPhase(pub, true);
SecretKey unwrapped = (SecretKey) ka.unwrap(wrapped, "AES", Cipher.SECRET_KEY);
```