---
# ===== 结构化字段（frontmatter）→ 映射到 product-superset.html 的 data-field =====
# 产品：独立式旋臂起重机（free-standing JIB crane）。内容取自 src/content/raw/free-standing-jib-cranes.txt。
# 注：本产品原料文章较散，仅含 导语/概述/简介/优势/基本参数/主要特点 六段正文；
#     无图库/组件/型号/生产流程/案例素材，对应段落由超集 data-optional 自动裁掉（faithful，不臆造）。
slug: free-standing-jib-cranes
template: product-superset@1
title: 独立式旋臂起重机
breadcrumb:
  current: 独立式旋臂起重机
  # ⚠ 超集 breadcrumb 中段链接暂为硬编码（仅 current 由 MD 驱动，见 CLAUDE.md §8）；trail 先登记备用。
  trail:
    - { label: 首页, url: "https://www.dgcrane.com/zh/" }
    - { label: 旋臂起重机, url: "https://www.dgcrane.com/zh/jib-cranes/" }

# hero（页头横幅）：企业品牌 shared 内容。
# ⚠ 缺独立式旋臂吊专用 banner 素材（仅有 European_Jib_Crane.jpg 小图），hero.image 暂不覆盖 → 沿用模版默认 banner；
#   待补一张宽幅旋臂吊 banner 后在此加 image 字段即可（见 CLAUDE.md §8 已知遗留）。
hero:
  headline: 起重机制造商和出口商
  highlights:
    - 10年以上的起重机出口经验
    - 起重机已销往120多个国家
    - 一个由50多人组成的技术团队
    - 3000多个不同行业的案例

# product-summary（标题 + 快速参数 + 报价 CTA）。简介导语见正文 <!--block:summary-intro-->
summary:
  cta: 报价要求

# 快速参数（specs：data-repeat="specs" 可重复组，可在编辑器里逐行增删/改）
specs:
  - { text: "容量：高达16吨" }
  - { text: "臂长：高达16米" }
  - { text: "升降高度：高达12（地面到吊杆底部）" }
  - { text: "工作职责。M3-M5" }
  - { text: "旋转角度：120-360°" }
  - { text: "工作电压：220V~690V，50-60Hz，3ph AC" }
  - { text: 新参数请求 }
  - { text: 新参数完全 }

# ===== 动态模块（data-dynamic）=====
inquiry_form:
  type: inquiry-form
  form_id: 713
  title: 填写您的详细资料，我们将在24小时内给您答复!

related_products:
  type: related-products
  title: 相关产品
  category: jib-cranes
  limit: 4
  seed:
    - { title: FEM标准旋臂式起重机, image: European_Jib_Crane.jpg, url: "https://www.dgcrane.com/zh/fem-standard-jib-cranes/", summary: "欧式旋臂吊结构独特，安全可靠，具有高效、节能、省时、灵活等特点。它特别适用于短距离、高强度的吊装场所。欧式旋臂吊广泛用于车间、仓库、码头等固定场所。工作等级一般为A4或A5。" }
    - { title: FEM标准钢丝绳电动葫芦, image: European_Wire_Rope_Electric_Hoist.jpg, url: "https://www.dgcrane.com/zh/products/wire-rope-hoist-suppliers/", summary: "欧式钢丝绳电动葫芦的起升机构采用行星齿轮，结构紧凑，重量轻，安装在卷筒内，有效地缩小了葫芦的整体尺寸。欧式钢丝绳电动葫芦的设计最大程度地采用了模块化设计，各部件的通用程度高。" }
    - { title: FEM标准电动环链升降机, image: European_Electric_Chain_Hoist.jpg, url: "https://www.dgcrane.com/zh/fem-standard-electric-chain-hoists/", summary: "欧式环链电动葫芦结构紧凑，性能可靠。模块化设计使我们的产品可以灵活地组成不同的起重吨位、起重速度和工作等级系统。" }
    - { title: FEM标准门式起重机, image: European_Gantry_Crane.jpg, url: "https://www.dgcrane.com/zh/fem-standard-gantry-cranes/", summary: "欧式龙门吊采用欧洲设计标准和制造技术，达到了国际同类产品的先进水平，如高度低、重量轻、轮压小、直接驱动灵活、无级变速、免维护等。" }
---

## 导语 <!--block:summary-intro-->

自由站立式JIB起重机通常用于较小的工作单元区域，用于重复性和独特的起重任务。旋臂式起重机的用途非常广泛，也可以与桥式起重机搭配使用，以最大限度地提高生产效率。

工作范围是一个圆形区域，非常适用于短距离和密集排放的工作场所。

具有较大的起重能力，可用于各种行业。它结构轻巧，占用空间小，易于安装。

## 概述 <!--block:overview-->

独立悬臂式起重机是由一个立柱、一个摆臂装置和一个电动葫芦组成。它在空间有限的车间里发挥了巨大作用。它占用的面积很小，可以覆盖整个工作区域。根据需要，它可以安装在地面或墙壁上，升降机构可以是电动或手动。广泛应用于各种场所，如装卸码头、港口、船厂等，可与其他臂架式起重机配合使用，也可作为工厂流水线上的配套设备。固定立柱式JIB起重机的安装和拆卸都非常简单，无需拆卸。

## 简介 <!--block:introduction-->

独立悬臂式起重机的设计是为了不靠任何其他支撑而靠自己站在陆地上。它由一个可旋转的垂直立柱和一个水平负载支撑臂组成。我们依靠的不是低悬臂式起重机的价格，而是独立悬臂式起重机的高质量来赢得实现我们公司的成长。

### 独立式旋臂起重机

与壁挂式和壁行式旋臂吊相比，独立式旋臂吊可以达到更高的能力，更长的跨度和更大的旋转范围。由于结构上的优势，这种悬臂吊可以进行定制化的改造，以满足您的特殊应用要求。唯一的安装限制是，独立悬臂吊所立足的土壤压力必须达到每平方英尺2500磅。

## 优势 <!--block:advantages-->

- 充分利用空间
- 易于安装
- 轻量级结构
- 坚固耐用
- 安全性和可靠性
- 低噪音

## 基本参数 <!--block:basic-params-->

它是最近开发的一种中、小型起重设备，非常适用于短距离移动和工作场所的人群升降和运输。

- 起重机旋转。360度
- 臂长：高达16米
- 旋转速度: 0.5 r/min
- 安全工作负荷：高达16吨
- 提升高度：最高可达12（地面到吊杆底部）
- 工作温度：-20~+40℃
- 行走速度：20或30米/分钟
- 控制模式：吊式手柄、遥控器和座舱
- 应用：广泛应用于各种行业
- 电源。AC 380V, 50HZ, 3P

注：用户也可以选择双速、单速环链和钢丝绳葫芦。

## 主要特点 <!--block:main-features-->

### 最大的通用性

它是最通用的起重机之一。独立悬臂式起重机几乎可以安装在任何地方，无论是室内还是室外，如装卸码头、港口、船厂等。它还可以与其他旋臂起重机一起工作，或作为工厂装配线的补充。独立式悬臂吊的安装和搬迁非常简单，无需拆卸。

### 操作简便

我厂生产的起重机可以让操作者精确、有效、迅速地控制运动。凭借先进的技术，我们可以使旋臂吊的运动非常简单和准确。因此，无意的运动将被减少到最小。反过来，对您的工厂、设备甚至人员的损害也会大大减少。起重机的工作寿命可以得到更多的保证，并将被延长。

### 安全

我们始终把安全放在心上！！！我们采用了紧急停止系统来加强安全。我们采用紧急制动系统来加强安全。当操作人员遇到一些紧急情况时，紧急制动系统将启动，以保护相关宝物。我们工厂的每一件产品在传送到你的工作场所之前都经过了良好的测试。如果你不能独立完成安装，我们有经验的工人将不会离开你的工作场所，直到起重机被检查为100%的保证。
