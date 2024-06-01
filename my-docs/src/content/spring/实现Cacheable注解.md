# 实现Cacheable注解

在之前的[Spring Cache解析](../Spring%20Cache解析/Spring%20Cache解析.md)

小义已经实现@CacheableTtl支持配置缓存的过期时间，但是忽略了一个重要功能，就是@Cacheable是支持动态设置的，如：

```
@Cacheable(value="cityInfo", key="#code", unless="#result == null")
public getCityInfoDto queryByCode(String code){
    //...
}
```

而自己设计的@CacheableTtl注解并不能支持，需要继续优化！

## 二、实现

### 1、@CacheParam

定义CacheParam注解用于标记缓存的参数

```
/**
 * 缓存参数，自动将参数与Cacheable.key组合为动态key
 * 
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CacheParam {
    /**
     * 当修饰参数为复杂对象时，可指定为取值为对象属性。默认为空，直接取值对象本身
     * 
     * @return
     */
    public String value() default "";

}
```



### 2、定义拦截器父类

创建Aspect基类，提供基本的操作，原先的监听@CacheableTtl的拦截器CacheableAspect继承该基类

```
public class BaseAspect {
     /**
     * 根据指定注解方法获取拦截方法中的注解及参数值
     * 
     * @param pjp
     * @param method
     * @param annotationClass
     * @return List<[annotation, value]>
     */
    @SuppressWarnings("unchecked")
    protected <T> List<Pair<T, Object>> getMethodAnnotationAndParametersByAnnotation(final ProceedingJoinPoint pjp,
        Method method, Class<T> annotationClass) {

        Annotation[][] parameterAnnotations = method.getParameterAnnotations();

        if (parameterAnnotations == null || parameterAnnotations.length == 0) {
            return Collections.emptyList();
        }

        List<Pair<T, Object>> result = new ArrayList<>();
        int i = 0;
        for (Annotation[] annotations : parameterAnnotations) {
            for (Annotation annotation : annotations) {
                if (annotation.annotationType().equals(annotationClass)) {
                    result.add(Pair.of((T)annotation, pjp.getArgs()[i]));
                }
            }
            i++;
        }

        return result;
    }
}
```


### 3、定义Spring表达式（spEL）工具类

```
public class SpelUtils {
  private static final ExpressionParser expressionParser = new SpelExpressionParser();

  private SpelUtils() {
  }

  public static Object getValue(String expression) {
    return expressionParser.parseExpression(expression);
  }

  public static Object getValue(Object object, String expression) {
    // 解析上下文
    EvaluationContext context = new StandardEvaluationContext(object);
    return expressionParser.parseExpression(expression).getValue(context);
  }

}
```

### 4、拦截器拦截


### CacheableAspect继承BaseAspect之后，核心代码如下：

```
public class CacheableAspect extends BaseAspect {
    //...
    @Around(value = "pointcut")
    public Object around(final ProceedingJoinPoint pjp) throws Throwable {
        Method method = MethodSignature.class.cast(pjp.getSignature()).getMethod();
        CacheableTtl cacheable = method.getAnnotation(CacheableTtl.class);
        String key = generateCacheKey(pjp, method, cacheable);
        Object value = getCache(cacheable, key);
        if (null == value) {
            value = pjp.proceed();//执行方法
            setCache(cacheable, key, value);//设置缓存
        }
        return value;
    }
    //...
    //生成缓存的key
    private String generateCacheKey(ProceedingJoinPoint pjp, Method method, Cacheable cacheable) {
        List<Pair<CacheParam, Object>> pair = getMethodParametersByAnnotation(pjp, method, CacheParam.class);
        StringBuilder keyBuffer = new StringBuilder();
        for (Pair<CacheParam, Object> pair : pairs) {
            CacheParam cacheParam = pair.getKey();
            Object param = pair.getValue();
            // 支持表达式获取属性值
            if (param != null && StringUtils.isNotBlank(cacheParam.value())) {
                try{
                    param = SpelUtils.getValue(param, cacheParam.value());
                }catch(Exception e){
                    param = param;
                }
            }
            if (param == null) {
                keyBuffer.append(":-");
            } else {
                String tmp = param.toString();
                keyBuffer.append(":").append("".equals(tmp) ? "-" : (param.toString().replace(":", "-")));
            }
        }
        keyBuffer.insert(0, cacheable.key());
        String cacheKey = keyBuffer.toString();
        return cacheKey;
    }
    //...
}
```


### 5、接口实现

```
@CacheableTtl(key = "abs", ttl = 10, ttlTimeUnit = TimeUnit.MINUTES)@GetMapping("/id")
public String getTtl(@CacheParam("id") @RequestParam("id") String id) {
    UserInfo user = userService.getById(id);
    return user.getName();
}
```


## 三、总结


### 1、spel

在组装缓存key时，如果接口入参是一个对象，而@CacheParam的value值为该对象的某个属性，则用到了spring的表达式语言spel来解析参数：

param = SpelUtils.getValue(param, cacheParam.value());

### 2、Annotation

拦截器读取方法参数时，用到了method.getParameterAnnotations()，返回的是一个二维数组。

如果某个方法参数使用了多个注解，例如上述第五点接口使用的getTtl()方法中，入参id被@CacheParam和@RequestParam同时修饰，则parameterAnnotations\[0\]\[0\]=@CacheParam，

parameterAnnotations\[0\]\[1\]=@RequestParam