---
# ===== 结构化字段（frontmatter）→ 映射到 product-superset.html 的 data-field =====
# 产品：FEM标准桥式起重机（欧式桥式起重机）。内容以原站 1:1 静态页为准提取。
slug: overhead-cranes-for-sale
template: product-superset@1
title: FEM标准桥式起重机
breadcrumb:
  current: FEM标准桥式起重机
  trail:
    - { label: 首页, url: "https://www.dgcrane.com/zh/" }
    - { label: 桥式起重机, url: "https://www.dgcrane.com/zh/overhead-cranes/" }

# hero（页头横幅）：src 由 data-field 设置，渲染器会去掉模版残留 srcset
hero:
  image: European-Overhead-Crane-scaled.jpg
  headline: 起重机制造商和出口商
  highlights:
    - 10年以上的起重机出口经验
    - 起重机已销往120多个国家
    - 一个由50多人组成的技术团队
    - 3000多个不同行业的案例

# product-summary（标题 + 报价 CTA）。简介导语见正文 <!--block:summary-intro-->（多段，可编辑）
summary:
  cta: 报价要求

# 快速参数（specs：data-repeat="specs" 可重复组，可在编辑器里逐行增删/改）
specs:
  - { text: "容量：3.2-80吨" }
  - { text: "跨度长度：4-31.5米" }
  - { text: "提升高度：根据客户的现场条件定制" }
  - { text: "工作职责。A5" }
  - { text: "工作电压：220V~690V，50-60Hz，3ph AC" }
  - { text: "保护等级。IP54 IP55" }
  - { text: "起重机控制模式。悬挂式控制/远程控制/机舱控制" }

# gallery（产品图库，data-repeat="gallery"，19 张）
gallery:
  - { image: 5Ton-European-type-single-girder-overhead-crane-3.jpg, alt: 5吨欧式单梁桥式起重机 3 }
  - { image: 5Ton-European-type-single-girder-overhead-crane-1.jpg, alt: 5吨欧式单梁桥式起重机1台 }
  - { image: 15Ton-European-type-single-girder-overhead-crane.jpg, alt: 15吨欧式单梁桥式起重机 }
  - { image: 5Ton-NLH-European-Type-double-girder-overhead-crane-2.jpg, alt: 5吨NLH欧式双梁桥式起重机 2 }
  - { image: 5Ton-NLH-European-Type-double-girder-overhead-crane-1.jpg, alt: 5吨NLH欧式双梁桥式起重机 1 }
  - { image: 5Ton-NLH-European-Type-double-girder-overhead-crane-3.jpg, alt: 5吨NLH欧式双梁桥式起重机 3 }
  - { image: NLH-European-type-double-girder-overhead-crane-1.jpg, alt: NLH欧式双梁桥式起重机 1 }
  - { image: NLH-European-type-double-girder-overhead-crane-2.jpg, alt: NLH欧式双梁桥式起重机 2 }
  - { image: NLH-European-type-double-girder-overhead-crane-3.jpg, alt: NLH欧式双梁桥式起重机 3 }
  - { image: 12.5ton-European-type-double-girder-overhead-crane.jpg, alt: 12.5吨欧式双梁桥式起重机 }
  - { image: European-type-hoist.jpg, alt: 欧式提升机 }
  - { image: Euro-type-overhead-crane-2.jpg, alt: 欧式桥式起重机 2 }
  - { image: Euro-type-overhead-crane-3.jpg, alt: 欧式桥式起重机 3 }
  - { image: Euro-type-overhead-crane-5.jpg, alt: 欧式桥式起重机 5 }
  - { image: Euro-type-overhead-crane-4-1.jpg, alt: 欧式桥式起重机 4 1 }
  - { image: Euro-type-overhead-crane-6.jpg, alt: 欧式桥式起重机 6 }
  - { image: Euro-type-overhead-crane-7.jpg, alt: 欧式桥式起重机 7 }
  - { image: Euro-type-overhead-crane-8.jpg, alt: 欧式桥式起重机 8 }
  - { image: Euro-type-overhead-crane-9.jpg, alt: 欧式桥式起重机 9 }

# components（部件分解，data-repeat="components"）：图片清单，按正文 ### 同序对齐
# 注：电控系统图 Crane-electric-control-bo.jpg 原站亦引用，但素材缺失（见仓库说明）；
#     第 7 项「保护装置」无图（image: null）。
components_images:
  - { name: 主梁, image: Main-girder.jpg }
  - { name: 末端车架, image: End-carriages.jpg }
  - { name: 升降机构, image: European-type-wire-rope-hoist.jpg }
  - { name: 起重机行走齿轮马达, image: SEW-gear-motor-for-crane-traveling.jpg }
  - { name: 电控系统, image: Crane-electric-control-bo.jpg }
  - { name: 控制模式, image: Pendant-controller.jpg }
  - { name: 欧洲型桥式起重机的保护装置, image: null }

# production-flow（生产流程，data-repeat="production-flow"，8 步）
production_flow:
  title: 一种欧洲类型的桥式起重机将在45天内生产出来
  tips: 不同电压的起重机的交货时间可能会延长10-15天，因为电气元件需要由我们的供应商定制。
  steps:
    - { label: 来料检验, image: 1-Incoming-material-sample-test-1.jpg }
    - { label: 钢板开卷和开裂, image: 2-Steel-plate-uncoiling-and-falttening.jpg }
    - { label: 钢板切割, image: 3-Steel-sheeting-cuttig.jpg }
    - { label: 滚动槽, image: 4-Rolling-groove.jpg }
    - { label: 焊接主大梁, image: 5_Welding-the-main-girder.jpg }
    - { label: 起重机预装, image: 7-Crane-pre-assembling.jpg }
    - { label: 欧洲型钢丝绳吊杆的组装, image: 8_Assembly-of-the-European-type-wire-rope-hoists.jpg }
    - { label: 起重机包装和交付, image: 9-Crane-packing-and-delivery.jpg }

# crane-types（按应用分型号，data-repeat="crane-types"，3 项）
crane_types_images:
  - { name: 高清欧式单梁桥式起重机, image: HD-European-type-single-girder-overhead-crane.jpg }
  - { name: NLH欧洲型双梁桥式起重机, image: NLH-European-type-double-girder-overhead-crane.jpg }
  - { name: QD型欧式双梁桥式起重机, image: QD-European-type-double-girder-overhead-crane.jpg }

# installation（现场安装/远程指导，标题 + 正文 + 案例链接卡 data-repeat="cases"，4 项）
installation:
  title: 可进行现场安装或远程指导
  cases:
    - { title: 5吨欧式单梁Overhead Cranes销往津巴布韦, image: 2.After-painting-the-main-beam.jpg, url: "https://www.dgcrane.com/zh/posts/5ton-european-single-girder-overhead-cranes-for-sale-to-zimbabwe/" }
    - { title: 3吨全电动小型龙门吊配5吨欧洲电动葫芦销往澳大利亚, image: Main-beam-and-ground-beams-of-3t-fully-electric-mini-gantry-crane.jpg, url: "https://www.dgcrane.com/zh/posts/3t-fully-electric-mini-gantry-crane-with-5t-european-electric-hoist-for-sale-to-australia/" }
    - { title: 5吨高清欧式单梁桥式起重机出售到卡塔尔, image: Rainproof-cloth-packaging.jpg, url: "https://www.dgcrane.com/zh/posts/5ton-hd-european-type-single-girder-overhead-crane-exported-to-qatar/" }
    - { title: 4套双梁龙门起重机和5套双梁桥式起重机出售给菲律宾, image: Installation-Photo.png, url: "https://www.dgcrane.com/zh/posts/4-sets-of-mg-16t-s16-6m-a5-double-girder-gantry-cranes-5-sets-of-lh10t-15t-s21-135m-a3-a5-double-girder-overhead-cranes-exported-to-philippines/" }

# ===== 动态模块（data-dynamic）=====
inquiry_form:
  type: inquiry-form
  form_id: 713
  title: 填写您的详细资料，我们将在24小时内给您答复!

related_products:
  type: related-products
  title: 相关产品
  category: overhead-cranes
  limit: 4
  seed:
    - { title: FEM标准钢丝绳电动葫芦, image: European_Wire_Rope_Electric_Hoist.jpg, url: "https://www.dgcrane.com/zh/products/wire-rope-hoist-suppliers/", summary: "欧式钢丝绳电动葫芦的起升机构采用行星齿轮，结构紧凑，重量轻，安装在卷筒内，有效地缩小了葫芦的整体尺寸。欧式钢丝绳电动葫芦的设计最大程度地采用了模块化设计，各部件的通用程度高。" }
    - { title: FEM标准电动环链升降机, image: European_Electric_Chain_Hoist.jpg, url: "https://www.dgcrane.com/zh/fem-standard-electric-chain-hoists/", summary: "欧式环链电动葫芦结构紧凑，性能可靠。模块化设计使我们的产品可以灵活地组成不同的起重吨位、起重速度和工作等级系统。优异的性能满足了货物快速转移和精密装配的要求，也可广泛应用于使用要求复杂的场所，满足客户的个性化需求。" }
    - { title: FEM标准门式起重机, image: European_Gantry_Crane.jpg, url: "https://www.dgcrane.com/zh/fem-standard-gantry-cranes/", summary: "欧式龙门吊采用欧洲设计标准和制造技术，达到了国际同类产品的先进水平，如高度低、重量轻、轮压小、直接驱动灵活、无级变速、免维护等。" }
    - { title: FEM标准旋臂式起重机, image: European_Jib_Crane.jpg, url: "https://www.dgcrane.com/zh/fem-standard-jib-cranes/", summary: "欧式旋臂吊结构独特，安全可靠，具有高效、节能、省时、灵活等特点。它特别适用于短距离、高强度的吊装场所。欧式旋臂吊广泛用于车间、仓库、码头等固定场所。工作等级一般为A4或A5。" }
---

## 导语 <!--block:summary-intro-->

欧式桥式起重机是在欧洲先进的设计和制造技术的基础上，结合国内最新标准自主开发设计的。

外观漂亮，传动机构采用三合一减速器（硬齿面减速器、变频制动电机），在外观和技术性能上完全可以与欧洲同类产品媲美。

## 概述 <!--block:overview-->

欧式桥式起重机广泛用于机械制造、石油、石化、港口、铁路、民航、电力、食品、造纸、建材、电子等行业的车间和仓库等物料搬运场合。它们特别适用于需要精确定位的材料处理。, 大型部件的精密装配等场合。

其优越性能体现在模块化设计、变频调速、自动检测等先进技术的成熟应用。过载保护、过流保护、失压保护等完善的保护功能使起重机的应用和工作性能更加完善。

## 优势 <!--block:advantages-->

- 结构紧凑
- 良好的刚度
- 操作简便
- 低噪音
- 节省厂房空间和投资成本
- 安全性和可靠性
- 美丽的外观

## 欧洲型桥式起重机的保护装置 <!--block:protection-->

- 变频器：变频器的保护功能可以对各驱动机构进行短路、过流、电机过热、欠压、过压、接地、短路、防失速、散热器过热、制动单元过热保护。
- 配电保护。起重机配电的主回路装有保护部件，如主电源的自动空气开关和主接触器。
- 短路保护。主电源电路装有自动开关作为起重机的短路保护；控制电路装有小容量自动空气开关作为短路保护。
- 过载保护。起重机各机构的电机均装有单独的过流保护装置作为过载保护；主电源的自动空气开关作为起重机的过载保护。
- 相序保护。设备采用相序保护器，实时监控电源质量。当电源因外界原因产生过压、欠压、缺相或相序变化时，控制系统将切断主回路，有效保护设备和人员的安全。
- 升降机限位保护。升降机构配备了就位限位开关和限位开关。就位限位开关可确保升降机构在就位时自动停止。限位开关可以确保升降机构在吊钩上升到极限位置时自动切断。
- 行走限位保护。起重机行进和小车横移机构一般都装有在位限位开关和两端的限位开关。
- 紧急断电保护。起重机的控制电路上装有紧急开关。当事故发生时，可随时切断控制电路的电源，然后切断主电路，保证起重机的安全运行。
- 防腐、防尘和密封措施。

## 简介 <!--block:introduction-->

桥式起重机广泛应用于仓库和工厂，是一种重要的材料处理设备。虽然，不同的国家和地区有自己的特点。

在中国，最初的桥式起重机和制造技术是源于前苏联的。经过几十年的发展，桥式起重机已经像现在一样，在中国几乎所有的领域都得到了应用，这已经证明了它的优良特性。

因此，如果你来自俄罗斯，这对你来说将是非常熟悉的。其他方面，如果你来自欧洲和美国地区，情况就不同了。接下来，让我们谈谈欧式桥式起重机的销售。

说实话，出售的桥式起重机在世界范围内使用得比较广泛，当然，中国除外。它们之间在外观和技术标准上有很多不同。而随着技术的发展和交流，差别越来越小，特别是双梁桥式起重机。现在，主要的区别是在单梁桥式起重机和安装式钢丝绳电动葫芦。正如以下图片所示。

![横梁](cross-girder3.jpg){813x291}

横梁 - 欧式单梁桥式起重机销售是H型钢结构，而传统的单梁桥式起重机是焊接的箱型。欧洲型的重量较轻。

终端卡车--终端卡车没有大的区别。

![吊装比较](hoist-compare-1.jpg){813x277}

葫芦--另一个主要区别是葫芦，欧洲型葫芦更先进，有更高的提升高度。

## 简要技术参数比较 <!--block:spec-compare-->

| 技术数据     | 传统型   | 欧洲型     |
| ------------ | -------- | ---------- |
| 负载         | 至16公吨 | 至12.5公吨 |
| 延伸         | 至90英尺 | 至98′。    |
| 大桥行驶速度 | 至98 fpm | 至160 fpm  |
| 小车行驶速度 | 至65 fpm | 至100 fpm  |
| 起重机速     | 至26 fpm | 至41 fpm   |

## 细节规格按要求提供 <!--block:spec-detail-->

| 物品       | 传统风格的桥式起重机                   | 欧洲型桥式起重机                                 |
| ---------- | -------------------------------------- | ------------------------------------------------ |
| 结构和功能 | 简单                                   | 复杂的和多功能的                                 |
| 价格       | 成本效益高得多                         | 昂贵的                                           |
| 起重机净重 | 更重的能源成本和更高的建筑成本。       | 更轻的钢结构和更有效的能源成本更有效的建筑成本   |
| 适应能力   | 在服务工作条件和不适当的操作中更加强大 | 稳定和舒适，但需要有适当的工作条件和适当的操作。 |

## 哪个更好 <!--block:which-better-->

一般来说，欧洲型桥式起重机更先进、更好。而在工作条件、操作条件和价格方面，我知道合适的才是最好的。在DGCRANE，我们很荣幸为您提供合适的起重机，我们有不同类型的桥式起重机，并有灵活的销售计划。

## 组成部分 <!--block:components-->

### 主梁

主梁为焊接的箱形结构，下翼缘板为提升机运行轨道。主梁严格按照工艺流程进行生产。焊接采用全自动CO2保护焊生产线，焊接变形小，焊缝强度高，残余应力低。焊缝按国家标准GB3323进行检验。它具有较好的强度、刚度和稳定性

### 末端车架

起重机端头车采用矩形管整体端头梁结构，避免焊接造成的变形。采用大型落地镗床一次加工成型，保证车轮的两个挠度值在公差范围内。起重机端梁的改进设计，降低了垂直刚度，增加了水平刚度，可以克服起重机车轮三个轮子接触地面的现象，大大提高了车轮的寿命。安装车轮的端梁结构融合了国际先进技术，采用整体镗孔结构，安装精度更高。

### 升降机构

提升机构采用欧式葫芦或欧式小车。葫芦提升机构采用行星齿轮，结构紧凑，重量轻，安装在卷筒内，有效地缩小了电动葫芦的体积。其设计最大程度地采用了模块化设计，零部件通用性强。设计标准采用欧洲FEM标准，提升速度、运行速度等参数的选择更加人性化。设计速度慢，定位准确，适合安装和维修；设计速度快，使提升机构的效率更高，更方便。

### 起重机行走齿轮马达

大车运行机构采用“三合一”驱动齿轮箱，分别驱动两侧端梁；电动机采用大车专用制动电动机，采用螺栓连接。此驱动型式具有传动精度高、重量轻、密封性好、噪音低、寿命长、免维护等优点。

### 电控系统

欧式起重机电压按客户当地工业电压确定，电气系统按电压制造。装有横叉旋转限位开关，在起重机缓冲器与轨道端块相撞前，切断横移电机及长行走电机电源。装有超载限制器。当钢丝绳张力大于额定值90%时，超载保护装置报警。当钢丝绳张力大于额定值110%时，超载保护装置自动切断起升电路。小车电源采用异型钢悬挂配扁平电缆。

### 控制模式

操作面板、遥控、驾驶室操控。起重机也可配备两套操作装置，即：地面+遥控或驾驶室+遥控。但出于安全问题，两种操作方式只能切换，不能同时使用。

### 欧洲型桥式起重机的保护装置

- 变频器：变频器的保护功能可以对各驱动机构进行短路、过流、电机过热、欠压、过压、接地、短路、防失速、散热器过热、制动单元过热保护。
- 配电保护。起重机配电的主回路装有保护部件，如主电源的自动空气开关和主接触器。
- 短路保护。主电源电路装有自动开关作为起重机的短路保护；控制电路装有小容量自动空气开关作为短路保护。
- 过载保护。起重机各机构的电机均装有单独的过流保护装置作为过载保护；主电源的自动空气开关作为起重机的过载保护。
- 相序保护。设备采用相序保护器，实时监控电源质量。当电源因外界原因产生过压、欠压、缺相或相序变化时，控制系统将切断主回路，有效保护设备和人员的安全。
- 升降机限位保护。升降机构配备了就位限位开关和限位开关。就位限位开关可确保升降机构在就位时自动停止。限位开关可以确保升降机构在吊钩上升到极限位置时自动切断。
- 行走限位保护。起重机行走和小车横移机构一般在两端装有在位限位开关和限位开关
- 紧急断电保护。起重机的控制电路上装有紧急开关。当事故发生时，可随时切断控制电路的电源，然后切断主电路，保证起重机的安全运行。
- 防腐、防尘和密封措施

## 一种欧洲类型的桥式起重机将在45天内生产出来 <!--block:production-flow-->

来料检验 → 钢板开卷和开裂 → 钢板切割 → 滚动槽 → 焊接主大梁 → 起重机预装 → 欧洲型钢丝绳吊杆的组装 → 起重机包装和交付

> 提示。不同电压的起重机的交货时间可能会延长10-15天，因为电气元件需要由我们的供应商定制。

## 适用于不同工作条件的起重机类型 <!--block:crane-types-->

### 高清欧式单梁桥式起重机

- 可靠性、高效、操作简便、安全
- 采购和维护成本低
- 通常，HD欧式单梁桥式起重机的最大起重能力为12.5吨。

### NLH欧洲型双梁桥式起重机

- 可靠性、高效、操作简便、安全
- 采购和维护成本低
- 当容量大于12.5吨时，建议客户选择NLH欧式双梁桥式起重机。

### QD型欧式双梁桥式起重机

- 外观漂亮，结构轻巧
- 环境友好，无声无息
- 技术优势：双速智能变频
- 稳定的提升

## 可进行现场安装或远程指导 <!--block:installation-->

建立信任确实很难，但凭借我们10多年的销售经验和所做的3000多个项目，终端用户和代理商都从我们的合作中获得并受益。顺便说一下，独立销售代表的招聘。丰厚的佣金/无风险。
