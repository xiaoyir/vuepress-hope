---
title: Spring cache解析
---
# Spring cache解析

本文基于springboot2.3.7版本进行分析，对应的spring-context版本为5.2.12，官方文档地址如下：

> https://docs.spring.io/spring-framework/docs/5.2.12.RELEASE/spring-framework-reference/integration.html#cache

一、spring cache默认实现

1.  springboot启动类添加@EnableCaching注解开启缓存，新增SpringContextUtil应用上下文用于获取bean


```
@Component
public class SpringContextUtil implements ApplicationContextAware {
    private static ApplicationContext applicationContext;
    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        this.applicationContext = applicationContext;
    }
    public static ApplicationContext getApplicationContext() {
        return applicationContext;
    }
    public static Object getBean(String name) throws BeansException {
        return applicationContext.getBean(name);
    }
    public static <T> T getBean(Class<T> clazz) throws BeansException {
        return applicationContext.getBean(clazz);
    }
}
```

2.测试TestController类

```
@RequestMapping("/test")
@RestController
public class TestController {
    @PostMapping("/name")
    @Cacheable(key = "#root.args[0]", value = "name")
    public String name(@RequestParam String id) {
        String value = id.concat("-").concat(String.valueOf(UUID.randomUUID()));
        return value;
    }
    @PostMapping("/check")
    public void check() {
        CacheManager bean = SpringContextUtil.getBean(CacheManager.class);
        return;
    }
}
```

3.多次调用name接口，检查cacheManager，可以发现spring Cache默认实现是concurrentMapCacheManager，里面是一个嵌套的hashMap，外层cacheMap用于存放value定义的"name"名称，内层store存放真正的缓存数据

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180633.png)
4.store存放/name接口返回值的具体逻辑由cacheInterceptor拦截器实现，cacheInterceptor会执行CacheAspectSupport中的apply方法缓存接口返回值

```
public void apply(@Nullable Object result) {
    if (this.context.canPutToCache(result)) {
        Iterator var2 = this.context.getCaches().iterator();

        while(var2.hasNext()) {
            Cache cache = (Cache)var2.next();
            CacheAspectSupport.this.doPut(cache, this.key, result);
        }
    }

}

```



二、设置缓存过期时间

concurrentMapCacheManager并没有提供ttl设置，删除缓存只能通过evict，可以利用java继承特性，覆盖spring默认获取缓存方法，增加ttl校验

1.  继承默认缓存处理器ConcurrentMapCacheManager


```
@EnableCaching
@Component
public class ConcurrentTTLCacheManager extends ConcurrentMapCacheManager {
    private SerializationDelegate serializationDelegate;
    @PostConstruct
    public void initSerialization() {
        Field serialization = ReflectionUtils.findField(ConcurrentMapCacheManager.class, "serialization");
        ReflectionUtils.makeAccessible(serialization);
        this.serializationDelegate = (SerializationDelegate) ReflectionUtils.getField(serialization, this);
    }
    @Override
    protected Cache createConcurrentMapCache(String name) {
        SerializationDelegate actualSerialization = this.isStoreByValue() ? this.serializationDelegate : null;
        return new ConcurrentTTLCache(name, new ConcurrentHashMap(256), this.isAllowNullValues(), actualSerialization);
    }
}
```

2.继承默认缓存实现concurrentMapCache

```
public class ConcurrentTTLCache extends ConcurrentMapCache {
    public ConcurrentTTLCache(String name, ConcurrentHashMap<Object, Object> store, boolean allowNullValues, SerializationDelegate actualSerialization) {
        super(name, store, allowNullValues, actualSerialization);
    }
    @Override
    protected Object lookup(Object key) {
        Object lookup = super.lookup(key);
        if (lookup instanceof TTLCache && ((TTLCache) lookup).isExpire()) {
            super.evict(key);
            return null;
        }
        return lookup;
    }
}
```

3.定义包含时间属性的抽象父类和继承子类

```
@Data
public class TTLCache {
    private Date expire;
    public boolean isExpire(){
        return expire.before(new Date());
    }
}

@Data
public class CustomVo extends TTLCache {
    private String code;
    private String age;
}
```

4.实践测试，当触发缓存时会执行ConcurrentTTLCache中的lookup方法判断时间是否过期

```
@GetMapping("/put")
@Cacheable(value = "ttlCache", cacheManager = "concurrentTTLCacheManager", key = "#root.args[0]")
public CustomVo custom() throws Exception {
    CustomVo customVo = new CustomVo();
    //设置过期时间
    SimpleDateFormat simpleDateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    Date parse = simpleDateFormat.parse("2023-07-23 22:00:00");
    customVo.setExpire(parse);
    return customVo;
}
```



三、切换为redis实现

concurrentMapCache是jvm缓存，无法满足分布式，而且过期时间设置较为麻烦，这时候就需要引入redis

1.添加maven依赖包

```
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
    <version>2.3.7.RELEASE</version>
</dependency>
```

2.系统参数配置

```
spring.redis.host=http://localhost
spring.redis.port=6379
spring.redis.database=0
spring.redis.password=
```

3.设置缓存管理器

```
@Configuration
@EnableCaching
public class RedisCacheConfig extends CachingConfigurerSupport {
    @Bean
    @Primary
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        objectMapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance, ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);
        GenericJackson2JsonRedisSerializer genericJackson2JsonRedisSerializer = new GenericJackson2JsonRedisSerializer(objectMapper);
        RedisCacheConfiguration redisCacheConfig = RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofMinutes(10)).disableCachingNullValues()
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(genericJackson2JsonRedisSerializer));
        return RedisCacheManager.builder(factory).cacheDefaults(redisCacheConfig).build();

    }
}
```

4.切换为redis后默认所有的缓存有效期设置了10分钟，如果想自定义过期时间，可以增设缓存处理器。做法如下，新增自定义的redisTtlCacheManager处理器，在redisCacheConfig配置类中新增bean

```
public class RedisTtlCacheManager extends RedisCacheManager {
    public RedisTtlCacheManager(RedisCacheWriter redisCacheWriter, RedisCacheConfiguration redisCacheConfiguration) {
        super(redisCacheWriter,redisCacheConfiguration);
    }
    protected RedisCache createRedisCache(String name, RedisCacheConfiguration cacheConfig) {
        String[] strings = StringUtils.delimitedListToStringArray(name, "-");
        name = strings[0];
        if (strings.length > 1) {
            long l = Long.parseLong(strings[1]);
            cacheConfig = cacheConfig.entryTtl(Duration.ofSeconds(l));
        }
        return super.createRedisCache(name, cacheConfig);
    }
}
```

```
public class RedisCacheConfig extends CachingConfigurerSupport {
    @Bean
    @Primary
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        //...

    }

    @Bean
    public RedisCacheManager ttlCacheManager(RedisTemplate<String, Object> redisTemplate) {
        RedisCacheWriter redisCacheWriter = RedisCacheWriter.nonLockingRedisCacheWriter(redisTemplate.getConnectionFactory());
        RedisCacheConfiguration redisCacheConfiguration = RedisCacheConfiguration.defaultCacheConfig().serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(redisTemplate.getValueSerializer()));
        return new RedisTtlCacheManager(redisCacheWriter, redisCacheConfiguration);
    }

    @Bean
    public RedisTemplate redisTemplate(@Autowired RedisConnectionFactory redisConnectionFactory) {
        RedisTemplate<Object, Object> redisTemplate = new RedisTemplate<>();
        redisTemplate.setConnectionFactory(redisConnectionFactory);
        redisTemplate.setKeySerializer(new StringRedisSerializer());
        redisTemplate.setHashKeySerializer(new StringRedisSerializer());
        Jackson2JsonRedisSerializer jackson2JsonRedisSerializer = new Jackson2JsonRedisSerializer(Object.class);
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        objectMapper.enableDefaultTyping(ObjectMapper.DefaultTyping.NON_FINAL);
        jackson2JsonRedisSerializer.setObjectMapper(objectMapper);
        redisTemplate.setValueSerializer(jackson2JsonRedisSerializer);
        redisTemplate.afterPropertiesSet();
        return redisTemplate;
    }
}
```

5.使用实践，设置过期时间1000s

```
@GetMapping("/name")
@Cacheable(key = "#root.args[0]", value = "name-1000", cacheManager = "ttlCacheManager", unless = "#result=null")
public String name(@RequestParam String id) {
    String value = id.concat("-").concat(String.valueOf(UUID.randomUUID()));
    return value;
}
```

四、自定义缓存拦截器

1.redisTemplate和redisCacheManager

当添加spring-boot-starter-data-redis依赖包后，就可以使用如下代码操作redis
```
String value = (String) redisTemplate.opsForValue().get("ab");
```
当然也可以用继承了cacheManager的redisCacheManager来操作缓存

```
RedisCacheManager cacheManager = SpringContextUtil.getBean(RedisCacheManager.class);
Cache name = cacheManager.getCache("name");
String ab = name.get("ab", String.class);
```

两者都可以实现redis缓存运用，其区别是redisTemplate是redis的专用工具类，而cacheManager是spring cache模块提供的一个统一SPI接口，redisCacheManager是对它的实现

2.可以通过redisTemplate和Aspect来实现Spring Cache的整个缓存处理过程。首先参照@Cache注解，定义自己的新注解@CacheTtl，新增ttl时间属性

```
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface CacheableTtl {
    /**
     * 缓存key。推荐用xx:yy格式
     *
     * @return
     */
    public String key() default "";

    /**
     * 缓存有效期，默认为30。时间单位{@link #ttlTimeUnit}
     * 注意ehcache仅支持0（表示永久）、5秒、30秒、60秒、5分钟、半小时、1小时
     *
     * @return
     */
    public long ttl() default 30;

    /**
     * 缓存有效期时间单位，默认为分钟。时间单位参考{@link TimeUnit java.util.concurrent.TimeUnit} ;如果cacheManager=ehCacheCacheManager时，该属性无效
     *
     * @return
     */
    public TimeUnit ttlTimeUnit() default TimeUnit.MINUTES;

    /**
     * 使用的缓存管理器，目前支持redisCacheManager、ehCacheCacheManager两种，默认redisCacheManager
     *
     * @return
     */
    public String cacheManager() default "redis";

}
```

3.新增缓存拦截器，针对使用了@CacheableTtl注解的方法设置缓存

```
@Component
@Aspect
public class CacheableAspect {

    private final RedisTemplate<String, Object> redisTemplate;


    public CacheableAspect(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Pointcut("@annotation(com.team.thirdmanage.cache.CacheableTtl)")
    public void pointcut() {}

    @Around(value = "pointcut()")
    public Object around(final ProceedingJoinPoint pjp) throws Throwable {
        Method method = MethodSignature.class.cast(pjp.getSignature()).getMethod();
        CacheableTtl cacheable = method.getAnnotation(CacheableTtl.class);
        String key = cacheable.key();
        Object value = getCache(cacheable, key);
        if (null == value) {
            value = pjp.proceed();
            setCache(cacheable, key, value);
        }
        return value;
    }

    private void setCache(CacheableTtl cacheable, String key, Object value) {
        // 查询不到数据，设置NULL替换符
        if (value == null) {
            setRealCache(key, "*", cacheable);
            return;
        }
        setRealCache(key, value, cacheable);
    }

    private Object getCache(CacheableTtl cacheable, String key) {
        Object value = null;
        switch (cacheable.cacheManager()) {
            case "redis":
                value = redisTemplate.opsForValue().get(key);
                break;
            default:
                break;
        }
        return value;
    }

    private void setRealCache(String key, Object value, CacheableTtl cacheable) {
        long ttl = cacheable.ttl();
        TimeUnit timeUnit = cacheable.ttlTimeUnit();
        switch (cacheable.cacheManager()) {
            case "redis":
                redisTemplate.opsForValue().set(key, value, ttl, timeUnit);
                break;
            default:
                break;
        }
    }

}
```

4.使用自定义注解测试

```
@GetMapping("/ttl")
@CacheableTtl(key = "cacheTtl", ttl = 10, ttlTimeUnit = TimeUnit.MINUTES)
public String testTtl(@RequestParam String id) {
    String value = id.concat("-").concat(String.valueOf(UUID.randomUUID()));
    return value;
}
```

可以看到数据已经被存入redis中！

![img_1](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525180647.png)