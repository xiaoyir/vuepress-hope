# 完蛋了，线程池死锁，生产出Bug了
生产环境系统excel报表导不出，挨客户投诉，内心慌得一批，赶紧查看日志，结果发现是线程池死锁，还是自己写的代码，这锅不背也得背了。


遇事不要慌，来杯82年的java压压惊。还好之前做了开关配置，小义赶紧切换开关恢复旧页面，先解决客户问题。排查了半天日志，原来是因为父子任务共用同个线程池，造成循环依赖，直接堵死了导出请求。

下面来模拟一下当时的导出场景，客户导出一天的订单，分批按100条去查每个订单详情，然后每个订单有关联的运单信息需要另外分批按10个10个的去查。不要问小义为什么一次查询的数量这么少，数据我管不着，接口都是第三方服务的，他们只能这么支持。

为提高查询效率，只能利用多线程了。先新建一个通用的线程池和线程工厂。

*   线程工厂


```
import com.sun.istack.NotNull;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * @description: 线程工厂,可自定义线程名
 */
public class NamedThreadFactory implements ThreadFactory {

    /**
     * 线程名前缀
     */
    private final String prefix;

    /**
     * 线程编号
     */
    private final AtomicInteger threadNumber = new AtomicInteger(1);

    /**
     * 创建线程工厂
     *
     * @param prefix 线程名前缀
     */
    public NamedThreadFactory(String prefix) {
        this.prefix = prefix;
    }

    @Override
    public Thread newThread(@NotNull Runnable r) {
        return new Thread(null, r, prefix + threadNumber.getAndIncrement());
    }
}
```

*   配置线程池


```
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Description:线程池基础配置
 */
@Configuration
public class ExecutorConfig implements WebMvcConfigurer {

    @Bean(value = "orderExecutorService")
    public ExecutorService aaasMiniExecutorService() {
        return new MdcThreadPoolExecutor(5, 10, 60,
                TimeUnit.SECONDS, new ArrayBlockingQueue<>(3000),
                new NamedThreadFactory("order"));
    }

}
```

*   执行代码


假设总共有5000条订单，分5000/100=50个父线程去查订单详情，每个父线程再新建100/10=10个子线程去查运单号。所以父线程要等待子线程执行完然后组装订单信息。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525165140.png)

写个单元测试复现一下

```
public class ThreadPoolTest {

    @Autowired
    private ExecutorService orderExecutorService;

    @Test
    public void executorTest() {
        List<CompletableFuture<List<OrderDetailDTO>>> orderFutureList = Lists.newArrayList();
        for (int i = 0; i < 50; i++) {
            int finalPageNo = i;
            orderFutureList.add(CompletableFuture.supplyAsync(() -> {
                List<OrderDetailDTO> orderInfoList = queryOrderInfo(finalPageNo,100);
                return orderInfoList;
            }, orderExecutorService));
        }
        List<OrderDetailDTO> orderDetailDTOList = orderFutureList.stream().map(f -> f.join())
                .flatMap(l -> l.stream()).collect(Collectors.toList());
        return;
    }

    private List<OrderDetailDTO> queryOrderInfo(int pageNo, int pageSize) {
        try {
            //查询订单信息
            List<OrderDetailDTO> orderList = queryOrderDetail(pageNo, pageSize);
            List<String> orderIdList = orderList.stream().map(OrderDetailDTO::getOrderId).collect(Collectors.toList());
            List<List<String>> orderIdListList = Lists.partition(orderIdList, 10);
            Map<String, String> idMap = queryBatchTrackId(orderIdListList);
            orderList.stream().forEach(orderDetailDTO -> {
                orderDetailDTO.setTrackId(idMap.getOrDefault(orderDetailDTO.getOrderId(),""));
            });
        } catch (Exception e) {
            log.error("查询订单详情异常:{}",e.getMessage(),e);
        }
        return Lists.newArrayList();
    }

    private Map<String, String> queryBatchTrackId(List<List<String>> orderIdListList) {
        Map<String, String> map = new HashMap<>();
        List<CompletableFuture<List<TrackInfo>>> trackFutureList = Lists.newArrayList();
        if (CollUtil.isEmpty(orderIdListList)) return map;
        try{
            for (List<String> list : orderIdListList) {
                trackFutureList.add(CompletableFuture.supplyAsync(() -> {
                    List<TrackInfo> trackList = queryTrackInfoByOrderId(list);
                    return trackList;
                }, orderExecutorService));
            }
            map = trackFutureList.stream().map(f -> f.join()).flatMap(l -> l.stream())
                    .collect(Collectors.toMap(TrackInfo::getOrderId, TrackInfo::getTrackId));
        }catch (Exception e) {
            log.error("批量查询运单id异常：{}",e.getMessage(),e);
        }
        return map;
    }

    private List<OrderDetailDTO> queryOrderDetail(int pageNo, int pageSize) {
        //...
    }

    private List<TrackInfo> queryTrackInfoByOrderId(List<String> list) {
        //...
    }
}
```

利用jstack命令分析一下线程状态

```
"order5" #23 prio=5 os_prio=0 tid=0x000000001a2b4000 nid=0x6c04 waiting on condition [0x000000002311e000]
   java.lang.Thread.State: WAITING (parking)
 at sun.misc.Unsafe.park(Native Method)
 - parking to wait for  <0x00000000e06b6598> (a java.util.concurrent.CompletableFuture$Signaller)
 at java.util.concurrent.locks.LockSupport.park(LockSupport.java:175)
 at java.util.concurrent.CompletableFuture$Signaller.block(CompletableFuture.java:1707)
 at java.util.concurrent.ForkJoinPool.managedBlock(ForkJoinPool.java:3323)
 at java.util.concurrent.CompletableFuture.waitingGet(CompletableFuture.java:1742)
 at java.util.concurrent.CompletableFuture.join(CompletableFuture.java:1947)
 at org.coco.cat.utils.ThreadPoolTest.lambda$queryBatchTrackId$5(ThreadPoolTest.java:81)
 at org.coco.cat.utils.ThreadPoolTest$$Lambda$735/383614241.apply(Unknown Source)
 at java.util.stream.ReferencePipeline$3$1.accept(ReferencePipeline.java:193)
 at java.util.ArrayList$ArrayListSpliterator.forEachRemaining(ArrayList.java:1382)
 at java.util.stream.AbstractPipeline.copyInto(AbstractPipeline.java:482)
 at java.util.stream.AbstractPipeline.wrapAndCopyInto(AbstractPipeline.java:472)
 at java.util.stream.ReduceOps$ReduceOp.evaluateSequential(ReduceOps.java:708)
 at java.util.stream.AbstractPipeline.evaluate(AbstractPipeline.java:234)
 at java.util.stream.ReferencePipeline.collect(ReferencePipeline.java:499)
 at org.coco.cat.utils.ThreadPoolTest.queryBatchTrackId(ThreadPoolTest.java:82)
 at org.coco.cat.utils.ThreadPoolTest.queryOrderInfo(ThreadPoolTest.java:60)
 at org.coco.cat.utils.ThreadPoolTest.lambda$executorTest$0(ThreadPoolTest.java:45)
 at org.coco.cat.utils.ThreadPoolTest$$Lambda$723/1058101486.get(Unknown Source)
 at java.util.concurrent.CompletableFuture$AsyncSupply.run(CompletableFuture.java:1604)
 at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1149)
 at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
 at java.lang.Thread.run(Thread.java:748)

   Locked ownable synchronizers:
 - <0x00000000dfdfa878> (a java.util.concurrent.ThreadPoolExecutor$Worker)
```

可以看到线程已经被锁住了，无法执行任务

*   问题根源


orderExecutorService核心线程数是5，最大线程是10，队列长度3000。因为父任务过多，一小子就把5个核心线程全部占有了，其他父任务和子任务只能到队列中等候，只有队列塞满了，才会另外起工作线程。这时候所有核心线程因为要等待子任务完成才能结束，而子任务又切好躺在队列中无法执行，所以就造成了循环依赖，也就是死锁，线程池被阻塞，无法工作了。

![image-20240525165424096](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525165424.png)


吃一堑长一智，总结是为了更好的提升，祝大家一起变得更强。