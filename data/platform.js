(function (root) {
  const halls = [
    {
      id: 'kitchen', name: '厨房事故馆', icon: '◒', desc: '蛋糕塌陷、奶油异常、煎糊与食品安全', color: '#c96d42', status: 'open',
      world: { door: { x: 493, y: 272 }, interior: '/assets/images/pixel-world/interiors/kitchen.webp', curator: '苏糖馆长', curatorIndex: 0, welcome: '先别急着继续加工。把现场交给我，我们先确认状态和食品安全。' },
      theme: {
        palette: {
          paper: '#eee3cb', card: '#fff9ea', ink: '#33261f', muted: '#685e52', line: '#c8b68f',
          accent: '#9c4f2f', accentDark: '#6d3826', sage: '#748268', water: '#4f9295', copper: '#8b5233', gold: '#c89b4e'
        },
        scene: {
          mobile: '/assets/images/halls/kitchen-entry-mobile.jpg',
          desktop: '/assets/images/halls/kitchen-entry-desktop.jpg',
          masterMobile: '/assets/images/halls/kitchen-entry-mobile.png',
          masterDesktop: '/assets/images/halls/kitchen-entry-desktop.png',
          alt: '夕阳下的厨房事故馆像素庭院，古典柱廊、宽阔台阶与水渠通向中央大门'
        },
        door: {
          mobile: { left: 50, top: 47, width: 9, height: 12 },
          desktop: { left: 50, top: 42, width: 5, height: 13 }
        },
        entry: {
          eyebrow: 'Kitchen Accident Gallery · No. 01',
          title: '厨房事故馆',
          description: '奶油分离、蛋糕塌陷与每一次来不及端上桌的意外，都可以在这里被认真鉴定。',
          cta: '推门入馆'
        },
        motion: ['cloud', 'steam', 'water', 'flag', 'leaf', 'visitor']
      }
    },
    { id: 'beauty', name: '变美事故馆', icon: '〽', desc: '眼线、底妆、发型、美甲与染发色差', color: '#b55257', status: 'open', world: { door: { x: 1101, y: 279 }, interior: '/assets/images/pixel-world/interiors/beauty.webp', curator: '桃桃馆长', curatorIndex: 1, welcome: '左右不一样不代表要全部重来。先让我看看差异发生在哪一步。' } },
    { id: 'craft', name: '手作事故馆', icon: '⌂', desc: '黏土、模型、绘画、编织与结构倒塌', color: '#846b4f', status: 'open', world: { door: { x: 501, y: 496 }, interior: '/assets/images/pixel-world/interiors/craft.webp', curator: '阿绳馆长', curatorIndex: 2, welcome: '结构、材料和顺序都可能留下线索。把翻车现场放到工作台上吧。' } },
    { id: 'home', name: '家居改造馆', icon: '◇', desc: '墙面色差、组装错误、贴膜气泡与清洁痕迹', color: '#61736d', status: 'open', world: { door: { x: 1097, y: 499 }, interior: '/assets/images/pixel-world/interiors/home.webp', curator: '鲁班馆长', curatorIndex: 3, welcome: '先判断是外观问题还是结构风险，再决定修补、重装还是止损。' } },
    { id: 'plant', name: '植物急救馆', icon: '♧', desc: '黄叶、徒长、倒伏、浇水异常与换盆萎蔫', color: '#657c4c', status: 'open', world: { door: { x: 500, y: 742 }, interior: '/assets/images/pixel-world/interiors/plant.webp', curator: '青芽馆长', curatorIndex: 4, welcome: '叶色、土壤和根系会一起说话。请把最异常的位置拍清楚。' } },
    { id: 'camera', name: '拍摄翻车馆', icon: '◉', desc: '构图、光线、显矮、运镜与氛围失效', color: '#586779', status: 'open', world: { door: { x: 1116, y: 748 }, interior: '/assets/images/pixel-world/interiors/camera.webp', curator: '焦点馆长', curatorIndex: 5, welcome: '画面没达到预期，通常能从机位、光线和运动里找到原因。' } }
  ]

  const mainHall = {
    id: 'main', name: '中央总馆', icon: '✦', desc: '接收未分类案例，由 AI 推荐归入六座主题展馆', color: '#9b5b36', status: 'open', isMain: true,
    world: { door: { x: 800, y: 770 }, interior: '/assets/images/pixel-world/interiors/main-hall.png', curator: '小票馆长', curatorIndex: 0, welcome: '还不知道该去哪个馆也没关系。把现场交给我，AI 会先给出推荐，你确认后再正式归馆。' }
  }

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

  const api = { halls: halls, mainHall: mainHall, venues: [mainHall].concat(halls), hallByCase: hallByCase, serviceCatalog: serviceCatalog, communitySections: communitySections, contentTemplates: contentTemplates }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (root) root.MuseumPlatform = api
})(typeof window !== 'undefined' ? window : null)
