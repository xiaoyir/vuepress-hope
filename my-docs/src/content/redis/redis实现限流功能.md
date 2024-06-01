# 太优雅了！用Redis高效实现限流功能!

在高并发场景下，接口限流能够防止系统过载，确保服务的可用性和稳定性。限流策略的选择和实现方式，直接影响到用户体验和系统的负载能力。而Redis作为强大的内存数据库，以其卓越的性能和原子操作特性，成为了实现接口限流的理想选择。它不仅可以快速响应请求，还能通过其丰富的数据结构，如字符串、列表、有序集合等，来辅助实现多样化的限流逻辑。

## 限流算法概览

在介绍具体的Redis实现之前，我们先来了解几种常见的限流算法。

### 固定窗口限流

在固定时间窗口内限制请求数量。

*   优点：实现简单，容易理解。

*   缺点：无法应对短时间内的突发流量。

*   适用场景：流量相对平稳，没有明显波峰波谷的系统。


### 滑动窗口限流

将时间窗口划分为多个小片段，允许一定程度的突发流量。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525175302.png)

*   优点：可以应对短时间内的突发流量。

*   缺点：实现相对复杂，需要维护多个计数器。

*   适用场景：有明显流量波峰的系统，如促销活动、流量突增等。


### 漏桶算法

请求被收集到桶中，以固定速率处理。如果输入流量较大，则多余的流量会在桶中缓存起来，直到桶满为止。一旦桶满，新的流量将会被丢弃。

*   优点：平滑处理请求，不受突发流量影响。

*   缺点：处理速度固定，无法充分利用系统资源。

*   适用场景：对处理速度有严格要求，不希望因为流量波动而影响处理速度的系统。


### 令牌桶算法

允许在有可用令牌的情况下以任意速率传输数据。如果有足够的令牌，可以立即处理一个大的流量突发。当流量较小时，令牌可以在桶中积累。如果桶中令牌满了，则新生成的令牌将被丢弃。

![img_1](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525175312.png)

*   优点：允许一定程度的突发流量，同时限制长时间内的流量。

*   缺点：实现较为复杂，需要维护令牌生成和消耗。

*   适用场景：需要平衡突发流量和长时间流量限制的系统。


## 滑动窗口限流

相对来说，滑动窗口限流可以更灵活地应对流量波动，是使用的最多的一个，这里介绍用redis来实现用户维度或接口维度下该限流的两种方式，可以用list或zset。

### List结构

在Redis中，可以使用列表（List）来存储时间窗口内的请求计数。通过维护多个列表来实现多个时间窗口的计数，然后根据这些计数来判断是否允许新的请求通过。

```
@Component
public class SlideWindow {

    @Autowired
    private RedisTemplate redisTemplate;

    /**
     * 滑动时间窗口限流算法
     * 在指定时间窗口，指定限制次数内，是否允许通过
     *
     * @param listId     队列id，可以是用户Id 或者 用户Id+接口url 的维度来控制限流
     * @param count      限制次数
     * @param timeWindow 时间窗口大小
     * @return 是否允许通过
     */
    @SneakyThrows
    public boolean checkAccess(String listId, int count, long timeWindow) {
        // 获取当前时间
        long nowTime = System.currentTimeMillis();
        // 根据队列id，取出对应的限流队列，若没有则创建

        if (redisTemplate.hasKey(listId)) {
            // 如果队列还没满，则允许通过，并添加当前时间戳到队列开始位置
            Long size = redisTemplate.opsForList().size(listId);
            if (size < count) {
                redisTemplate.opsForList().leftPush(listId,nowTime);
                return true;
            }
            // 队列已满（达到限制次数），则获取队列中最早添加的时间戳
            Long farTime = (Long) redisTemplate.opsForList().index(listId, count - 1);
            // 用当前时间戳 减去 最早添加的时间戳
            if (nowTime - farTime <= timeWindow) {
                // 若结果小于等于timeWindow，则说明在timeWindow内，通过的次数大于count
                // 不允许通过
                return false;
            } else {
                // 若结果大于timeWindow，则说明在timeWindow内，通过的次数小于等于count
                // 允许通过，并删除最早添加的时间戳，将当前时间添加到队列开始位置
                redisTemplate.opsForList().rightPop(listId);
                redisTemplate.opsForList().leftPush(listId,nowTime);
                return true;
            }
        } else {
            redisTemplate.opsForList().leftPush(listId,nowTime);
            return true;
        }
    }

}
```

### ZSet结构

用有序集合（ZSet）来存储接口请求的时间，通过统计滑动时间窗口内的个数，来判断是否允许新的请求通过。

```
@Component
@Slf4j
public class FlowLimitInterceptor implements HandlerInterceptor {

    @Autowired
    StringRedisTemplate stringRedisTemplate;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        try {
            String userId = request.getHeader("userId");
            if (!isPeriodLimiting(userId)) {
                return false;
            }
        } catch (Exception e) {
            log.error("preHandle error:{}",e.getMessage(),e);
        }
        return true;
    }

    private boolean isPeriodLimiting(String userId) {
        String key = "FLW_" + userId;
        //设置滑动时间窗口1分钟最多访问1000次
        int period = 60;
        int periodMaxCount = 1000;
        long nowTs = System.currentTimeMillis();
        //移除过期时间元素，只保留最近一分钟的数据
        stringRedisTemplate.opsForZSet().removeRangeByScore(key, 0, nowTs - period * 1000);
        stringRedisTemplate.opsForZSet().add(key, String.valueOf(nowTs), nowTs);
        long currCount = stringRedisTemplate.opsForZSet().zCard(key);
        //大于单位时间内滑动窗口请求数量
        if (currCount >= periodMaxCount) {
            return false;
        }
        //如果考虑限制用户单日最大总请求数，可打开下方注释
//        if (beyondTotalNum(userId)) {
//            return false;
//        }
        return true;
    }

    private boolean beyondTotalNum(String userId) {
        String totalKey = "FLC_" + userId;
        Boolean redisKey = stringRedisTemplate.hasKey(totalKey);
        if (redisKey) {
            Integer num = Integer.parseInt((String) stringRedisTemplate.opsForValue().get(totalKey));
            int maxNum = 10000;
            if (num >= maxNum) {
                return true;
            }
            stringRedisTemplate.opsForValue().increment(totalKey, 1);
            return false;
        } else {
            stringRedisTemplate.opsForValue().set(totalKey, "1", 1, TimeUnit.DAYS);
        }
        return false;
    }
}
```

## 结语

Redis作为接口限流的利器，具备灵活的特性，使其在高并发场景下表现出色。当然，每种限流方法都有其优缺点，选择哪种方法取决于具体需求和场景。在实际应用中，也可以根据需要将不同的限流方法结合起来使用，以达到更好的限流效果。



* * *

[欢迎关注小义公众号，](http://mp.weixin.qq.com/s?__biz=Mzk0NjQwNzI1MA==&mid=2247484059&idx=1&sn=2ac6dcddfa78e3d4d413d3cb6c214e0f&chksm=c307d0a6f47059b040e29c0a82770f58d24bdf213b4c6137f3fe41d7a0b52f624f20879a9ea1&scene=21#wechat_redirect)[点击此处结识程序员小义](http://mp.weixin.qq.com/s?__biz=Mzk0NjQwNzI1MA==&mid=2247484059&idx=1&sn=2ac6dcddfa78e3d4d413d3cb6c214e0f&chksm=c307d0a6f47059b040e29c0a82770f58d24bdf213b4c6137f3fe41d7a0b52f624f20879a9ea1&scene=21#wechat_redirect)