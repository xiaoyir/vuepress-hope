# 一文搞懂Redis的渐进式rehash扩容机制

大家好，我是小义。今天来聊一下redis的rehash，也就是哈希表的扩容操作。

相信大家对hashMap都不陌生，其底层结构是数组加链表加红黑树（红黑树这里不展开），数组默认大小为16，通过key的hash值可以实现从键到值的快速访问。

![img](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525174855.png)

从hashMap源码可以看出，当数组容量超过装载阈值时，就会成倍扩容。对使用一张全局哈希表来保存所有键值对的redis来说，rehash同样如此。

### 底层数据结构

一个哈希表，就是一个数组，数组的每个元素称为一个哈希桶（dictEntity），每个哈希桶中保存了键值对数据（指向具体值的指针）。

![img_1](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525174905.png)

众所周知，redis是用C语言写的。redis使用dict字典数据结构来存储哈希表，一个redis实例对应一个dict，来一起看看具体代码。

```
#dict字典的数据结构
typedef struct dict{
    dictType *type; //直线dictType结构，dictType结构中包含自定义的函数，这些函数使得key和value能够存储任何类型的数据
    void *privdata; //私有数据，保存着dictType结构中函数的 参数
    dictht ht[2]; //两张哈希表
    long rehashidx; //rehash的标记，rehashidx=-1表示没有进行rehash，rehash时每迁移一个桶就对rehashidx加一
    int itreators;  //正在迭代的迭代器数量
}

#dict结构中ht[0]、ht[1]哈希表的数据结构
typedef struct dictht{
    dictEntry[] table;        //存放一个数组的地址，数组中存放哈希节点dictEntry的地址
    unsingned long size;      //哈希表table的大小，出始大小为4
    unsingned long  sizemask; //用于将hash值映射到table位置的索引，大小为（size-1）
    unsingned long  used;     //记录哈希表已有节点（键值对）的数量
}

#哈希表节点结构定义
typedef struct dictEntity{
    void *key;//键
    //值
    union{
        void *val;//自定义类型
        uint64_t u64;//无符号整形
        int64_t s64;//符合整形
        double d;//浮点型
    } v;
    struct dictEntity *next;//发生哈希冲突时使用。指向下一个哈希表节点，形成链表
}
```

### rehash触发机制

在向redis中添加键时，会调用\_dictExpandIfNeeded函数来判断是否需要扩容。

```
/* Expand the hash table if needed */
static int _dictExpandIfNeeded(dict *d)
{
    /* Incremental rehashing already in progress. Return. */
    // 如果正在进行渐进式扩容，则返回OK
    if (dictIsRehashing(d)) return DICT_OK;
  
    /* If the hash table is empty expand it to the initial size. */
    // 如果哈希表ht[0]的大小为0，则初始化字典
    if (d->ht[0].size == 0) return dictExpand(d, DICT_HT_INITIAL_SIZE);
  
    /* If we reached the 1:1 ratio, and we are allowed to resize the hash
     * table (global setting) or we should avoid it but the ratio between
     * elements/buckets is over the "safe" threshold, we resize doubling
     * the number of buckets. */
    /*
     * 如果哈希表ht[0]中保存的key个数与哈希表大小的比例已经达到1:1，即保存的节点数已经大于哈希表大小
     * 且redis服务当前允许执行rehash；或者保存的节点数与哈希表大小的比例超过了安全阈值（默认值为5）
     * 则将哈希表大小扩容为原来的两倍
     */
    if (d->ht[0].used >= d->ht[0].size &&
        (dict_can_resize ||
         d->ht[0].used/d->ht[0].size > dict_force_resize_ratio))
    {
        return dictExpand(d, d->ht[0].used*2);
    }
    return DICT_OK;
}

```

简单来说，Redis 会使用装载因子（load factor）来判断是否需要做 rehash。装载因子的计算方式是，哈希表中所有 entry 的个数除以哈希表的哈希桶个数（数组长度）。当满足以下条件中的其中一个时就会进行扩容。

*   装载因子 ≥ 1，同时，哈希表被允许进行 rehash。在进行 RDB 生成和 AOF 重写时，哈希表的 rehash 是被禁止的，这是为了避免对 RDB 和 AOF 重写造成影响。

*   装载因子 ≥ 5。


### 渐进式rehash

扩展或收缩哈希表需要将 ht\[0\] （旧全局哈希表） 的所有键值对移动到 ht\[1\]（新全局哈希表） 当中。这个动作是分多次，渐进式地完成的。原因在于当键值对过多时，一次性移动所有键值对会导致Redis在一段时间内无法对外提供服务。

渐进式 rehash 步骤如下：

1.  为 ht\[1\] 分配内存空间，此时字典同时存在两个哈希表。

2.  将 dict::rehashidx 置为 0，rehash 工作正式开始。

3.  在 rehash 进行期间，每次对字典执行增删改查操作时，程序在执行客户端指定操作之外，还会将 ht\[0\] 在 rehashidx 索引上的所有键值对rehash 到 ht\[1\]，然后将 rehashidx 的值加一。也就是从ht\[0\] 的第一个索引位置开始，将这个索引位置上的所有 entries 拷贝到ht\[1\] 中，接着依次处理下一个哈希桶。


![img_2](https://javacool.oss-cn-shenzhen.aliyuncs.com/img/xyr/20240525175215.png)

4.  随着字典操作的不断执行，ht\[0\] 的所有键值对最终会全部移动到 ht\[1\]，此时程序会将 rehashidx 设为 -1，释放ht\[0\]的空间，表示 rehash 操作已完成。


需要注意的是，在渐进式 rehash 操作过程中，因为同时存在两个哈希表，所以对key的删除，查找，更新操作会在两个哈希表上进行。redis会先尝试在 ht\[0\] 中寻找目标键值对，如果没有找到则会在 ht\[1\] 再次寻找。

但是新增操作就不一样了，新增key只会在新的哈希表 ht\[1\] 上进行，为的是确保 ht\[0\] 中的已经被清空的单向链表不会新增元素。在 rehash 被触发后，即使没有收到新请求，Redis 也会定时执行一次 rehash 操作，而且，每次执行时长不会超过 1ms，以免对其他任务造成影响。