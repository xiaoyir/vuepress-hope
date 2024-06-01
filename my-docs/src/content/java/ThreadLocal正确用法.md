# 你真的会用ThreadLocal吗

### 先来解释一下什么是ThreadLocal？



一句话理解，threadlocal是作为当前线程中属性ThreadLocalMap集合的某一个Entry的key值（Entry的key是ThreadLocal，value是要存储的副本变量），不同的线程所拥有的ThreadLocalMap是互相隔离的。



### ThreadLocal为什么建议用static修饰？



static修饰的变量是在类在加载时就分配地址了，在类卸载才会被回收，如果变量ThreadLocal是非static的话就会造成每次生成实例都要生成不同的ThreadLocal对象，虽然这样程序虽然不会有什么异常，但是会浪费内存资源。



### 什么场景适合使用ThreadLocal呢？



当每个线程需要有自己单独的变量副本，或者说变量需要在多个方法中共享但不希望被多线程共享的时候，就适合使用threadlocal。例如用threadlocal来保存当前用户的登录信息。



### ThreadLocal的传递性如何实现？



对于业务系统来说，用户登录了之后，后端可以通过拦截器将用户信息这一变量存在threadlocal中。但是在使用线程池时，其他线程的threadlocal在不重新赋值的情况下就取不到用户信息。怎么实现父子线程之间这一变量的传递呢？难道只能通过参数传值吗？有没有更加优雅的方式呢？这就要涉及JDK的InheritableThreadLocal和阿里巴巴的TransmittableThreadLocal。  
InheritableThreadLocal可以实现子线程继承父线程的threadlocal，但是有坑，在线程池中因为线程的复用性，子线程就无法有效继承。而使用TransmittableThreadLocal就很好的解决这一问题，注意要引入以下依赖包。



```
        <dependency>
            <groupId>com.alibaba</groupId>
            <artifactId>transmittable-thread-local</artifactId>
            <version>2.12.0</version>
        </dependency>
```



### 代码验证




2.  InheritableThreadLocal 的父子线程传递性




```
public class ThreadLocalTest {
    private static ThreadLocal<UserVO> userThreadLocal = new ThreadLocal<>();
    private static ThreadLocal<UserVO> inheritableuserThreadLocal = new InheritableThreadLocal<>();
    private static ThreadLocal<UserVO> ttluserThreadLocal = new TransmittableThreadLocal<>();

    /**
     * 验证 InheritableThreadLocal 的父子线程传递性
     */
    @Test
    public void inheritableThreadTest() throws InterruptedException {
        inheritableuserThreadLocal.set(new UserVO().setName("main-T"));
        System.out.println("M:"+inheritableuserThreadLocal.get());
        Thread thread = new Thread(() -> {
            System.out.println("S:"+inheritableuserThreadLocal.get());
            inheritableuserThreadLocal.set(new UserVO().setName("child").setAge("20"));
            //inheritableuserThreadLocal.get().setName("child").setAge("20");
            System.out.println("S:"+inheritableuserThreadLocal.get());
            inheritableuserThreadLocal.remove();
        });
        thread.start();
        Thread.sleep(5000);
        System.out.println("M:"+inheritableuserThreadLocal.get());
        inheritableuserThreadLocal.remove();
    }
    /** 打印结果 */
//        M:UserVO(name=main-T, age=null)
//        S:UserVO(name=main-T, age=null)
//        S:UserVO(name=child, age=20)
//        M:UserVO(name=main-T, age=null)
}
```



从打印结果可以得知，当另起线程时，inheritableuserThreadLocal是可以实现继承性的。但是注意子线程继承的对象是浅拷贝，如果放开代码中的注释行，也就是修改变量值，那么父线程中的threadlocal也会修改，因为两者引用指向的是同一个对象。




3.  线程池中InheritableThreadLocal失效




```
    /**
     * 验证 InheritableThreadLocal 在线程池中的效果
     */
    @Test
    public void inheritableThreadPoolTest() throws InterruptedException {
        inheritableuserThreadLocal.set(new UserVO().setName("mainUser"));
        System.out.println("M:"+inheritableuserThreadLocal.get());
        ThreadPoolExecutor threadPoolExecutor = new ThreadPoolExecutor(2, 4, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(1000));
        for (int i = 0; i < 5; i++) {
            threadPoolExecutor.submit(() -> {
                System.out.println("S:"+inheritableuserThreadLocal.get());
                inheritableuserThreadLocal.remove();
            });
        }
        Thread.sleep(5000);
        inheritableuserThreadLocal.remove();
    }
    /** 打印结果 */
//    M:UserVO(name=mainUser, age=null)
//    S:UserVO(name=mainUser, age=null)
//    S:null
//    S:null
//    S:null
//    S:UserVO(name=mainUser, age=null)
```



之所以有的线程会打印出null值，是因为在使用InheritableThreadLocal时父线程的ThreadLocalMap是通过实例化一个Thread时赋值给子线程的，但是在线程池中业务线程只是将任务（实现了Runnable或者Callable的对象）加入到任务队列中，并不一定去创建线程池中的线程，因此线程池中线程也就获取不到业务线程中的上下文信息。




4.  阿里开源的TransmittableThreadLocal




参考文档：https://github.com/alibaba/transmittable-thread-local



```
    /**
     * 验证TransmittableThreadLocal（错误用法）
     */
    @Test
    public void ttlThreadPoolErrorTest() throws InterruptedException {
        ttluserThreadLocal.set(new UserVO().setName("hello"));
        System.out.println("M:"+ttluserThreadLocal.get());
        for (int i = 0; i < 10; i++) {
            ThreadUtil.execAsync(() -> {
                System.out.println("S:"+ttluserThreadLocal.get());
                ttluserThreadLocal.remove();
            });
        }
        Thread.sleep(5000);
        ttluserThreadLocal.remove();
    }
    /** 打印结果 */
//    M:UserVO(name=hello, age=null)
//    S:UserVO(name=hello, age=null)
//    S:UserVO(name=hello, age=null)
//    S:UserVO(name=hello, age=null)
//    S:UserVO(name=hello, age=null)
//    S:null
//    S:null
//    S:null
//    S:null
//    S:UserVO(name=hello, age=null)

    /**
     * TransmittableThreadLocal的正确用法
     */
    @Test
    public void ttlThreadPoolCorrectTest() throws InterruptedException {
        ttluserThreadLocal.set(new UserVO().setName("m").setAge("99"));
        System.out.println("M:"+ttluserThreadLocal.get());
        //需用TtlExecutors包装一层才能正常使用
        ExecutorService ttlExecutorService = TtlExecutors.getTtlExecutorService(ThreadUtil.newExecutor(2,4));
        for (int i = 0; i < 10; i++) {
            ttlExecutorService.submit(() -> {
                System.out.println("S:" + ttluserThreadLocal.get());
            });
        }
        Thread.sleep(5000);
        ttluserThreadLocal.remove();
    }
```