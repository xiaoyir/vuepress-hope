# redis中的大key要如何删除？
大家好，我是小义。今天来聊聊面试中的高频考点：如何处理redis缓存中的大key? 大 key 其实并不是指 key 的值很大，而是 key 对应的 value 很大，占了很大内存。
## 为什么会有大Key？

### 出现的原因
了解大Key的成因是解决问题的第一步。大Key的形成可能源于多种因素，包括但不限于：

- 业务逻辑设计不当：如将所有用户信息存储在一个哈希中。
- 数据模型未优化：数据结构选择不当，导致存储效率低下。
- 过期策略设置不合理：如清理不及时，导致列表数据堆积。

###  大小的标准
那具体多大才算大key呢？参考标准大致如下：
- String 类型的值大于 1 MB
- Hash、List、Set、ZSet类型的元素的个数超过 5000个

### 影响的结果
大key会带来以下四种危害：
- 资源消耗：大Key会占用较多的内存资源，可能导致其他数据无法被有效缓存，同时在内存不足时可能触发淘汰机制，影响数据的完整性。

- 性能影响：操作大Key可能导致处理延迟增加，尤其是在高负载情况下，可能会阻塞其他操作，从而影响Redis的整体性能和响应速度。

- 内存分布不均：在redis cluster集群模式中，大key一般不会分片分布，造成单节点内存占用过高，出现数据倾斜的情况。

- 数据一致性和恢复问题：在主从复制和数据迁移场景中，大Key可能导致同步和迁移延迟，增加数据丢失的风险，同时可能延长故障恢复时间。

## 如何查找大key?

这里介绍一个好用的查找大key的第三方工具，用python语言编写的redis-rdb-tools，可以用来解析 Redis 快照（RDB）文件。要使用该工具得先下载python，具体安装过程可以参考网上的教程，下面介绍几个常用命令：

- 将rdb文件转成csv文件
```
rdb -c memory /mnt/data/redis/dump.rdb >  /mnt/data/redis/memory.csv   
```
- 导出内存中排名前3的keys
```
rdb --command memory --largest 3 dump.rdb
```
- 导出大于 10 kb 的  key  输出到一个表格文件
```
rdb dump.rdb -c memory --bytes 10240 -f redis.csv
```
## 如何删除bigkey?

针对大key，肯定是要删除的，那怎么删除才最高效呢？直接用del命令行不行？答案是不行。Redis 官方文档描述到：https://redis.io/docs/latest/commands/del/

1、String 类型的key，DEL 时间复杂度是 O(1)，大key除外。

2、List/Hash/Set/ZSet 类型的key，DEL 时间复杂度是 O(M)，M 为元素数量，元素越多，耗时越久。



### 一次性删除的后果

大Key如果一次性执行删除操作，会立即触发大量内存的释放过程。这个过程中，操作系统需要将释放的内存块重新插入空闲内存块链表，以便之后的管理和再分配。由于这个过程是同步进行的，并且可能涉及大量的内存块操作，因此它将占用相当一部分处理时间，并可能造成Redis主线程的阻塞。

这种阻塞会导致Redis无法及时响应其他命令请求，从而引起请求超时，超时的累积可能会导致Redis连接耗尽，进而产生服务异常。

因此删除大key，一定要慎之又慎，可以选择异步删除或批量删除。
### 异常删除
Redis从 4.0开始， 可以使用 UNLINK 命令来异步删除大key，删除大Key的语法与DEL命令相同。
```
UNLINK bigkey
```
当使用UNLINK删除一个大Key时，Redis不会立即释放关联的内存空间，而是将删除操作放入后台处理队列中。Redis会在处理命令的间隙，逐步执行后台队列中的删除操作，从而不会显著影响服务器的响应性能。

### 批量删除
主要是针对Hash、List、Set、Zset，具体操作见下方代码描述
```
@Component
@Slf4j
public class RedisUtils {

    @Autowired
    private StringRedisTemplate redisTemplate;

    /**
     * Hash删除: hscan + hdel
     * @param key 大key
     * @param match 要匹配的hash的key,支持正则表达式
     * @param count  每次扫描的记录数。值越小，扫描次数越过、越耗时。建议设置在1000-10000
     */
    public void delBigHash(String key, String match, int count) {
        ScanOptions scanOptions = ScanOptions.scanOptions().match(match).count(count).build();
        Cursor<Map.Entry<Object, Object>> cursor = redisTemplate.opsForHash().scan(key, scanOptions);
        while (cursor.hasNext()) {
            Map.Entry<Object, Object> next = cursor.next();
            redisTemplate.opsForHash().delete(key, next.getKey());
            log.info("del:"+ next.getKey());
        }
        try {
            //遍历完成后，游标需要关闭
            cursor.close();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * List删除: trim + del
     * @param key
     * @param num 每次删除的个数
     */
    public void delBigList(String key, int num) {
        Long size = redisTemplate.opsForList().size(key);
        int counter = 0;
        while (counter < size) {
            //每次从左侧截掉 num 个
            redisTemplate.opsForList().trim(key, 0, num);
            counter += num;
            log.info("count="+counter);
        }
        //最终删除key
        redisTemplate.delete(key);
    }

    /**
     * Set删除: sscan + srem
     */
    public void delBigSet(String key, int count) {
        ScanOptions scanOptions = ScanOptions.scanOptions().count(count).build();
        Cursor<String> cursor = redisTemplate.opsForSet().scan(key, scanOptions);
        while (cursor.hasNext()) {
            String value = cursor.next();
            redisTemplate.opsForSet().remove(key, value);
            log.info("set del:"+ value);
        }
        try {
            //遍历完成后，游标需要关闭
            cursor.close();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * ZSet删除: zscan + zrem
     */
    public void delBigZSet(String key, int count) {
        ScanOptions scanOptions = ScanOptions.scanOptions().count(count).build();
        Cursor<ZSetOperations.TypedTuple<String>> cursor = redisTemplate.opsForZSet().scan(key, scanOptions);
        while (cursor.hasNext()) {
            ZSetOperations.TypedTuple<String> next = cursor.next();
            redisTemplate.opsForZSet().remove(key, next.getValue());
            log.info("zset del -> value:"+ next.getValue() + ", score:"+ next.getScore());
        }
        try {
            //遍历完成后，游标需要关闭
            cursor.close();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
```

## 结语
在Redis的世界里，大Key问题就像是一颗隐藏的炸弹，随时可能引发性能危机，但通过合理的策略和持续的优化，就可以有效地控制其对系统性能的影响。