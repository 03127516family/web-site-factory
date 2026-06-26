---
# ===== 结构化字段（frontmatter）→ 映射到 product.html 的 data-field =====
# 见 src/templates/FIELD-MAP.md 的对应表。
slug: single-girder-eot-cranes
template: product@1
title: 单梁桥式起重机
breadcrumb:
  current: 单梁桥式起重机
  trail:
    - { label: 首页, url: "https://www.dgcrane.com/zh/" }
    - { label: "Eot Cranes", url: "https://www.dgcrane.com/zh/eot-cranes/" }

# hero（页头横幅）
hero:
  image: Single-Girder-Overhead-Crane-scaled.jpg
  image_srcset:
    - Single-Girder-Overhead-Crane-scaled.jpg
    - Single-Girder-Overhead-Crane-1536x320.jpg
    - Single-Girder-Overhead-Crane-2048x427.jpg
  headline: 起重机制造商和出口商
  highlights:
    - 10年以上的起重机出口经验
    - 起重机已销往120多个国家
    - 一个由50多人组成的技术团队
    - 3000多个不同行业的案例

# product-summary（标题 + 快速参数 + 报价 CTA）
summary:
  intro: >-
    单梁桥式起重机是根据GB3811-2008和JB/T1306-2008标准设计的，并配有电动葫芦。它广泛应用于机械加工、装配、修理、仓库等工作场所。它是现代工业企业实现生产过程机械化、自动化，减少繁重的手工劳动，提高劳动生产率的重要工具和设备。
  cta: 报价要求

# 快速参数（specs：data-repeat 数组，可在编辑器里增删行；价格行含 <span> 富文本强调）
specs:
  - { text: "容量：1-20吨" }
  - { text: "跨度长度：4-31.5米" }
  - { text: "工作职责。A3, A4" }
  - { text: "工作电压：220V~690V，50-60Hz，3ph AC" }
  - { text: "工作环境温度：-25℃～+40℃，相对湿度≤85%" }
  - { text: "起重机控制模式。地面控制/远程控制/机舱室" }
  - { text: "参考价格范围。<span>$750-4500/套</span><div></div>" }

# gallery（产品图库，data-repeat="gallery"）
gallery:
  - { image: 5Ton-LDC-type-single-girder-overhead-crane-in-India-1.jpg, alt: 印度5吨LDC型单梁桥式起重机 1 }
  - { image: 5Ton-LDC-type-single-girder-overhead-crane-in-India-2.jpg, alt: 印度5吨LDC型单梁桥式起重机 2 }
  - { image: 5Ton-single-girder-overhead-crane-in-Bangladesh.jpg, alt: 孟加拉国5吨单梁桥式起重机 }
  - { image: 5Ton-LDC-type-single-girder-overhead-crane-in-Oman.jpg, alt: 阿曼5吨LDC型单梁桥式起重机 }
  - { image: 10-ton-LDC-type-single-girder-overhead-crane-in-Turkmenistan.jpg, alt: 土库曼斯坦10吨LDC型单梁桥式起重机 }
  - { image: 10ton-LDC-type-single-girder-overhead-crane-in-Qatar-3.jpg, alt: 卡塔尔10吨LDC型单梁桥式起重机 3 }
  - { image: 10ton-LD-type-single-girder-overhead-crane-in-Benin-2.jpg, alt: 10吨LD型单梁桥式起重机在贝宁 2 }
  - { image: 10ton-LDC-type-single-girder-overhead-crane-in-Qatar-1.jpg, alt: 卡塔尔10吨LDC型单梁桥式起重机 1 }
  - { image: 10ton-LDC-type-single-girder-overhead-crane-in-Qatar-2.jpg, alt: 卡塔尔10吨LDC型单梁桥式起重机 2 }
  - { image: 10ton-LD-type-single-girder-overhead-crane-in-Benin-1.jpg, alt: 10吨LD型单梁桥式起重机在贝宁 1 }
  - { image: 20ton-single-girder-overhead-crane-2.jpg, alt: 20吨单梁桥式起重机 2 }
  - { image: 20ton-single-girder-overhead-crane-1.jpg, alt: 20吨单梁桥式起重机1台 }

# introduction 区块内嵌图（正文内嵌图改用 markdown 行内图语法，见下方正文）
introduction:
  image: singlegirdereot-crane-9.jpg
  image_w: 830
  image_h: 300

# components（部件分解，data-repeat="components"）：图片文件名清单
components_images:
  - { name: 主梁, image: Main-Girder-1-scaled.jpg }
  - { name: 端梁, image: End-Girder.jpg }
  - { name: 电动升降机, image: Electric-Hoist-1-scaled.jpg }
  - { name: 起重机驱动装置, image: null }
  - { name: 起重机马达, image: Crane-Motor.jpg }
  - { name: 起重机轮, image: Crane-Wheel.png }
  - { name: 钩状物, image: Hook-blocks.jpg }
  - { name: 末端停止保险杠, image: null }
  - { name: 电气柜, image: null }
  - { name: 控制模式, image: null }

# production-flow（生产流程，data-repeat="production-flow"）
production_flow:
  title: 一台标准的单梁桥式起重机将在20天内生产出来。
  tips: 不同电压的起重机的交货时间可能会延长10-15天，因为电气元件需要由我们的供应商定制。
  steps:
    - { label: 来料检验, image: 1-Incoming-material-sample-test-1.jpg }
    - { label: 钢板开卷和开裂, image: 2-Steel-plate-uncoiling-and-falttening.jpg }
    - { label: 钢板切割, image: 3-Steel-sheeting-cuttig.jpg }
    - { label: 滚动槽, image: 4-Rolling-groove.jpg }
    - { label: 焊接加劲器, image: 5-Welding-stiffener.jpg }
    - { label: 焊接工字钢和盖板, image: 6-Welding-I-beam-and-cover-plate.jpg }
    - { label: 起重机预装, image: 7-Crane-pre-assembling.jpg }
    - { label: 仙鹤画, image: 8-Crane-painting.jpg }
    - { label: 起重机包装和交付, image: 9-Crane-packing-and-delivery.jpg }

# crane-types（按应用分型号，data-repeat="crane-types"）：图片文件名清单
crane_types_images:
  - { name: "LDA（普通单梁桥式起重机）。", image: LDA-scaled.jpg }
  - { name: "LDC（低净空单梁桥式起重机）。", image: LDC.jpg }
  - { name: "LDP（部分悬挂式单梁桥式起重机）。", image: LDP-scaled.jpg }
  - { name: "LB (防爆单梁桥式起重机)", image: LB.png }
  - { name: "LDY(冶金电动单梁桥式起重机)", image: LDY.jpg }
  - { name: "LDZ电动抓斗式单梁桥式起重机", image: LDZ.jpg }

# installation（现场安装/远程指导，标题 + 正文 + 案例链接卡 data-repeat="cases"）
installation:
  title: 可进行现场安装或远程指导
  cases:
    - { title: 5吨和10吨的单梁桥式起重机出售到塔吉克斯坦, image: 5t-S9.1m-single-girder-overhead-crane-main-girder-scaled-1.jpg, url: "https://www.dgcrane.com/zh/posts/5-ton-and-10ton-single-girder-overhead-crane-for-sale-to-tajikistan/" }
    - { title: 5吨欧式单梁Overhead Cranes销往津巴布韦, image: 2.After-painting-the-main-beam.jpg, url: "https://www.dgcrane.com/zh/posts/5ton-european-single-girder-overhead-cranes-for-sale-to-zimbabwe/" }
    - { title: 2套单梁桥式起重机出售到巴拿马, image: Main-Girder-2.jpg, url: "https://www.dgcrane.com/zh/posts/2-sets-of-single-girder-overhead-crane-exported-to-panama/" }
    - { title: 5吨和10吨单梁桥式起重机销售到印度, image: beam.jpg, url: "https://www.dgcrane.com/zh/posts/two-sets-5ton-one-set-10ton-single-girder-overhead-crane-delivery-to-india/" }
    - { title: 2台10吨单梁桥式起重机带6套电动环链葫芦销售到斯里兰卡, image: installation-photos-2.jpg, url: "https://www.dgcrane.com/zh/posts/2-sets-of-10t-single-girder-overhead-crane-with-6-sets-electric-chain-hoist-exported-to-sri-lanka/" }
    - { title: 3吨和8吨LDC型单梁桥式起重机出售给乌拉圭, image: single-girder-overhead-crane-exported-to-Uruguay-3-scaled-1.jpg, url: "https://www.dgcrane.com/zh/posts/8-ton-ldc-type-single-girder-overhead-crane-and-3ton-ldc-type-single-girder-overhead-crane-exported-to-uruguay/" }

# ===== 动态模块（data-dynamic）=====
# 下面两块运行时由 API 接管；此处仅作演示种子数据。
inquiry_form:
  type: inquiry-form
  form_id: 713
  title: 填写您的详细资料，我们将在24小时内给您答复!

related_products:
  type: related-products
  title: 相关产品
  category: eot-cranes
  limit: 4
  seed:
    - { title: 工作站桥式起重机, image: Workstation-Overhead-Crane-1.jpg, url: "https://www.dgcrane.com/zh/workstation-overhead-cranes/", summary: "工作站桥式起重机的起重量为0.125t-2t，应用范围很广。我们公司的工作站桥式起重机最大的优点是可以很容易地进行扩展，随时适应新的要求，可以与您的企业共同发展。" }
    - { title: 悬挂式起重机, image: Underslung-Overhead-Crane-12.jpg, url: "https://www.dgcrane.com/zh/products/underslung-cranes/", summary: "悬挂式桥式起重机与CD1、MD1电动葫芦配合使用，成为在轨道上运行的轻小型起重机。应用于机械、装配现场、仓库等场所" }
    - { title: 双梁桥式起重机, image: Double-Girder-Overhead-Crane-1.jpg, url: "https://www.dgcrane.com/zh/products/double-girder-eot-cranes/", summary: "双梁、双轨、单吊小车。适用于各种工况。技术成熟，安全可靠，操作简便，运行稳定。" }
    - { title: FEM标准桥式起重机, image: European_Overhead_Crane.jpg, url: "https://www.dgcrane.com/zh/products/overhead-cranes-for-sale/", summary: "欧式桥式起重机广泛用于机械制造、石油、石化、港口、铁路、民航、电力、食品、造纸、建材、电子等行业的车间和仓库等物料搬运场合。它们特别适用于需要精确定位的材料处理。, 大型部件的精密装配等场合。" }
---

## 概述 <!--block:overview-->

电动单梁桥式起重机是根据GB3811-2008和JB/T1306-2008标准设计的。它是以CD1、MD1、WH164电动葫芦、环链电动葫芦为起重机构的车间起重设备。它广泛用于机械加工、装配、修理、仓库等工作场所。它是现代工业企业实现生产过程机械化、自动化，减少繁重的手工劳动，提高劳动生产率的重要工具和设备。主要部件有桥架、电动葫芦、电控系统。

起重机电源为三相交流电，额定频率为50Hz或60Hz。额定电压为220V～660V。

起重机的运行机构采用分离驱动方式，驱动和制动由锥形转子/软启动电机完成，传动采用“一开二闭”齿轮传动。

起重机的操作模式可根据具体情况选择地面操作、遥控操作和驾驶室操作。

### 优势

- 结构紧凑，刚性好
- 易于操作
- 低噪音
- 安全和可靠
- 美丽的外观
- 罗斯梁：焊接箱梁结构，强度高
- 末端卡车：焊接箱梁结构，抗扭性强
- 旅行轮。表面硬化的钢轮，高度耐磨
- 横梁和端部卡车之间的连接--按照精确的机加工公差制造，以减少磨损
- 可选的葫芦。钢丝绳电动葫芦或低净空葫芦，用于更高的起吊高度
- 通过安全滑动接触线提供电源
- 控制吊杆悬挂在起重机大梁上单独行走
- 可选：无线电遥控
- 涂层：定制。通常漆面为金黄色。旅行驱动器为天蓝色。

## 简介 <!--block:introduction-->

单梁 eot 起重机由单根桥梁、两条轨道、端部卡车、两条跑道梁和一台用于提升在桥梁上运行的负载的起重机组成。端车在固定在跑道横梁上的轨道上运行。它是中重载最具成本效益的设备之一。单梁 eot 起重机为覆盖区域和运动控制提供最大的灵活性。与安装在工厂上部一样，单梁起重机占用的地面空间最少，在移动范围内遇到的障碍物最少。经过多年的努力，我公司已成功跻身国内一流的单梁起重机制造商行列。可以对单梁 eot 起重机进行修改以适应不断变化的需求。这种设备的操作相当灵活。它也很容易根据您工厂的独特条件以及生产和负载的多样性进行定制。

![单梁EOT起重机](singlegirdereot-crane-9.jpg){830x300}

### DGCRANE的桥式起重机的优势

我公司的单梁eot起重机旨在满足各种不同的需求。它们可以以最具成本效益的方式提供出色的性能，而不会做出任何妥协。凭借我们先进的技术，我们的产品可以通过轻柔的运动将原材料输送到精确的位置。为了减轻单梁起重机本身的重量，我们采用紧凑型设计，以尽量减少不必要的重量。这意味着起重机的效率更高，您的成本更低。我们的单梁 eot 起重机将以极少的服务运行得更好，运行时间更长！

### 应该注意什么？

- 为确保设备和操作人员的安全，在使用期间，应遵守产品的说明。
- 确保将要提升的负载在起重机的安全负载范围内。切勿超过规定的最大负载能力。
- 轻轻地、平稳地移动负载。应避免尖锐、生硬的运动。当紧急情况出现时，操作员可以有时间来处理。
- 在运动开始前，运动范围内的空间应该是清晰的。不允许有任何人和障碍物。
- 水平运动也必须缓慢开始，以防止负载摆动或与其他障碍物接触。
- 单梁起重机在工作期间应始终受到密切监督。不要在没有人看管的情况下单独离开起重机。
- 在工作一段时间后，应该对起重机及其部件进行检查。检查的时间间隔取决于实际使用情况。

## 选项和组件 <!--block:components-->

### 主梁

主梁是起重机的主要承载部分，其结构采用U型槽、斜盖板、肋板及工字钢钢板制成，其上圆弧为（（1/1000～1.4/1000）S，当额定起重量及葫芦自重位于跨度中间时，引起的上拱度不低于水平线，正常运行时不产生永久变形。

### 端梁

端梁位于主梁的两端，通过法兰盘与主梁栓接。它是箱型结构，由U型槽、下盖板、加强板以及由钢板轧制或钢板焊接而成的肋板组成。端梁具有结构轻、刚度好、外形美观、焊接性能好等特点。

### 电动升降机

电动葫芦用于单梁桥式起重机上，每台电动葫芦都要进行动、静载荷试验，上升和下降压力试验。采用烤漆工艺，增强漆膜的附着力，提高外观质量。装配线确保产品质量。

### 起重机驱动装置

驱动装置的箱体和箱盖由HT200灰铁铸造，具有良好的抗震性。经过时效处理后，在车床上用专用夹具加工制造。齿轮和齿轮轴由40Cr模锻而成，经车削、滚齿、回火、磨削而成。热处理的硬度为HB235-269。

### 起重机马达

起重机电机采用ZDY(D)系列锥型转子制动电机或软启动电机。电机标准绝缘等级为B级，防护等级为IP44。电机具有散热性好、使用寿命长、安全可靠的特点。特殊工况下可以定制。

### 起重机轮

该轮组由45#钢模锻成型，经粗加工、淬火、回火、精加工而成。热处理硬度为HB300～380，硬化层深度为15mm时硬度不低于HB260。轮轴采用45#钢，经粗加工、淬火回火、精加工等工序加工而成。热处理硬度为235～269HB。

### 钩状物

吊钩块符合GB/T1005.1～5-98标准，其材质为DG20，安全系数大于5；吊钩表面光滑，无裂纹、折叠、过烧等缺陷；内部无裂纹、白点等影响安全的现象。吊钩设有防脱钩装置，防止钢丝绳脱钩，确保吊钩在使用过程中安全可靠。

### 末端停止保险杠

JHQ-C系列聚氨酯缓冲器具有超强的防撞能力和良好的缓冲效果。结构简单，使用寿命长，安装和维护方便。

### 电气柜

我们的标准电源是三相，380V（±10%，峰值电流下限为-15%），50Hz。根据客户要求，电源可以设计成690V以下，频率50-60HZ的三相电控系统。

### 控制模式

操作面板、遥控、驾驶室控制。起重机也可配备两套操作装置，即：地面+遥控或司机室+遥控。但出于安全问题，两种操作方式只能切换，不能同时使用。控制电路电压一般为交流36V安全电压。

## 一台标准的单梁桥式起重机将在20天内生产出来。 <!--block:production-flow-->

来料检验 → 钢板开卷和开裂 → 钢板切割 → 滚动槽 → 焊接加劲器 → 焊接工字钢和盖板 → 起重机预装 → 仙鹤画 → 起重机包装和交付

> 提示。不同电压的起重机的交货时间可能会延长10-15天，因为电气元件需要由我们的供应商定制。

## 适用于不同工作条件的起重机类型 <!--block:crane-types-->

### LDA（普通单梁桥式起重机）。

- 主梁和端部车架通过螺栓连接，便于拆卸、运输和储存。
- 自动焊接和流水线加工，安装快捷，维护方便。
- 结构合理，刚性强，耐用。

### LDC（低净空单梁桥式起重机）。

- 主梁和端头车用螺栓连接，便于拆装、运输和储存。
- 自动焊接和流水线加工，安装快捷，维护方便。
- 低净空设计，与普通型单梁桥式起重机相比，LDC型单梁桥式起重机可以有更高的起重高度，而且更节省空间。

### LDP（部分悬挂式单梁桥式起重机）。

- 主梁和端部车架用螺栓连接，便于拆装、运输和储存。
- 自动焊接和流水线加工，安装快捷，维护方便。
- 葫芦位于梁的一侧，与普通型单梁起重机和低净空单梁桥式起重机相比，它可以实现更高的起重高度。

### LB (防爆单梁桥式起重机)

- 结构紧凑，刚性好，操作灵敏。
- 安全可靠、外形美观、防爆性强等特点。
- 我们的防爆单梁桥式起重机的主要组成部分是：桥架、防爆电动葫芦、电控系统。

### LDY(冶金电动单梁桥式起重机)

- LDY（冶金电动单梁桥式起重机）起重机为A6级工况，适用于工作环境温度≤60℃，相对湿度≤85﹪，海拔2000米以下，无腐蚀性介质的环境条件。
- 起重机的结构主要由三部分组成：桥架、冶金电动葫芦和电气系统。
- 在电机和电控系统等电气设备外采用隔热保护措施。

### LDZ电动抓斗式单梁桥式起重机

- 电动抓斗单梁桥式起重机是一种与抓斗小车配套使用的车间起重设备。它广泛用于各种工作场所，如加工、装配、修理和仓库。
- 该起重机运行机构采用单独驱动方式，驱动与制动均由锥形转子电动机完成，传动采用“一开二闭”齿轮传动。
- 该产品具有结构紧凑、刚性好、操作简便、噪音低、安全可靠、外形美观等优点。

## 可进行现场安装或远程指导 <!--block:installation-->

建立信任确实很难，但凭借我们10多年的销售经验和所做的3000多个项目，终端用户和代理商都从我们的合作中获得并受益。顺便说一下，独立销售代表的招聘。丰厚的佣金/无风险。
