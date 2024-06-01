# 数据库增量数据同步，用Canal组件好使吗？

# 1.技术介绍

大家好，我是小义，今天来讲一下Canal。Canal是阿里巴巴开源的一款基于MySQL数据库binlog的增量订阅和消费组件，它的主要工作原理是伪装成MySQL slave，模拟MySQL slave的交互协议向MySQL Master发送dump协议。当MySQL master收到canal发送过来的dump请求后，开始推送binary log给canal，然后canal解析binary log，再发送到存储目的地，如MySQL，Kafka等。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525165838.png)

上面展示的是它的基本工作原理图，相信很多人都知道大名鼎鼎的Canal，项目官网https://github.com/alibaba/canal

但是工作中不一定用到，今天小义就给大家实操演示一下。

# 2.环境配置

以下配置基于Ubuntu18.04系统实现

## 2.1 mysql部署

### 2.1.1 安装mysql

首先得安装好canal支持下的mysql版本，本次安装的是mysql-5.7.31。通过which mysql命令可查看mysql具体是在哪个目录，比如是/usr/local/mysql/bin/mysql 这个路径。接着执行/usr/local/mysql/bin/mysql --verbose --help | grep -A 1 'Default options' 命令可查看 mysql 配置文件加载顺序，如下图所示。

![img_1](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525165920.png)

这个信息的意思是说服务器首先读取的是 /etc/my.cnf 文件，如果前一个文件不存在则继续读 /etc/mysql/my.cnf 文件，依此类推，如若还不存在便会去读~/.my.cnf文件。

### 2.1.2 开启Binlog

mysql需要先开启 Binlog 写入功能，配置 binlog-format 为 ROW 模式，my.cnf 文件末包含以下两行，表示会加载/etc/mysql/conf.d/和/etc/mysql/mysql.conf.d/目录下的配置文件。

![img_2](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525165934.png)

依据目录，给/etc/mysql/mysql.conf.d/mysqld.cnf文件添加如下配置：
```
[mysqld]  
log-bin=mysql-bin # 开启 binlog  
binlog-format=ROW # 选择 ROW 模式  
server_id=1 # 配置 MySQL replaction 需要定义，不要和 canal 的 slaveId 重复
```


### 2.1.3 用户授权

用mysql -u root -p 命令登录MySQL，创建新的用户，并授权。

![img_3](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525170043.png)

最好授权所有权限：grant all privileges on _._ to 'canal'@'%' identified by 'Canal@123456'

### 2.1.4 重启服务

最后使用service mysql restart命令重启服务。show VARIABLES like 'log\_bin'可查看binlog是否已开启。show master status展示正在写入的binlog文件。

![img_4](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525170054.png)

## 2.2 canal部署

### 2.2.1 下载压缩包

去官网下载页面进行下载压缩包，下载地址：https://github.com/alibaba/canal/releases。本次下载的是1.1.6版本，https://github.com/alibaba/canal/releases/download/canal-1.1.6/canal.deployer-1.1.6.tar.gz

### 2.2.2 解压安装

解压canal.deployer-1.1.6.tar.gz，修改配置文件conf/example/instance.properties。需要注意的是，canal.instance.connectionCharset代表数据库的编码方式对应到java中的编码类型，比如UTF-8，GBK，ISO-8859-1等。另外如果系统是1个cpu，需要将canal.instance.parser.parallel的值设置为false。
```
## mysql serverId
## v1.0.26版本后会自动生成slaveId，所以可以不用配置
canal.instance.mysql.slaveId = 1234  
#position info，需要改成自己的数据库信息  
canal.instance.master.address = 127.0.0.1:3306
# binlog日志名称
canal.instance.master.journal.name =
# mysql主库链接时起始的binlog偏移量
canal.instance.master.position =
# mysql主库链接时起始的binlog的时间戳
canal.instance.master.timestamp =   
#canal.instance.standby.address =   
#canal.instance.standby.journal.name =  
#canal.instance.standby.position =   
#canal.instance.standby.timestamp =   
#username/password，MySQL服务器授权的账号密码  
canal.instance.dbUsername = canal    
canal.instance.dbPassword = Canal@123456  
canal.instance.defaultDatabaseName =  
canal.instance.connectionCharset = UTF-8
# table regex .*\\..*表示监听所有表 也可以写具体的表名，用，隔开
canal.instance.filter.regex=.*\\..*
# mysql 数据解析表的黑名单，多个表用，隔开
canal.instance.filter.black.regex=
```
### 2.2.3 启动与关闭

启动：sh bin/startup.sh，关闭：sh bin/stop.sh。canal默认占用端口11111客户端，如果想要连接canal服务需要在Linux中开放11111端口。

## 2.3 Spring整合

### 2.3.1 依赖引入

在springboot项目中引入canal客户端依赖包。
```
<dependency>  
    <groupId>com.alibaba.otter</groupId>  
    <artifactId>canal.client</artifactId>  
    <version>1.1.4</version>  
</dependency>  
```
### 2.3.2 简单测试

编写canal客户端代码，打印sql日志。
```java
@Component
public class CanalClient implements InitializingBean {
    private final static int BATCH_SIZE = 1000;
    @Override
    public void afterPropertiesSet() throws Exception {
        // 创建链接
        CanalConnector connector = CanalConnectors.newSingleConnector(
                new InetSocketAddress("xxx.xxx.xxx.xxx", 11111), "example", "", "");
        try {
            //打开连接
            connector.connect();
            //订阅数据库表,全部表
            connector.subscribe(".*\\..*");
            //回滚到未进行ack的地方，下次fetch的时候，可以从最后一个没有ack的地方开始拿
            connector.rollback();
            while (true) {
                // 获取指定数量的数据
                Message message = connector.getWithoutAck(BATCH_SIZE);
                //获取批量ID
                long batchId = message.getId();
                //获取批量的数量
                int size = message.getEntries().size();
                //如果没有数据
                if (batchId == -1 || size == 0) {
                    try {
                        //线程休眠2秒
                        Thread.sleep(2000);
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                } else {
                    //如果有数据,处理数据
                    printEntry(message.getEntries());
                }
                //进行 batch id 的确认。确认之后，小于等于此 batchId 的 Message 都会被确认。
                connector.ack(batchId);
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            connector.disconnect();
        }
    }

    /**
     * 打印canal server解析binlog获得的实体类信息
     */
    private static void printEntry(List<Entry> entrys) {
        for (Entry entry : entrys) {
            if (entry.getEntryType() == EntryType.TRANSACTIONBEGIN || entry.getEntryType() == EntryType.TRANSACTIONEND) {
                //开启/关闭事务的实体类型，跳过
                continue;
            }
            //RowChange对象，包含了一行数据变化的所有特征
            //比如isDdl 是否是ddl变更操作 sql 具体的ddl sql beforeColumns afterColumns 变更前后的数据字段等等
            RowChange rowChage;
            try {
                rowChage = RowChange.parseFrom(entry.getStoreValue());
            } catch (Exception e) {
                throw new RuntimeException("ERROR ## parser of eromanga-event has an error , data:" + entry.toString(), e);
            }
            //获取操作类型：insert/update/delete类型
            EventType eventType = rowChage.getEventType();
            //打印Header信息
            System.out.println(String.format("================》; binlog[%s:%s] , name[%s,%s] , eventType : %s",
                    entry.getHeader().getLogfileName(), entry.getHeader().getLogfileOffset(),
                    entry.getHeader().getSchemaName(), entry.getHeader().getTableName(),
                    eventType));
            //判断是否是DDL语句
            if (rowChage.getIsDdl()) {
                System.out.println("================》;isDdl: true,sql:" + rowChage.getSql());
            }
            //获取RowChange对象里的每一行数据，打印出来
            for (RowData rowData : rowChage.getRowDatasList()) {
                //如果是删除语句
                if (eventType == EventType.DELETE) {
                    printColumn(rowData.getBeforeColumnsList());
                    //如果是新增语句
                } else if (eventType == EventType.INSERT) {
                    printColumn(rowData.getAfterColumnsList());
                    //如果是更新的语句
                } else {
                    //变更前的数据
                    System.out.println("------->; before");
                    printColumn(rowData.getBeforeColumnsList());
                    //变更后的数据
                    System.out.println("------->; after");
                    printColumn(rowData.getAfterColumnsList());
                }
            }
        }
    }

    private static void printColumn(List<Column> columns) {
        for (Column column : columns) {
            System.out.println(column.getName() + " : " + column.getValue() + "    update=" + column.getUpdated());
        }
    }
}
```

### 2.3.3 sql验证

启动项目，执行sql进行验证。新建数据库表code\_holder，表结构如下：
```
CREATE TABLE `code_holder` (  
`id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'ID',  
`type` varchar(32) NOT NULL COMMENT '类型',  
`code` varchar(32) NOT NULL COMMENT 'code',  
PRIMARY KEY (`id`) USING BTREE  
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
```
依次执行在navicat执行sql插入和更新，打印结果如下，cana能正常监听binlog变化，验证成功，可喜可贺！

![img_5](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525170113.png)

# 3.同步MQ与缓存

前面只是简单实现了监听mysql，接下来重点实现数据同步至MQ和redis缓存，需预先安装好rocketmq和redis并启动，本次使用的是rocketmq4.8.0，redis5.0，spring-boot2.3.2， 官网指南：https://github.com/alibaba/canal/wiki/Canal-Kafka-RocketMQ-QuickStart

## 3.1 canal配置

### 3.1.1. instance实例配置

编辑配置文件conf/example/instance.properties。canal默认将消息发送至example主题，如果想不同表的数据消息发送至不同的topic，可放开canal.mq.dynamicTopic注释。
```
# mq config
# canal默认将消息发送至example主题
canal.mq.topic=example
# 针对库名或者表名发送动态topic，多个配置之间使用逗号或分号分隔
canal.mq.dynamicTopic=mytest1.user,topic2:mytest2\\..*,.*\\..*  
canal.mq.partition=0
# hash partition config
#canal.mq.enableDynamicQueuePartition=false  
#canal.mq.partitionsNum=3  
#canal.mq.dynamicTopicPartitionNum=test.*:4,mycanal:6  
#库名.表名: 唯一主键，多个表之间用逗号分隔  
#canal.mq.partitionHash=test.table:id^name,.*\\..*
```
### 3.1.2. server服务配置

编辑配置文件conf/canal.properties。修改canal服务模式由tcp换成rocketMQ，canal.serverMode = rocketMQ；设置rocketmq的服务器地址rocketmq.namesrv.addr和canal发送消息的生产者组rocketmq.producer.group。然后重启canal。
```
# ...
# 可选项: tcp(默认), kafka,rocketMQ,rabbitMQ,pulsarMQ
canal.serverMode = rocketMQ
# ...
# Canal的batch size, 默认50K, 由于kafka最大消息体限制请勿超过1M(900K以下)
canal.mq.canalBatchSize = 50
# Canal get数据的超时时间, 单位: 毫秒, 空为不限超时
canal.mq.canalGetTimeout = 100
# 是否为flat json格式对象
canal.mq.flatMessage = true
# ...
##################################################  
#########                   RocketMQ         #############  
##################################################  
rocketmq.producer.group = canal_pro  
rocketmq.enable.message.trace = false  
rocketmq.customized.trace.topic =  
rocketmq.namespace =  
rocketmq.namesrv.addr = xxx.xxx.xxx.xxx:9876  
rocketmq.retry.times.when.send.failed = 0  
rocketmq.vip.channel.enabled = false  
rocketmq.tag =
```

## 3.2 Spring实现

### 3.2.1. 项目配置文件

application.properties添加以下参数
```
rocketmq.name-server = http://xxx.xxxx.xxx.xxx:9876  
#canal配置文件中定义的生产者组  
rocketmq.producer.group = canal_pro  
#spring实现的客户端中的消费者组  
rocketmq.consumer.group = cms
```
### 3.2.2. 代码方案设计

由于canal模式已由tcp切换为rocketMQ，之前代码中CanalClient定义的CanalConnector连接在项目启动时会报错，可以将该文件注释（反正也用不上）。

canal服务同步接口：

```java
/**
 * Canal同步服务
 */
public interface CanalSyncService<T> {
    /**
     * 处理数据
     *
     * @param flatMessage CanalMQ数据
     */
    void process(FlatMessage flatMessage);
    /**
     * DDL语句处理
     */
    void ddl(FlatMessage flatMessage);
    /**
     * 插入
     *
     * @param list 新增数据
     */
    void insert(Collection<T> list);
    /**
     * 更新
     *
     * @param list 更新数据
     */
    void update(Collection<T> list);
    /**
     * 删除
     *
     * @param list 删除数据
     */
    void delete(Collection<T> list);
}
```

抽象Canal-RocketMQ通用处理服务:

```java
/**
 * 抽象Canal-RocketMQ通用处理服务
 */
@Slf4j
public abstract class AbstractCanalRocketMqRedisService<T> implements CanalSyncService<T> {

    @Resource
    private RedisTemplate redisTemplate;

    private Class<T> classCache;

    /**
     * 获取Model名称
     *
     * @return Model名称
     */
    protected abstract String getModelName();

    /**
     * 处理数据
     *
     * @param flatMessage CanalMQ数据
     */
    @Override
    public void process(FlatMessage flatMessage) {

        if (flatMessage.getIsDdl()) {
            ddl(flatMessage);
            return;
        }

        Set<T> data = getData(flatMessage);

        if ("INSERT".equals(flatMessage.getType())) {
            insert(data);
        }

        if ("UPDATE".equals(flatMessage.getType())) {
            update(data);
        }

        if ("DELETE".equals(flatMessage.getType())) {
            delete(data);
        }

    }

    /**
     * DDL语句处理
     *
     * @param flatMessage CanalMQ数据
     */
    @Override
    public void ddl(FlatMessage flatMessage) {
        //TODO : DDL需要同步，删库清空，更新字段处理
    }

    /**
     * 插入
     *
     * @param list 新增数据
     */
    @Override
    public void insert(Collection<T> list) {
        insertOrUpdate(list);
    }

    /**
     * 更新
     *
     * @param list 更新数据
     */
    @Override
    public void update(Collection<T> list) {
        insertOrUpdate(list);
    }

    /**
     * 删除
     *
     * @param list 删除数据
     */
    @Override
    public void delete(Collection<T> list) {
        Set<String> keys = Sets.newHashSetWithExpectedSize(list.size());

        for (T data : list) {
            keys.add(getWrapRedisKey(data));
        }

        redisTemplate.delete(keys);
    }

    /**
     * 插入或者更新redis
     *
     * @param list 数据
     */
    @SuppressWarnings("unchecked")
    private void insertOrUpdate(Collection<T> list) {
        redisTemplate.executePipelined((RedisConnection redisConnection) -> {
            for (T data : list) {
                String key = getWrapRedisKey(data);
                // 序列化key
                byte[] redisKey = redisTemplate.getKeySerializer().serialize(key);
                // 序列化value
                byte[] redisValue = redisTemplate.getValueSerializer().serialize(data);
                redisConnection.set(Objects.requireNonNull(redisKey), Objects.requireNonNull(redisValue));
            }
            return null;
        });
    }

    /**
     * 封装redis的key
     *
     * @param t 原对象
     * @return key
     */
    protected String getWrapRedisKey(T t) {
        return getModelName() + ":" + getIdValue(t);
    }

    /**
     * 获取类泛型
     *
     * @return 泛型Class
     */
    @SuppressWarnings("unchecked")
    protected Class<T> getTypeArgument() {
        if (classCache == null) {
            classCache = (Class) ((ParameterizedType) this.getClass().getGenericSuperclass()).getActualTypeArguments()[0];
        }
        return classCache;
    }

    /**
     * 获取Object标有@TableId注解的字段值
     *
     * @param t 对象
     * @return id值
     */
    protected Object getIdValue(T t) {
        Field fieldOfId = getIdField();
        ReflectionUtils.makeAccessible(fieldOfId);
        return ReflectionUtils.getField(fieldOfId, t);
    }

    /**
     * 获取Class标有@TableId注解的字段名称
     *
     * @return id字段名称
     */
    protected Field getIdField() {
        Class<T> clz = getTypeArgument();
        Field[] fields = clz.getDeclaredFields();
        for (Field field : fields) {
            TableId annotation = field.getAnnotation(TableId.class);

            if (annotation != null) {
                return field;
            }
        }
        log.error("PO类未设置@TableId注解");
        throw new RuntimeException("PO类未设置@TableId注解");
    }

    /**
     * 转换Canal的FlatMessage中data成泛型对象
     *
     * @param flatMessage Canal发送MQ信息
     * @return 泛型对象集合
     */
    protected Set<T> getData(FlatMessage flatMessage) {
        List<Map<String, String>> sourceData = flatMessage.getData();
        Set<T> targetData = Sets.newHashSetWithExpectedSize(sourceData.size());
        for (Map<String, String> map : sourceData) {
            T t = JSON.parseObject(JSON.toJSONString(map), getTypeArgument());
            targetData.add(t);
        }
        return targetData;
    }
}
```

MQ消费者监听:

```java
@Slf4j
@Service
@RocketMQMessageListener(nameServer = "${rocketmq.name-server:}",
                            topic = "example",
                            consumerGroup = "${rocketmq.consumer.group:}")
public class TestHolderConsumer extends AbstractCanalRocketMqRedisService<CodeHolder>
        implements RocketMQListener<FlatMessage>, RocketMQPushConsumerLifecycleListener {

    @Override
    public void onMessage(FlatMessage flatMessage) {
        log.info("consumer message {}", flatMessage);
        try {
            process(flatMessage);
        } catch (Exception e) {
            log.warn(String.format("message [%s] 消费失败", flatMessage), e);
            throw new RuntimeException(e);
        }
    }

    @Override
    public void prepareStart(DefaultMQPushConsumer consumer) {
        // set consumer consume message from now
        consumer.setConsumeFromWhere(ConsumeFromWhere.CONSUME_FROM_LAST_OFFSET);
        consumer.setConsumeTimestamp(UtilAll.timeMillisToHumanString3(System.currentTimeMillis()));
    }

    @Override
    protected String getModelName() {
        return CodeHolder.class.getSimpleName();
    }
}
```

### 3.2.3. Redis异步更新

启动项目进行验证，修改code\_holder表的数据，如添加type=1,code=dd的一条数据。查看redis可以看到对应的缓存：

![img_6](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525170137.png)

更新该条数据，重新查看：

![img_7](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525170147.png)

删除该条数据，redis中也会删除该缓存：

![img_8](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525170155.png)

至此，Canal成功利用mq将mysql数据同步至redis。

