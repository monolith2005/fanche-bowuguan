const cases = [
  {
    id: 'eyeliner', hall: '变美事故馆', icon: '〽', image: '/assets/images/case-eyeliner.jpg',
    name: '《左眼去上班，右眼去蹦迪》', shortName: '眼线不对称', target: '自然、平行且粗细接近的眼线',
    stage: '眼线完成后', anomaly: '两侧眼尾角度和长度明显不同', area: '双侧外眼角', severity: '轻度', repairability: '高', reversible: '高',
    evidence: ['右侧眼尾上扬角度更大', '右侧线条更长、更厚', '差异集中在可局部卸除区域'],
    hypotheses: [
      { name: '两侧落笔位置不一致', probability: 62, evidence: '差异从眼尾起点开始扩大' },
      { name: '拉扯眼皮角度不同', probability: 25, evidence: '两侧线条走向不同' },
      { name: '工具出墨量不稳定', probability: 13, evidence: '右侧局部线条更厚' }
    ],
    question: '你愿意局部擦除右侧眼尾吗？如果不愿意，我们会改为补齐左侧。',
    matches: [
      { kind: '长得最像', title: '眼尾角度左右相差明显', source: '变美事故馆', score: 94, verified: true },
      { kind: '经历最像', title: '画第二只眼时落笔偏高', source: '变美事故馆', score: 88, verified: true },
      { kind: '最值得参考', title: '棉签局部修正眼尾边缘', source: '变美事故馆', score: 81, verified: true }
    ],
    routes: {
      rescue: { recommended: true, summary: '局部清理右眼眼尾，再依据左侧方向补线。', steps: ['准备尖头棉签和少量卸妆水，不要直接倒在眼周', '只擦除右眼超出参考线的眼尾部分', '放松眼皮，正视镜头重新拍摄', '沿左眼眼尾方向少量补画，避免一次拉太长'] },
      transform: { summary: '保留右侧上扬风格，把左侧补成对称猫眼。', steps: ['先确认两眼剩余空间', '按右侧角度延长左侧', '少量填充两侧三角区'] },
      restart: { summary: '卸除双侧眼尾后重新定位。', steps: ['卸除眼尾', '标记两侧同高起点', '分两笔短线完成'] },
      stop: { summary: '若眼周刺痛、红肿或产品进入眼睛，立即停止并清洗。', steps: ['停止使用产品', '用流动清水冲洗', '持续不适时及时就医'] }
    }
  },
  {
    id: 'house', hall: '手作事故馆', icon: '⌂', image: '/assets/images/case-house.jpg',
    name: '《建筑还没封顶，承重墙先下班》', shortName: '小屋结构变形', target: '方正稳定的木条模型小屋',
    stage: '主体粘接后', anomaly: '侧墙外扩、框架歪斜且开口失去支撑', area: '前立面与左右侧墙连接处', severity: '中度', repairability: '中', reversible: '中',
    evidence: ['两侧墙体向外张开', '顶部连接面不在同一平面', '胶量较大但缺少临时支撑'],
    hypotheses: [
      { name: '粘接固化前缺少直角支撑', probability: 58, evidence: '墙体整体外扩而非单根断裂' },
      { name: '底板尺寸与墙体不匹配', probability: 27, evidence: '前侧连接点错位' },
      { name: '热熔胶堆积造成偏斜', probability: 15, evidence: '接缝处胶体厚度不均' }
    ],
    question: '请轻推侧墙，连接处现在是否还能活动？',
    matches: [
      { kind: '长得最像', title: '四面墙粘好后整体外扩', source: '手作事故馆', score: 91, verified: true },
      { kind: '经历最像', title: '未用直角夹固定的木条小屋', source: '手作事故馆', score: 89, verified: true },
      { kind: '最值得参考', title: '用内框把歪屋改成废墟场景', source: '手作事故馆', score: 78, verified: true }
    ],
    routes: {
      rescue: { summary: '拆开可活动接缝，用临时内撑重新找正。', steps: ['停止继续封顶', '确认仍可活动的接缝并标记', '用硬纸板制作两个等宽内撑', '校正到直角后重新少量点胶固定'] },
      transform: { recommended: true, summary: '保留歪斜形态，改造成“风暴后的废墟小屋”场景。', steps: ['先加一根横向内梁防止继续坍塌', '修剪危险突出的木条和凝固胶丝', '把散落木条设计为断梁与残骸', '补充底座、苔藓或警戒线形成完整叙事'] },
      restart: { summary: '回收完整木条，按底板—侧墙—屋顶顺序重做。', steps: ['拆除无法校正的连接', '按长度分类回收木条', '先在平面制作两片墙', '用直角模板合拢固定'] },
      stop: { summary: '若需要刀具切割硬化胶体，请暂停并由熟悉工具的人协助。', steps: ['断开热熔胶枪电源', '清理尖锐断木', '佩戴护目镜后再处理'] }
    }
  },
  {
    id: 'cake', hall: '厨房事故馆', icon: '⌁', image: '/assets/images/case-cake.jpg',
    name: '《奶油决定从液体重新开始》', shortName: '奶油油水分离', target: '细腻、能稳定立起纹路的打发奶油',
    stage: '持续打发后', anomaly: '出现颗粒、液体析出，质地不再均匀', area: '整盆奶油', severity: '中度', repairability: '低', reversible: '低',
    evidence: ['明显颗粒与游离液体并存', '盆壁有厚重脂肪附着', '已经越过正常打发的细腻阶段'],
    hypotheses: [
      { name: '打发过度导致油水分离', probability: 76, evidence: '颗粒与液体同时出现是典型视觉信号' },
      { name: '温度过高', probability: 16, evidence: '液体析出可能受环境温度影响' },
      { name: '原料状态异常', probability: 8, evidence: '仅凭图片不能排除储存问题' }
    ],
    question: '奶油是否出现酸败或其他异常气味？',
    safety: '图片不能判断食品是否变质。如有酸败气味、过期或长时间处于高温环境，请勿食用。',
    matches: [
      { kind: '长得最像', title: '奶油颗粒化并析出液体', source: '厨房事故馆', score: 96, verified: true },
      { kind: '经历最像', title: '高速打发后越打越稀', source: '厨房事故馆', score: 90, verified: true },
      { kind: '最值得参考', title: '分离奶油转化为黄油用途', source: '厨房事故馆', score: 82, verified: true }
    ],
    routes: {
      rescue: { summary: '仅在确认未变质且分离很轻时，尝试低温、低速短暂混合；成功无法保证。', steps: ['先检查保质期、气味和离开冷藏的时长', '出现任何变质迹象立即停止', '轻微分离可先冷藏降温', '低速短暂混合并每5秒检查一次'] },
      transform: { recommended: true, summary: '确认食材安全后，继续分离并转化为黄油与酪乳用途。', steps: ['先完成食品安全确认', '低速继续搅打至固液明显分开', '过滤并用冷水清洗固体脂肪', '黄油冷藏保存；液体按安全条件及时使用'] },
      restart: { summary: '丢弃不安全或无法确认状态的原料，使用充分冷藏的新奶油重做。', steps: ['清洗并擦干器具', '奶油与打蛋盆充分冷藏', '中速打发并持续观察纹路', '接近目标后改低速'] },
      stop: { recommended: false, summary: '有异味、过期或温控不明时，不要继续抢救或食用。', steps: ['停止试吃', '隔离并丢弃可疑食材', '清洗所有接触器具'] }
    }
  }
]

function getCase(id) { return cases.filter(function(item) { return item.id === id })[0] || null }
const museumCases = { cases: cases, getCase: getCase }
if (typeof module !== 'undefined' && module.exports) module.exports = museumCases
if (typeof window !== 'undefined') window.MuseumCases = museumCases
