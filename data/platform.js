(function (root) {
  const halls = [
    { id: 'kitchen', name: '厨房事故馆', icon: '◒', desc: '蛋糕塌陷、奶油异常、煎糊与食品安全', color: '#c96d42' },
    { id: 'beauty', name: '变美事故馆', icon: '〽', desc: '眼线、底妆、发型、美甲与染发色差', color: '#b55257' },
    { id: 'craft', name: '手作事故馆', icon: '⌂', desc: '黏土、模型、绘画、编织与结构倒塌', color: '#846b4f' },
    { id: 'home', name: '家居改造馆', icon: '◇', desc: '墙面色差、组装错误、贴膜气泡与清洁痕迹', color: '#61736d' },
    { id: 'plant', name: '植物急救馆', icon: '♧', desc: '黄叶、徒长、倒伏、浇水异常与换盆萎蔫', color: '#657c4c' },
    { id: 'camera', name: '拍摄翻车馆', icon: '◉', desc: '构图、光线、显矮、运镜与氛围失效', color: '#586779' }
  ]

  const hallByCase = { cake: 'kitchen', eyeliner: 'beauty', house: 'craft' }

  const serviceCatalog = {
    beauty: {
      tools: [
        { name: '尖头棉签', reason: '适合局部清理眼尾边缘', type: '消耗品' },
        { name: '温和眼唇卸妆液', reason: '只在确认不过敏时少量使用', type: '材料' }
      ],
      course: '左右眼定位与短线分段练习', localService: '需要真人处理时，可发布“妆容急救”服务需求。'
    },
    craft: {
      tools: [
        { name: '直角定位夹', reason: '在胶体固化前固定墙体角度', type: '工具' },
        { name: '硬纸板内撑', reason: '可用现有材料制作临时支撑', type: '可复用材料' }
      ],
      course: '模型结构的平面预制与直角合拢', localService: '涉及刀具或复杂拆胶时，可发布手作协助需求。'
    },
    kitchen: {
      tools: [
        { name: '食品温度计', reason: '帮助确认原料与环境温度', type: '工具' },
        { name: '冷藏打蛋盆', reason: '降低再次打发时的温度波动', type: '现有器具' }
      ],
      course: '奶油状态节点与停止打发判断', localService: '食品安全无法确认时，不推荐任何继续加工服务。'
    }
  }

  const communitySections = [
    { id: 'new', name: '今日新展', desc: '刚刚入馆的翻车现场' },
    { id: 'treasure', name: '镇馆之宝', desc: '由真实互动逐步产生，不预设虚假排行' },
    { id: 'rescued', name: '抢救成功区', desc: '包含处理前后与完整步骤' },
    { id: 'mystery', name: '无法解释区', desc: '等待馆长和用户共同会诊' },
    { id: 'alliance', name: '同款受害者联盟', desc: '按失败指纹聚合，而不是普通话题流' }
  ]

  const contentTemplates = [
    { id: 'documentary', name: '翻车纪录片', desc: '目标效果 → 翻车瞬间 → AI 鉴定 → 处理结果' },
    { id: 'museum', name: '展品解说', desc: '用博物馆纪录片口吻介绍事故' },
    { id: 'court', name: '翻车法庭', desc: '让目标、实际结果与 AI 鉴定官分别发言' }
  ]

  const api = { halls: halls, hallByCase: hallByCase, serviceCatalog: serviceCatalog, communitySections: communitySections, contentTemplates: contentTemplates }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (root) root.MuseumPlatform = api
})(typeof window !== 'undefined' ? window : null)
