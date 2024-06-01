---
title: Java8编程小技巧
index: 0
icon: laptop-code
category:
  - java
---
# Java8编程小技巧，提高代码效率100%！超级实用！

大家好，我是小义，今天分享几个Java8编程小技巧，提高代码逼格，写出优雅代码，让同事看了也直呼内行。

### 一、树形结构

像页面菜单、淘宝分类、行政区划等都是树形结构，后端往往是用一张包含父子节点的数据库表来存储，需要在代码层面自己组装成结构树，可以用stream和递归快速实现。

```
public class OrderTest {
    //节点结构
    @Data
    @Accessors(chain = true)
    public class NodeDTO {
        private String id;
        private String name;
        private String parentId;
        private List<NodeDTO> children;
    }

    @Test
    public void children() {
        //模拟数据
        List<NodeDTO> list = new ArrayList<NodeDTO>(){{
            add(new NodeDTO().setId("3").setParentId("0").setName("广西"));
            add(new NodeDTO().setId("36").setParentId("3").setName("桂林市"));
            add(new NodeDTO().setId("369").setParentId("36").setName("阳朔县"));
            add(new NodeDTO().setId("2").setParentId("0").setName("广东"));
            add(new NodeDTO().setId("21").setParentId("2").setName("深圳"));
            add(new NodeDTO().setId("22").setParentId("2").setName("广州"));
            add(new NodeDTO().setId("211").setParentId("21").setName("南山区"));
            add(new NodeDTO().setId("985").setParentId("21").setName("福田区"));
            add(new NodeDTO().setId("1").setParentId("0").setName("北京市"));
            add(new NodeDTO().setId("11").setParentId("1").setName("朝阳区"));
        }};
        //获取行政区划结构树
        List<NodeDTO> treeNode = getTreeNode(new NodeDTO().setId("0"), list);
        System.out.println(treeNode);
    }

    /**
     * 节点递归调用
     * @param root
     * @param all
     * @return
     */
    private List<NodeDTO> getTreeNode(NodeDTO root, List<NodeDTO> all) {
        List<NodeDTO> collect = all.stream().filter(node -> Objects.equals(root.getId(), node.getParentId()))
                .map(levelNode -> levelNode.setChildren(getTreeNode(levelNode, all))).collect(Collectors.toList());
        return collect;
    }
}
```

### 二、Optional取值

当对对象的属性取值时，一不小心就可能报空指针异常，特别是属性嵌套的时候。

```
@Data
@Accessors(chain = true)
public class UserDTO {
    private String personId;
    private String name;
    private String age;
    private CarDTO car;
    
    @Data
    public static class CarDTO {
        private String name;
        private SignPaper signPaper;
    }
    
    @Data
    public static class SignPaper {
        private String signName;
    }
}
```

针对UserDTO类，要想取到SignPaper的name值，就得层层判空，像下面这样。

```
  public String testSignName(UserDTO user) {
      if (null == user) {
          return "";
      }
      if (null == user.getCar()) {
          return "";
      }
      if (null == user.getCar().getSignPaper()) {
          return "";
      }
      return user.getCar().getSignPaper().getSignName();
  }
```

但利用Optional，只用一行代码就可以解决。

```
String signName = Optional.ofNullable(user).map(userDTO -> userDTO.getCar()).map(carDTO -> carDTO.getSignPaper()).map(SignPaper::getSignName).orElse("");
```

### 列表运算

1.  排序。列表排序在业务场景中经常会使用到，可以通过List本身的sort方法来实现。


```
List<UserDTO> list = Lists.newArrayList();
//先按年龄字段从小到大排序，并把空值的放后面；接着按姓名排序
list.sort(Comparator.comparing(UserDTO::getAge, Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(UserDTO::getName));
```

2.  属性去重。列表往往还需要去重，像只针对对象的某个字段去重的特殊操作，需要借助TreeSet的唯一性来实现。


```
List<UserDTO> list = Lists.newArrayList();
//list.add(...)
//对象属性去重
List<UserDTO> distinctList = list.stream().collect(Collectors.collectingAndThen(Collectors.toCollection(() -> new TreeSet<>(Comparator.comparing(UserDTO::getPersonId))), ArrayList::new));
```

3.  BigDecimal求和。金额计算统一用BigDecimal来计算，可以避免精度缺失。求和代码示例如下：


```
List<CarDTO> carDTOList = Lists.newArrayList();
        BigDecimal sum = carDTOList.stream().map(car -> Optional.ofNullable(car.getPrice()).orElse(BigDecimal.ZERO)).reduce(BigDecimal.ZERO, BigDecimal::add);

```

4.  分组。将列表分组拼接需要的字符串或者是分组后再对分组后的子列表做聚合。


```
//按年龄分组，然后拼接姓名
Map<String, String> ageMap = list.stream().collect(Collectors.groupingBy(UserDTO::getAge,
                Collectors.mapping(UserDTO::getName, Collectors.joining(","))));

//先按年龄分组，再将各小组数据组装成统计实体，最后返回一个列表
List<OverviewDTO> overviewList = list.stream().collect(Collectors.groupingBy(UserDTO::getAge, Collectors.toList())).entrySet().stream().map(entry -> {
    OverviewDTO overview = new OverviewDTO();
    overview.setCarName(entry.getValue().stream().map(userDTO -> Optional.ofNullable(userDTO.getCar()).map(CarDTO::getName).orElse(""))
            .collect(Collectors.joining(",")));
    overview.setAge(entry.getKey());
    return overview;
}).collect(Collectors.toList());
```

5.  降维。列表里面嵌套列表的场景也很常见，像下面的PayDTO结构。


```
@Data
public class PayDTO {
    private BigDecimal sumPay;
    private String orderNo;
    private List<BatchPayDTO> batchPayList;
    @Data
    public static class BatchPayDTO {
        private String batchNo;
        List<BatchPlanDTO> batchPlanList;
    }
    @Data
    public static class BatchPlanDTO {
        private String planNo;
        List<GoodsInfoDTO> goodsPayList;
    }
    @Data
    public static class GoodsInfoDTO {
        private String goodsNo;
        private String Code;
        private String Name;
        private BigDecimal payAmount;
    }
}
```

如果要获取PayDTO最里层的GoodsInfoDTO列表项，传统方式可能像下面这样层层遍历。

```
ArrayList<PayDTO> payList = Lists.newArrayList();
//payList.add(...)
List<PayDTO.GoodsInfoDTO> goodsList = Lists.newArrayList();
for (PayDTO payDTO : payList) {
    if (CollUtil.isNotEmpty(payDTO.getBatchPayList())) {
        for (PayDTO.BatchPayDTO batchPayDTO : payDTO.getBatchPayList()) {
            if (CollUtil.isNotEmpty(batchPayDTO.getBatchPlanList())) {
                for (PayDTO.BatchPlanDTO batchPlanDTO : batchPayDTO.getBatchPlanList()) {
                    if (CollUtil.isNotEmpty(batchPlanDTO.getGoodsPayList())) {
                        goodsList.addAll(batchPlanDTO.getGoodsPayList());
                    }
                }
            }
        }
    }
}
```

看起来不太优雅，判断繁琐，括号又多，换成stream流式运算就可以完美解决。

```
ArrayList<PayDTO> payList = Lists.newArrayList();
//payList.add(...)
List<PayDTO.GoodsInfoDTO> goodsInfoList = payList.stream()
        .filter(i -> CollUtil.isNotEmpty(i.getBatchPayList())).flatMap(i -> i.getBatchPayList().stream())
        .filter(j -> CollUtil.isNotEmpty(j.getBatchPlanList())).flatMap(j -> j.getBatchPlanList().stream())
        .filter(k -> CollUtil.isNotEmpty(k.getGoodsPayList())).flatMap(k -> k.getGoodsPayList().stream())
        .collect(Collectors.toList());
```