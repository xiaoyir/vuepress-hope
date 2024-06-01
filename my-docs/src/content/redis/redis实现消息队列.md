# Redis实现消息队列，超简单！

在现代的软件开发中，消息队列已经成为了构建可扩展、高性能系统的关键组件。它帮助我们解耦服务，实现异步处理，提高系统的吞吐量和稳定性。主要应用场景如下：

*   **任务调度**：将耗时的任务异步处理，提高系统的响应速度。

*   **日志处理**：收集来自不同服务的日志，进行统一的处理和分析。

*   **事件驱动架构**：构建松耦合的微服务架构，服务之间通过消息进行通信。


其实除了kafka、rocketMQ等常见的消息中间件，redis也可以实现消息队列的功能。相信也有不少同学会被面试官问到，如何在不使用消息中间件的情况下实现一个消息队列，下面来看看redis如何处理。

## Redis消息队列的工作原理

Redis消息队列的实现基于其内置的数据结构和命令。主要有以下几种方式：

### 1\. 使用List作为队列

Redis的List数据结构是一个双向链表，可以通过`LPUSH`或`RPUSH`命令将消息添加到队列头部或尾部，消费者可以使用`LPOP`或`RPOP`命令从队列取出消息。这种方式简单直接，但由于Redis的List是存储在内存中的，所以处理速度非常快。在Spring中，我们通常使用RedisTemplate来操作Redis的List数据结构。

**生产者代码示例：**

```
ListOperations<String> listOps = redisTemplate.opsForList();
listOps.rightPush("myQueue", "Message payload");
```

**消费者代码示例：**

```
// 消费者从队列取出消息
String message = listOps.leftPop("myQueue");
```

### 2\. 使用Pub/Sub模式

Redis的Pub/Sub模式是一种发布/订阅模式，自2.8.0版本之后就开始支持。生产者可以将消息发布到一个频道，而消费者可以订阅这个频道来接收消息。这种方式支持模式匹配和多个消费者，但不支持消息持久化和回溯。

**生产者代码示例：**

```
String channel = "myChannel";
String message = "Message payload";
// 生产者发布消息
redisTemplate.convertAndSend(channel, message);
```

**消费者代码示例：**

```
MessageListenerAdapter messageListenerAdapter = new MessageListenerAdapter(new MyMessageListener());

RedisMessageListenerContainer container = new RedisMessageListenerContainer();
container.setConnectionFactory(yourRedisConnectFactory);
container.addMessageListener(messageListenerAdapter, new PatternTopic("myChannel"));
container.start();
```

MyMessageListener类实现MessageListener接口，用于处理接收到的消息。

```
public class MyMessageListener implements MessageListener {
    @Override
    public void onMessage(Message message, byte[] pattern) {
        String channel = message.getChannel();
        String messageContent = new String(message.getBody());
        System.out.println("Received message on channel '" + channel + "': " + messageContent);
    }
}
```

### 3\. 使用Stream数据结构

Redis 5.0引入了Stream数据结构，它提供了类似于Kafka的消息队列功能。Stream支持消息持久化、ack确认、多个消费者以及回溯消费。这使得Stream成为了Redis中最强大的消息队列实现。

**生产者代码示例：**

```
HashMap hashMap = new HashMap();
        hashMap.put("key", "Message payload");
        StreamOperations<String, Object, Object> streamOps = redisTemplate.opsForStream();
        MapRecord<String, String, String> record = StreamRecords.newRecord()
                .ofStrings(hashMap)
                .withStreamKey("myStream");
        streamOps.add(record);
```

**消费者代码示例：**

```
StreamOperations<String, Object, Object> streamOps = redisTemplate.opsForStream();
        List<MapRecord<String, Object, Object>> recordList = streamOps.read(StreamOffset.create("myStream", ReadOffset.lastConsumed()));
        for (MapRecord<String, Object, Object> entries : recordList) {
            Map<Object, Object> value = entries.getValue();
            System.out.println(value);
        }
```

### 4\. 使用Zset数据结构

除了以上三种普通的消息队列，还可以用Redis的zset可以实现一个延迟消息队列。

使用Redis的ZADD命令，为集合中的每个消息添加一个分数，该分数将决定消息在列表中的排列顺序。这个分数可以是添加消息时的服务器时间戳加上延迟的时间（比如延迟15秒，那么分数就是当前时间戳+15）。

使用ZRANGE命令，配合WITHSCORES参数，获取有序集合中最小的元素及其分数。分数即为我们在步骤1中设置的执行时间。如果当前时间大于或等于消息的分数（执行时间），那么就处理这条消息。否则，每隔一段时间检查一次。处理了的消息要使用ZREM命令将其从列表中移除。

代码实现如下：

```
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class RedisDelayingQueueWithRedisTemplate {
   
    private final RedisTemplate<String, Object> redisTemplate;

    @Autowired
    public RedisDelayingQueueWithRedisTemplate(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void delay(String message) {
        ZSetOperations<String, Object> ops = redisTemplate.opsForZSet();
        // 提交消息到队列中，设置5秒后处理
        ops.add("delay_queue", message, System.currentTimeMillis() + 5000);
    }

    public void loop() {
        ZSetOperations<String, Object> ops = redisTemplate.opsForZSet();
        while (true) {
            Set<Object> items = ops.rangeByScore("delay_queue", 0, System.currentTimeMillis(), 0, 1);
            if (items == null || items.isEmpty()) {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    break;
                }
                continue;
            }
            Object next = items.iterator().next();
            if (ops.remove("delay_queue", next) > 0) { // 抢到了
                handleMsg((String) next);
            }
        }
    }

    public void handleMsg(String message) {
        System.out.println(message);
    }
}
```

## 最佳实践

在使用Redis消息队列时，需要注意以下几点：

*   **选择合适的数据结构**：根据业务需求选择List、Pub/Sub还是Stream。

*   **处理消息丢失**：对于重要的业务数据，需要考虑消息丢失的处理策略。

*   **监控和调优**：监控Redis的性能，根据实际情况进行调优。


当然，如果非轻量级的、涉及到复杂业务场景的，如下订单、消息通知等，还是得上rocketMQ等消息中间件。