(function () {
  'use strict'

  const cases = window.MuseumCases.cases
  const platform = window.MuseumPlatform
  const state = {
    page: 'home', visit: null, selectedRoute: '', currentStep: 0,
    checkImage: '', verifyResult: null, matchTab: 0, busy: false,
    hallId: 'all', hallQuery: '', communityTab: 'new', resultTab: 'archive', contentTemplate: 'documentary',
    backendReady: false, arkConfigured: false, redfoxConfigured: false, arkModel: '',
    douyinResults: [], douyinLoading: false, douyinError: '', douyinKeyword: '',
    ffmpegAvailable: false, videoTemplate: 'documentary-20', videoJob: null
  }
  const app = document.getElementById('app')
  const toastNode = document.getElementById('toast')
  const routesMeta = {
    rescue: { name: '抢救', icon: '↗', desc: '尽量恢复原本的目标结果' },
    transform: { name: '改造', icon: '✦', desc: '换一个仍然值得完成的终点' },
    restart: { name: '重开', icon: '↻', desc: '复盘错误，用更短路径重做' },
    stop: { name: '止损', icon: '■', desc: '风险或成本过高时停止操作' }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]
    })
  }
  function safeExternalUrl(value) {
    try { const url = new URL(String(value || '')); return /^https?:$/.test(url.protocol) ? url.href : '' } catch (_) { return '' }
  }
  function toast(message) {
    toastNode.textContent = message; toastNode.classList.add('show')
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { toastNode.classList.remove('show') }, 2300)
  }
  function apiBase() {
    const override = (localStorage.getItem('museum_api_base') || '').replace(/\/$/, '')
    return override || (state.backendReady ? location.origin : '')
  }
  function analysisServiceNote() {
    if (localStorage.getItem('museum_api_base')) return '已使用手动配置的分析服务地址。'
    if (state.backendReady && state.arkConfigured) return '本地方舟代理已连接，模型：' + state.arkModel + '。新现场将进行真实多模态分析。'
    if (state.backendReady) return '本地 AI 代理已运行，但尚未配置方舟密钥。馆藏案例可体验，自选现场会返回配置提示。'
    return '未检测到本地 AI 代理。馆藏案例可体验，自选现场进入待分析状态。'
  }
  function shell(content) {
    const hallActive = state.page === 'halls', communityActive = state.page === 'community', curatorActive = state.page === 'curator'
    return '<main class="shell"><header class="topbar"><button class="icon-btn brand" data-page="home"><span class="brand-mark">FM</span><span>翻车博物馆<small>FAILURE MUSEUM</small></span></button><nav class="nav"><button data-page="home" class="' + (state.page === 'home' ? 'active' : '') + '">大厅</button><button data-page="halls" class="' + (hallActive ? 'active' : '') + '">主题展馆</button><button data-page="community" class="' + (communityActive ? 'active' : '') + '">社区</button><button data-page="curator" class="' + (curatorActive ? 'active' : '') + '">馆长中心</button><button data-page="collection" class="' + (state.page === 'collection' ? 'active' : '') + '">我的馆藏</button><button data-action="settings">服务设置</button></nav></header>' + content + '<nav class="mobile-nav"><button data-page="home" class="' + (state.page === 'home' ? 'active' : '') + '">大厅</button><button data-page="halls" class="' + (hallActive ? 'active' : '') + '">展馆</button><button data-page="intake" class="' + (state.page === 'intake' ? 'active' : '') + '">＋ 入馆</button><button data-page="community" class="' + (communityActive ? 'active' : '') + '">社区</button><button data-page="curator" class="' + (curatorActive ? 'active' : '') + '">馆长</button></nav></main>'
  }
  function progress(active) {
    const names = ['1 入馆', '2 鉴定', '3 处置', '4 归档']
    return '<div class="steps-nav">' + names.map(function (name, index) { return index === active ? '<b>' + name + '</b>' : '<span>' + name + '</span>' }).join('') + '</div>'
  }

  function renderHome() {
    const halls = platform.halls
    const cards = cases.map(function (item) {
      return '<article class="case-card" data-case="' + item.id + '"><img src="..' + item.image + '" alt="' + esc(item.shortName) + '"><div class="case-body"><div class="case-meta"><span>' + esc(item.hall) + '</span><span>馆藏案例</span></div><div class="case-name">' + esc(item.name) + '</div><div class="chips"><span class="chip">' + esc(item.severity) + '</span><span class="chip">可逆性 ' + esc(item.reversible) + '</span></div></div></article>'
    }).join('')
    const hallCards = halls.map(function (item) { return '<article class="card hall" data-hall="' + item.id + '"><div class="hall-icon">' + item.icon + '</div><div class="hall-name">' + item.name + '</div><div class="hall-desc">' + item.desc + '</div></article>' }).join('')
    app.innerHTML = shell('<section class="hero"><div><div class="eyebrow">Visual Search · Failure Museum</div><h1 class="title">今天又有什么<br><span class="accent">翻了</span>？</h1><p class="lead">拍下现场，找到和你失败得最像的人。判断为什么翻、还能不能救，并把失败变成一件值得分享的展品。</p><div class="hero-actions"><button class="btn primary" data-page="intake">◎ 拍下翻车现场</button><button class="btn secondary" data-page="community">参观博物馆社区</button></div></div><aside class="hero-ticket"><div class="ticket-num">ADMIT ONE · VISUAL SEARCH</div><div class="ticket-copy">失败不是终点，<br>只是换了一条<br>参观路线。</div><div class="ticket-foot"><span>今日开放</span><span>01—04</span></div></aside></section><section id="cases" class="section"><div class="section-head"><div class="section-title">正在展出的馆藏</div><div class="caption">三个真实案例，覆盖三类事故</div></div><div class="case-grid">' + cards + '</div></section><section class="section"><div class="section-head"><div class="section-title">六座主题展馆</div><button class="btn ghost" data-page="halls">查看全部馆藏</button></div><div class="hall-grid">' + hallCards + '</div></section><section class="section feature-grid"><article class="card feature"><div class="eyebrow">Community</div><h3>同款受害者，不再独自翻车</h3><p>围绕失败指纹组织新展、会诊、抢救成功记录与同款联盟。</p><button class="btn secondary" data-page="community">进入社区</button></article><article class="card feature"><div class="eyebrow">Curator System</div><h3>让教程创作者成为馆长</h3><p>提交典型案例、抢救胶囊、处理边界与品牌 Skill 草稿。</p><button class="btn secondary" data-page="curator">进入馆长中心</button></article></section>')
    const currentPosts = allPosts(), snapshot = '<section class="section"><div class="section-head"><div class="section-title">博物馆正在发生</div><div class="caption">全部来自当前实际数据</div></div><div class="snapshot-grid"><button data-community-tab="new" data-page="community"><b>' + currentPosts.filter(function (post) { return post.section === 'new' }).length + '</b><span>今日新展</span></button><button data-community-tab="treasure" data-page="community"><b>' + currentPosts.filter(function (post) { return (post.comments || []).length > 0 }).length + '</b><span>镇馆候选</span></button><button data-community-tab="rescued" data-page="community"><b>' + currentPosts.filter(function (post) { return post.section === 'rescued' }).length + '</b><span>抢救成功记录</span></button><button data-page="collection"><b>' + collections().length + '</b><span>我的馆藏</span></button></div></section>'
    app.querySelector('.mobile-nav').insertAdjacentHTML('beforebegin', snapshot)
  }

  function renderHalls() {
    const selectedHall = state.hallId === 'all' ? null : platform.halls.filter(function (hall) { return hall.id === state.hallId })[0]
    const query = state.hallQuery.toLowerCase()
    const filtered = cases.filter(function (item) {
      const hallMatch = !selectedHall || platform.hallByCase[item.id] === selectedHall.id
      const queryMatch = !query || [item.name, item.shortName, item.hall, item.anomaly, item.target].join(' ').toLowerCase().indexOf(query) >= 0
      return hallMatch && queryMatch
    })
    const hallNav = '<button class="hall-pill ' + (state.hallId === 'all' ? 'active' : '') + '" data-hall="all">全部展馆</button>' + platform.halls.map(function (hall) { return '<button class="hall-pill ' + (state.hallId === hall.id ? 'active' : '') + '" data-hall="' + hall.id + '">' + hall.icon + ' ' + hall.name + '</button>' }).join('')
    const results = filtered.length ? filtered.map(function (item) { return '<article class="case-card" data-case="' + item.id + '"><img src="..' + item.image + '" alt="' + esc(item.shortName) + '"><div class="case-body"><div class="case-meta"><span>' + esc(item.hall) + '</span><span>' + esc(item.severity) + '</span></div><div class="case-name">' + esc(item.name) + '</div><p class="caption">' + esc(item.anomaly) + '</p><div class="chips"><span class="chip">可逆性 ' + esc(item.reversible) + '</span><span class="chip">' + item.matches.length + ' 条案例切片</span></div></div></article>' }).join('') : '<div class="card empty wide"><div class="empty-icon">◇</div><div class="section-title">这个展柜正在征集案例</div><p class="lead" style="margin:12px auto 25px">当前没有符合条件的真实馆藏。可以提交你的翻车现场，或由馆长补充经过验证的案例。</p><div class="button-row center"><button class="btn primary" data-page="intake">提交翻车现场</button><button class="btn secondary" data-page="curator">馆长提交案例</button></div></div>'
    app.innerHTML = shell('<section class="page-head"><div class="eyebrow">Themed Galleries</div><h1 class="page-title">主题展馆</h1><p class="lead">六类生活翻车共用失败指纹与视觉搜索机制，知识、风险边界和处置 Skill 分馆维护。</p></section><form id="hallSearch" class="searchbar"><input id="hallQuery" value="' + esc(state.hallQuery) + '" placeholder="搜索异常、目标或展品名"><button class="btn primary">搜索馆藏</button></form><div class="hall-pills">' + hallNav + '</div><section class="section compact"><div class="section-head"><div class="section-title">' + (selectedHall ? selectedHall.name : '全部馆藏') + '</div><div class="caption">' + filtered.length + ' 件实际可浏览案例</div></div><div class="case-grid hall-results">' + results + '</div></section>')
  }

  function renderIntake() {
    const visit = state.visit || {}
    const image = visit.image || ''
    const media = !image ? '<label class="upload-empty"><input id="imageInput" type="file" accept="image/png,image/jpeg,video/mp4,video/webm" capture="environment" hidden><div class="upload-plus">＋</div><b>拍照、选择图片或视频</b><p>支持 JPG / PNG / MP4 / WebM</p></label>' : (visit.mediaType === 'video' ? '<video src="' + image + '" controls playsinline></video>' : '<div class="region-stage" id="regionStage"><img src="' + image + '" alt="待分析图片"><div id="regionBox" class="region-box" style="' + regionStyle(visit.region) + '"></div><div class="region-hint">拖动框选异常区域</div></div>') + '<label class="badge change-media"><input id="imageInput" type="file" accept="image/png,image/jpeg,video/mp4,video/webm" hidden>更换现场</label>'
    const targetPreview = visit.targetImage ? '<img class="target-preview" src="' + visit.targetImage + '" alt="目标效果图">' : ''
    app.innerHTML = shell(progress(0) + '<section class="page-head"><div class="eyebrow">New Exhibit</div><h1 class="page-title">提交翻车现场</h1><p class="lead">视觉表达当前结果，目标图表达想做到的状态，文字或语音补充过程和约束。</p></section><section class="intake-layout"><div><div class="card upload">' + media + '</div><div class="capture-tools"><span>' + (visit.region ? '已记录异常区域' : '图片可拖动框选异常区域') + '</span><label class="btn ghost"><input id="targetInput" type="file" accept="image/png,image/jpeg" hidden>＋ 添加目标效果图</label></div>' + targetPreview + '</div><form id="intakeForm" class="card form"><div class="field"><label for="description">发生了什么？ <button type="button" class="voice-btn" data-action="voice">◉ 语音描述</button></label><textarea id="description" maxlength="500" placeholder="例如：跟着教程做到第三步，奶油突然变成颗粒了">' + esc(visit.description || '') + '</textarea></div><div class="field"><label for="target">你原本想做成什么？</label><input id="target" value="' + esc(visit.target || '') + '" placeholder="目标结果（建议填写）"></div><div class="field two-fields"><div><label for="sourceUrl">关联原教程</label><input id="sourceUrl" value="' + esc(visit.sourceUrl || '') + '" placeholder="教程链接或作品标识"></div><div><label for="sourceTime">翻车发生时间点</label><input id="sourceTime" value="' + esc(visit.sourceTime || '') + '" placeholder="例如 00:36 / 第3步"></div></div><div class="field"><label for="constraints">现实约束</label><input id="constraints" value="' + esc(visit.constraints || '') + '" placeholder="时间、材料、预算、是否愿意重做…"></div><div class="truth-note">' + esc(analysisServiceNote()) + '</div><button class="btn primary full" type="submit">送往 AI 鉴定室</button></form></section>')
  }

  function regionStyle(region) {
    if (!region) return 'display:none'
    return 'display:block;left:' + region.x + '%;top:' + region.y + '%;width:' + region.width + '%;height:' + region.height + '%'
  }

  function renderPending() {
    app.innerHTML = shell(progress(1) + '<section class="page-head"><div class="eyebrow">Appraisal Pending</div><h1 class="page-title">等待真实分析服务</h1></section><section class="analysis-grid"><aside class="card exhibit"><img src="' + state.visit.image + '" alt="待分析现场"><div class="exhibit-info"><div class="case-meta">本地自选图片</div><div class="exhibit-name">尚未生成失败指纹</div></div></aside><div class="card panel"><div class="section-title">为什么没有直接给答案？</div><p class="lead">当前没有配置视觉模型与案例检索服务。这张图片没有被强行套用眼线、小屋或奶油的结论。</p><div class="truth-note">在右上角“服务设置”中填写本地或远程 API 地址，或先返回浏览当前馆藏。</div><div class="button-row"><button class="btn secondary" data-page="intake">返回补充信息</button><button class="btn primary" data-page="halls">浏览馆藏案例</button></div></div></section>')
  }

  function renderDiagnosis() {
    if (!state.visit || state.visit.mode === 'pending') { renderPending(); return }
    const item = state.visit.analysis
    const fingerprint = [['目标对象', item.target], ['当前阶段', item.stage], ['异常形态', item.anomaly], ['异常区域', item.area], ['严重程度', item.severity], ['可逆程度', item.reversible]]
    const fps = fingerprint.map(function (row) { return '<div class="fp-row"><span>' + row[0] + '</span><strong>' + esc(row[1]) + '</strong></div>' }).join('')
    const hypotheses = (item.hypotheses || []).map(function (hyp, index) { return '<div class="hyp"><div class="hyp-top"><span>' + (index + 1) + '. ' + esc(hyp.name) + '</span><b>' + Number(hyp.probability || 0) + '%</b></div><div class="bar"><i style="width:' + Number(hyp.probability || 0) + '%"></i></div><small>支持证据：' + esc(hyp.evidence) + '</small></div>' }).join('')
    const matches = item.matches || []
    const match = matches[state.matchTab]
    const matchHtml = match ? '<div class="match"><div><div class="eyebrow">' + esc(match.kind) + '</div><div class="match-title">' + esc(match.title) + '</div><small>' + esc(match.source) + ' · ' + (match.verified ? '已验证案例' : '未验证') + '</small></div><div class="score">' + Number(match.score || 0) + '<small>%</small></div></div>' : '<div class="truth-note">真实检索没有返回这一类案例。</div>'
    const aiMeta = state.visit.mode === 'online' ? '<div class="ai-meta"><span>真实模型分析</span><b>' + esc((item.analysisMeta || {}).model || state.arkModel || '方舟多模态模型') + '</b><span>判断置信度</span><b>' + Number(item.analysisConfidence || 0) + '%</b></div>' : ''
    const detectionNote = item.failureDetected === false ? '<div class="warning">当前媒体没有提供足够证据确认失败状态。系统已停止生成实质修复建议，请补充目标图、异常时间点或更清晰画面。</div>' : ''
    const mediaEvidence = item.mediaEvidence || {}, onscreenTexts = Array.isArray(mediaEvidence.onscreenTexts) ? mediaEvidence.onscreenTexts : []
    const mediaEvidencePanel = state.visit.mediaType !== 'video' ? '' : '<section class="card panel"><div class="section-title">模型读到的视频信息</div><div class="fp-row"><span>音轨口播</span><strong>' + esc(mediaEvidence.speechSummary || (mediaEvidence.audioObserved ? '听到音轨，但未返回摘要' : '未识别到有效口播')) + '</strong></div><div class="fp-row"><span>画面字幕</span><strong>' + esc(onscreenTexts.length ? onscreenTexts.join('；') : '未识别到明确屏幕文字') + '</strong></div><div class="fp-row"><span>可见现象</span><strong>' + esc(mediaEvidence.visualSummary || '未单独返回视觉摘要') + '</strong></div></section>'
    const douyinCards = state.douyinResults.map(function (work) {
      const href = safeExternalUrl(work.workUrl), cover = safeExternalUrl(work.coverUrl)
      return '<a class="douyin-work" href="' + esc(href || '#') + '" ' + (href ? 'target="_blank" rel="noopener noreferrer nofollow"' : 'aria-disabled="true"') + '>' + (cover ? '<img src="' + esc(cover) + '" alt="">' : '<div class="douyin-cover">DY</div>') + '<div><b>' + esc(work.title || work.content || '未命名作品') + '</b><span>' + esc(work.accountName || '未知作者') + ' · ' + Number(work.likeCount || 0).toLocaleString('zh-CN') + ' 赞</span><span class="relevance">相关度 ' + Number(work.relevanceScore || 0) + ' · ' + esc((work.relevanceReasons || []).join('、')) + '</span></div></a>'
    }).join('')
    const douyinPanel = state.visit.mode !== 'online' ? '' : '<section class="card panel"><div class="section-head mini"><div><div class="section-title">抖音参考作品</div><div class="caption">关键词检索：' + esc(state.douyinKeyword || item.shortName || '') + '</div></div></div>' + (state.douyinLoading ? '<div class="truth-note">正在检索真实抖音作品…</div>' : state.douyinError ? '<div class="warning">' + esc(state.douyinError) + '</div>' : douyinCards ? '<div class="douyin-grid">' + douyinCards + '</div><div class="truth-note">这些是关键词检索结果，不等同于视觉相似度排序或经过验证的抢救案例。</div>' : '<div class="truth-note">当前关键词没有返回可展示的真实作品。</div>') + '</section>'
    const exhibitMedia = state.visit.mediaType === 'video' ? '<video src="' + state.visit.image + '" controls playsinline style="width:100%;height:390px;object-fit:contain;display:block;background:#171512"></video>' : '<img src="' + state.visit.image + '" alt="' + esc(item.shortName || item.name) + '">'
    app.innerHTML = shell(progress(1) + '<section class="page-head"><div class="eyebrow">Appraisal Room · AI</div><h1 class="page-title">失败鉴定报告</h1></section><section class="analysis-grid"><aside class="card exhibit sticky">' + exhibitMedia + '<div class="exhibit-info"><div class="case-meta"><span>' + esc(item.hall || '待分类') + '</span><span>' + (state.visit.mode === 'builtin' ? '馆藏案例' : '在线分析') + '</span></div><div class="exhibit-name">' + esc(item.name || item.shortName) + '</div></div></aside><div><section class="card panel"><div class="section-title">失败指纹</div>' + aiMeta + fps + detectionNote + (item.safety ? '<div class="warning">安全提示：' + esc(item.safety) + '</div>' : '') + '</section>' + mediaEvidencePanel + '<section class="card panel"><div class="section-title">原因假设</div>' + hypotheses + '</section><section class="card panel question"><div class="eyebrow">关键追问</div><div class="question-copy">' + esc(item.question) + '</div><div class="button-row"><button class="btn secondary" data-answer="yes">可以 / 是</button><button class="btn secondary" data-answer="no">不可以 / 否</button></div>' + (item.followUpResult ? '<div class="verify-result"><b>判断已更新</b><br>' + esc(item.followUpResult) + '</div>' : '') + '</section><section class="card panel"><div class="section-title">同款翻车</div><div class="tabs">' + ['长得最像', '经历最像', '最值得参考'].map(function (name, index) { return '<button class="tab ' + (state.matchTab === index ? 'active' : '') + '" data-tab="' + index + '">' + name + '</button>' }).join('') + '</div>' + matchHtml + '<div class="truth-note">只显示当前案例库或分析服务实际返回的结果，不展示虚构馆藏总数。</div></section>' + douyinPanel + '<button class="btn primary full" data-page="action">查看四条处置路线</button></div></section>')
  }

  function renderAction() {
    const item = state.visit && state.visit.analysis
    if (!item || !item.routes) { go('home'); return }
    if (!state.selectedRoute) {
      const recommended = Object.keys(item.routes).filter(function (key) { return item.routes[key].recommended })[0]
      state.selectedRoute = recommended || 'rescue'
    }
    const cards = Object.keys(routesMeta).map(function (key) {
      const meta = routesMeta[key], route = item.routes[key] || { summary: '', steps: [] }
      return '<article class="card route ' + (state.selectedRoute === key ? 'selected' : '') + '" data-route="' + key + '"><div class="route-top"><span class="route-icon">' + meta.icon + '</span>' + (route.recommended ? '<span class="recommend">AI 建议</span>' : '') + '</div><h3>' + meta.name + '</h3><small>' + meta.desc + '</small><p>' + esc(route.summary) + '</p></article>'
    }).join('')
    const selected = item.routes[state.selectedRoute]
    const steps = selected.steps.map(function (step, index) { return '<div class="step-line"><b>' + (index + 1) + '</b><div>' + esc(step) + '</div></div>' }).join('')
    app.innerHTML = shell(progress(2) + '<section class="page-head"><div class="eyebrow">Disposition</div><h1 class="page-title">这次，怎么处理？</h1><p class="lead">不是所有失败都要强行救回原样。根据可逆性、风险与成本选择路线。</p></section><section class="route-grid">' + cards + '</section><section class="card route-details"><div class="eyebrow">' + routesMeta[state.selectedRoute].name + '路线预览</div>' + steps + '</section><div style="margin-top:18px"><button class="btn primary full" data-page="coach">进入分步陪练</button></div>')
  }

  function renderCoach() {
    const item = state.visit.analysis, route = item.routes[state.selectedRoute]
    if (state.currentStep >= route.steps.length) { renderFinish(); return }
    const width = ((state.currentStep + 1) / route.steps.length * 100).toFixed(1)
    app.innerHTML = shell(progress(2) + '<section class="coach"><section class="page-head"><div class="eyebrow">Live Conservation</div><h1 class="page-title">现场陪练 <small>' + (state.currentStep + 1) + ' / ' + route.steps.length + '</small></h1><div class="progress"><i style="width:' + width + '%"></i></div></section><article class="card current-step"><div class="eyebrow">当前步骤 ' + (state.currentStep + 1) + '</div><div class="current-copy">' + esc(route.steps[state.currentStep]) + '</div>' + (item.safety ? '<div class="warning">' + esc(item.safety) + '</div>' : '') + '</article><article class="card verify"><h3>做完后，拍一下当前状态</h3><p class="caption">未接服务时仅供人工复核，不显示虚假 AI 通过。</p><label class="photo-check"><input id="checkInput" type="file" accept="image/png,image/jpeg" capture="environment" hidden>' + (state.checkImage ? '<img src="' + state.checkImage + '" alt="复查图片">' : '<div><div style="font-size:42px;color:var(--red)">◎</div><div>拍摄 / 选择复查图片</div></div>') + '</label><button class="btn secondary full" data-action="verify">验证当前状态</button>' + (state.verifyResult ? '<div class="verify-result"><b>' + esc(state.verifyResult.title) + '</b><br>' + esc(state.verifyResult.message) + '</div>' : '') + '</article><div class="button-row" style="margin-top:17px"><button class="btn ghost" data-action="prev-step" ' + (state.currentStep === 0 ? 'disabled' : '') + '>上一步</button><button class="btn primary" style="flex:1" data-action="next-step">我已确认，下一步</button></div></section>')
  }

  function renderFinish() {
    const item = state.visit.analysis, route = item.routes[state.selectedRoute]
    app.innerHTML = shell(progress(3) + '<section class="coach"><article class="card finish"><div class="seal">藏</div><h1 class="page-title">处理步骤完成</h1><p class="lead" style="margin:auto">是否真正抢救成功由你决定。归档只记录“完成步骤”，不会自动宣称成功。</p><div class="card panel" style="text-align:left;margin-top:25px"><div class="fp-row"><span>展品</span><strong>' + esc(item.name || item.shortName) + '</strong></div><div class="fp-row"><span>处置路线</span><strong>' + routesMeta[state.selectedRoute].name + '</strong></div><div class="fp-row"><span>视觉复核</span><strong>' + (state.verifyResult && !state.verifyResult.offline ? '已在线复核' : '未在线复核') + '</strong></div></div><button class="btn primary full" data-action="archive">收入我的馆藏</button></article></section>')
  }

  function buildContent(item, templateId) {
    const primary = item.hypotheses && item.hypotheses[0] ? item.hypotheses[0].name : '原因仍待确认'
    const route = item.routes[state.selectedRoute]
    if (templateId === 'museum') return '【展品解说】\n现在展出的是' + (item.name || item.shortName) + '。\n创作者原本想要：' + item.target + '。\n入馆时发现：' + item.anomaly + '。\n鉴定室的首要判断是：' + primary + '。\n本次选择“' + routesMeta[state.selectedRoute].name + '”路线：' + route.summary + '\n本馆提醒：完成步骤不等于自动成功，最终结果由复拍与本人确认。'
    if (templateId === 'court') return '【翻车法庭】\n目标图：我要求的是“' + item.target + '”。\n实际结果：我只是出现了“' + item.anomaly + '”。\nAI 鉴定官：目前最有证据的原因是“' + primary + '”，但仍需结合追问确认。\n处置裁定：采用“' + routesMeta[state.selectedRoute].name + '”路线。\n最终陈述：' + route.summary
    return '【翻车纪录片分镜】\n0—3秒｜目标效果：' + item.target + '\n3—6秒｜翻车现场：' + item.anomaly + '\n6—10秒｜AI 鉴定：' + primary + '\n10—15秒｜处理路线：' + routesMeta[state.selectedRoute].name + '\n15—20秒｜关键动作：' + route.steps.slice(0, 2).join('；') + '\n20秒后｜复拍结果与本人满意度确认。'
  }

  function localVideoStudio() {
    const job = state.videoJob
    const templateOptions = [['flash-15', '15秒事故快报'], ['documentary-20', '20秒翻车纪录片'], ['before-after-20', '20秒前后对比']]
    const select = '<select id="videoTemplate">' + templateOptions.map(function (item) { return '<option value="' + item[0] + '" ' + (state.videoTemplate === item[0] ? 'selected' : '') + '>' + item[1] + '</option>' }).join('') + '</select>'
    let result = ''
    if (!state.backendReady) result = '<div class="warning">本地服务未运行，无法调用 FFmpeg。</div>'
    else if (!state.ffmpegAvailable) result = '<div class="warning">本机没有检测到 FFmpeg，请重新运行启动脚本或按接入说明安装。</div>'
    else if (job && (job.status === 'queued' || job.status === 'rendering')) result = '<div class="video-progress"><div class="progress"><i style="width:' + Number(job.progress || 0) + '%"></i></div><b>' + esc(job.message || '正在生成') + ' · ' + Number(job.progress || 0) + '%</b><span>可以停留在本页，也可以浏览其他模块；渲染任务在本地后台继续。</span></div>'
    else if (job && job.status === 'failed') result = '<div class="warning">生成失败：' + esc(job.error || job.message) + '</div><button class="btn secondary" data-action="generate-local-video">重新生成</button>'
    else if (job && job.status === 'completed') {
      const videoUrl = apiBase() + job.videoUrl, downloadUrl = apiBase() + job.downloadUrl
      result = '<div class="generated-video"><video src="' + esc(videoUrl) + '" controls playsinline></video><div class="button-row"><a class="btn primary" href="' + esc(downloadUrl) + '">下载 MP4</a><button class="btn ghost" data-action="generate-local-video">重新生成</button></div></div>'
    } else result = '<button class="btn primary full" data-action="generate-local-video">一键生成免费本地成片</button>'
    return '<section class="card local-video-studio"><div><div class="eyebrow">Local FFmpeg · Free</div><div class="section-title">一键生成视频</div><p>使用当前现场、失败指纹、原因和处置步骤，在本机生成竖屏 MP4。无需云渲染积分，也不会自动上传到第三方。</p><label>成片模板</label>' + select + '<div class="truth-note">前后对比模板会优先使用处置后的复拍；没有复拍时仍会使用当前现场生成。</div></div><div>' + result + '</div></section>'
  }

  function renderResult() {
    const item = state.visit && state.visit.analysis
    if (!item) { go('home'); return }
    const route = item.routes[state.selectedRoute]
    const hallId = platform.hallByCase[item.id] || 'craft'
    const services = platform.serviceCatalog[hallId] || { tools: [], course: '等待馆长补充对应课程', localService: '可以发布服务需求，等待真实服务方接入。' }
    const tabs = [['archive', '馆藏档案'], ['report', '复盘报告'], ['content', '生成内容'], ['service', '工具与服务']]
    let content = ''
    if (state.resultTab === 'archive') {
      content = '<div class="result-layout"><article class="museum-card" id="museumCard"><div class="museum-card-image"><img src="' + state.visit.image + '" alt="展品现场"><span>FAILURE MUSEUM</span></div><div class="museum-card-body"><div class="eyebrow">' + esc(item.hall) + '</div><h2>' + esc(item.name || item.shortName) + '</h2><div class="museum-facts"><span>异常</span><b>' + esc(item.anomaly) + '</b><span>处置</span><b>' + routesMeta[state.selectedRoute].name + '</b><span>状态</span><b>' + (state.verifyResult && !state.verifyResult.offline ? '已视觉复核' : '待本人确认') + '</b></div></div></article><div class="card panel"><div class="section-title">馆藏卡</div><p class="lead">记录目标、翻车现场、失败指纹、鉴定与处置过程。它既是复盘档案，也是后续社区分享的内容源。</p><div class="button-stack"><button class="btn primary" data-action="archive">收入我的馆藏</button><button class="btn secondary" data-action="publish-result">发布到博物馆社区</button><button class="btn ghost" data-action="poster">生成 PNG 分享卡</button></div></div></div>'
    } else if (state.resultTab === 'report') {
      const evidence = (item.evidence || []).map(function (value) { return '<li>' + esc(value) + '</li>' }).join('')
      const prevention = route.steps.slice(0, 3).map(function (value) { return '<li>' + esc(value) + '</li>' }).join('')
      content = '<div class="report-grid"><article class="card panel"><div class="eyebrow">What happened</div><div class="section-title">这次为什么翻</div><p>' + esc(item.hypotheses[0] ? item.hypotheses[0].name : '原因仍不确定') + '</p><ul class="clean-list">' + evidence + '</ul></article><article class="card panel"><div class="eyebrow">Next time</div><div class="section-title">下次防翻车</div><ul class="clean-list">' + prevention + '</ul></article><article class="card panel"><div class="eyebrow">Uncertainty</div><div class="section-title">仍未确认</div><p>' + esc(item.question) + '</p><p class="caption">完成处置步骤不会消除这一不确定性；需要补充画面或真实反馈。</p></article><article class="card panel"><div class="eyebrow">Source return</div><div class="section-title">原教程回看</div><p>' + (state.visit.sourceUrl ? '已关联教程：' + esc(state.visit.sourceUrl) + '<br>建议回看：' + esc(state.visit.sourceTime || '发生异常前一步') : '本次没有关联原教程。可以在再次入馆时补充链接与时间点。') + '</p></article></div>'
    } else if (state.resultTab === 'content') {
      const templateButtons = platform.contentTemplates.map(function (template) { return '<button class="template-card ' + (state.contentTemplate === template.id ? 'active' : '') + '" data-template="' + template.id + '"><b>' + template.name + '</b><span>' + template.desc + '</span></button>' }).join('')
      content = '<div class="content-studio"><div class="template-list">' + templateButtons + '</div><article class="card script-card"><div class="eyebrow">Generated Storyboard</div><pre id="generatedScript">' + esc(buildContent(item, state.contentTemplate)) + '</pre><div class="button-row"><button class="btn primary" data-action="copy-script">复制脚本</button><button class="btn ghost" data-action="poster">生成封面卡</button></div></article></div>' + localVideoStudio()
    } else {
      const tools = services.tools.map(function (tool) { return '<article class="tool-row"><div><b>' + esc(tool.name) + '</b><span>' + esc(tool.type) + '</span><p>' + esc(tool.reason) + '</p></div><button class="btn ghost" data-tool="' + esc(tool.name) + '">加入清单</button></article>' }).join('')
      content = '<div class="service-grid"><article class="card panel"><div class="eyebrow">Tools & materials</div><div class="section-title">确认诊断后再推荐</div>' + tools + '</article><article class="card panel"><div class="eyebrow">Course</div><div class="section-title">对应课程</div><p>' + esc(services.course) + '</p><button class="btn secondary" data-action="save-course">保存到学习清单</button></article><article class="card panel"><div class="eyebrow">Local service</div><div class="section-title">发布本地服务需求</div><p>' + esc(services.localService) + '</p><form id="serviceForm"><input id="serviceCity" placeholder="所在城市（可选）"><textarea id="serviceNeed" placeholder="描述需要真人协助的部分"></textarea><button class="btn primary full">保存服务需求</button></form></article><article class="card panel"><div class="eyebrow">Commercial boundary</div><div class="section-title">推荐边界</div><p>当前不展示虚构商家、价格、销量或距离。真实商家目录、课程和商品需由后端返回，并标注广告与合作关系。</p></article></div>'
    }
    app.innerHTML = shell(progress(3) + '<section class="page-head"><div class="eyebrow">Exhibit Result</div><h1 class="page-title">处理结果与馆藏</h1><p class="lead">从解决问题继续走向复盘、传播、社区与服务。</p></section><div class="result-tabs">' + tabs.map(function (tab) { return '<button class="' + (state.resultTab === tab[0] ? 'active' : '') + '" data-result-tab="' + tab[0] + '">' + tab[1] + '</button>' }).join('') + '</div>' + content)
  }

  function seedPosts() {
    const savedComments = commentMap()
    return cases.map(function (item, index) {
      const id = 'case-' + item.id
      return { id: id, sourceCaseId: item.id, title: item.name, content: item.anomaly + '。当前首要原因假设：' + item.hypotheses[0].name + '。', hall: item.hall, image: '..' + item.image, section: index === 2 ? 'mystery' : 'new', fingerprint: item.shortName, author: '翻车博物馆策展组', comments: savedComments[id] || [], joined: false, createdAt: '馆藏案例' }
    })
  }
  function userPosts() { try { return JSON.parse(localStorage.getItem('museum_community_posts') || '[]') } catch (_) { return [] } }
  function allPosts() { return userPosts().concat(seedPosts()) }
  function saveUserPosts(posts) { localStorage.setItem('museum_community_posts', JSON.stringify(posts)) }

  function renderCommunity() {
    const posts = allPosts()
    let feed = ''
    if (state.communityTab === 'alliance') {
      const groups = {}
      posts.forEach(function (post) { const key = post.fingerprint || '等待鉴定的翻车'; if (!groups[key]) groups[key] = []; groups[key].push(post) })
      feed = '<div class="alliance-grid">' + Object.keys(groups).map(function (name) { const members = groups[name]; return '<article class="card alliance"><div class="alliance-symbol">≋</div><div><div class="eyebrow">Failure fingerprint</div><h3>“' + esc(name) + '”联盟</h3><p>' + members.length + ' 件当前实际可见馆藏</p><button class="btn secondary" data-alliance="' + esc(name) + '">加入并查看</button></div></article>' }).join('') + '</div>'
    } else {
      const filtered = posts.filter(function (post) {
        if (state.communityTab === 'treasure') return (post.comments || []).length > 0
        if (state.communityTab === 'rescued') return post.section === 'rescued'
        if (state.communityTab === 'mystery') return post.section === 'mystery'
        return post.section === 'new' || post.section === 'rescued'
      })
      feed = filtered.length ? '<div class="community-grid">' + filtered.map(function (post) { return '<article class="card post"><img src="' + post.image + '" alt="' + esc(post.title) + '"><div class="post-body"><div class="case-meta"><span>' + esc(post.hall) + '</span><span>' + esc(post.createdAt) + '</span></div><h3>' + esc(post.title) + '</h3><p>' + esc(post.content) + '</p><div class="fingerprint-label">失败指纹 · ' + esc(post.fingerprint || '待鉴定') + '</div><div class="post-foot"><span>由 ' + esc(post.author) + ' 提交</span><button data-comment="' + post.id + '">会诊 ' + (post.comments || []).length + '</button></div></div></article>' }).join('') + '</div>' : '<div class="card empty"><div class="empty-icon">◇</div><div class="section-title">这里还没有真实内容</div><p class="lead" style="margin:12px auto">排行和抢救成功区不会用假互动填满。发布或完成一次真实流程后会出现在这里。</p></div>'
    }
    const sectionTabs = platform.communitySections.map(function (section) { return '<button class="community-tab ' + (state.communityTab === section.id ? 'active' : '') + '" data-community-tab="' + section.id + '"><b>' + section.name + '</b><span>' + section.desc + '</span></button>' }).join('')
    app.innerHTML = shell('<section class="page-head"><div class="eyebrow">Museum Community</div><h1 class="page-title">博物馆社区</h1><p class="lead">不按热闹程度堆普通帖子，而是围绕失败知识、诊断状态与处理结果组织内容。</p></section><div class="community-tabs">' + sectionTabs + '</div><section class="community-layout"><div>' + feed + '</div><aside class="card compose sticky"><div class="eyebrow">Submit exhibit</div><div class="section-title">发布一件新展</div><form id="communityForm"><input id="postTitle" required placeholder="展品名称"><select id="postHall">' + platform.halls.map(function (hall) { return '<option>' + hall.name + '</option>' }).join('') + '</select><input id="postFingerprint" placeholder="失败指纹，例如：眼尾角度不一致"><textarea id="postContent" required placeholder="发生了什么、做过哪些尝试？"></textarea><label class="file-pick"><input id="postImage" type="file" accept="image/png,image/jpeg" hidden>＋ 选择现场图片</label><button class="btn primary full">发布到今日新展</button></form><div class="truth-note">所有发布内容只保存在当前浏览器；接入账号、审核和云端数据库后才能形成真实多人社区。</div></aside></section>')
  }

  function creatorProfile() { try { return JSON.parse(localStorage.getItem('museum_curator_profile') || 'null') } catch (_) { return null } }
  function capsules() { try { return JSON.parse(localStorage.getItem('museum_capsules') || '[]') } catch (_) { return [] } }
  function renderCurator() {
    const profile = creatorProfile()
    if (!profile) {
      app.innerHTML = shell('<section class="page-head"><div class="eyebrow">Curator System</div><h1 class="page-title">申请成为馆长或鉴定员</h1><p class="lead">教程创作者可以贡献典型失败案例、15 秒抢救胶囊、原因解释、处理边界和推荐工具。</p></section><div class="curator-intro"><article class="card curator-poster"><div class="ticket-num">OPEN CALL · CURATOR</div><div class="ticket-copy">不只教人<br>怎么成功，<br>也解释为何失败。</div></article><form id="curatorApply" class="card panel"><div class="section-title">馆长申请</div><div class="field"><label>显示名称</label><input id="curatorName" required placeholder="你的创作者名称"></div><div class="field"><label>申请展馆</label><select id="curatorHall">' + platform.halls.map(function (hall) { return '<option>' + hall.name + '</option>' }).join('') + '</select></div><div class="field"><label>角色</label><select id="curatorRole"><option>馆长</option><option>鉴定员</option><option>修复师</option><option>品牌 Skill 维护者</option></select></div><div class="field"><label>专业经历与可验证来源</label><textarea id="curatorExpertise" required placeholder="请描述经验；正式上线需要提交证明材料"></textarea></div><button class="btn primary full">提交本地申请</button><div class="truth-note">当前申请会进入“本地待审核”状态，不会伪造平台认证。</div></form></div>')
      return
    }
    const items = capsules()
    const cards = items.length ? items.map(function (item) { return '<article class="card capsule"><div class="case-meta"><span>' + esc(item.type) + '</span><span>' + esc(item.createdAt) + '</span></div><h3>' + esc(item.title) + '</h3><p>' + esc(item.explanation) + '</p><div class="fingerprint-label">处理边界 · ' + esc(item.boundary) + '</div></article>' }).join('') : '<div class="card empty mini"><div class="empty-icon">＋</div><b>还没有提交内容</b><p class="caption">创建第一条可被视觉检索召回的内容。</p></div>'
    app.innerHTML = shell('<section class="page-head curator-head"><div><div class="eyebrow">Curator Studio</div><h1 class="page-title">' + esc(profile.name) + '的馆长工作台</h1><p class="lead">' + esc(profile.hall) + ' · ' + esc(profile.role) + ' · 本地待审核</p></div><div class="actual-metrics"><div><b>' + items.length + '</b><span>已提交内容</span></div><div><b>0</b><span>真实抢救回流</span></div><div><b>0</b><span>已审核案例</span></div></div></section><section class="studio-grid"><form id="capsuleForm" class="card panel"><div class="eyebrow">Knowledge supply</div><div class="section-title">创建馆长内容</div><select id="capsuleType"><option>典型失败案例</option><option>15秒抢救胶囊</option><option>品牌官方抢救 Skill</option><option>处理边界说明</option></select><input id="capsuleTitle" required placeholder="标题"><input id="capsuleFingerprint" required placeholder="可召回的失败指纹"><textarea id="capsuleExplanation" required placeholder="原因解释与支持证据"></textarea><textarea id="capsuleSteps" required placeholder="分步处理，每行一步"></textarea><textarea id="capsuleBoundary" required placeholder="什么时候不应继续处理"></textarea><button class="btn primary full">保存并提交审核</button></form><div><div class="section-head"><div class="section-title">我的内容供给</div><div class="caption">仅显示实际保存内容</div></div><div class="capsule-grid">' + cards + '</div></div></section>')
  }

  function collections() { try { return JSON.parse(localStorage.getItem('museum_collections_web') || '[]') } catch (_) { return [] } }
  function renderCollection() {
    const records = collections()
    let body = '<section class="page-head"><div class="eyebrow">My Archive</div><h1 class="page-title">我的馆藏</h1><p class="lead">' + records.length + ' 件保存在当前浏览器中的展品。</p></section>'
    if (!records.length) body += '<section class="card empty"><div class="empty-icon">□</div><div class="section-title">展柜还是空的</div><p class="lead" style="margin:12px auto 28px">完成一次处置流程后，展品会保存在本地。</p><button class="btn primary" data-page="intake">收下第一件翻车</button></section>'
    else body += '<section class="archive-grid">' + records.map(function (record) { return '<article class="card archive"><img src="' + record.image + '" alt="' + esc(record.name) + '"><div class="archive-body"><div class="case-meta"><span>' + esc(record.hall) + '</span><span>' + esc(record.createdAt) + '</span></div><div class="case-name">' + esc(record.name) + '</div><p>处理路线 · ' + esc(record.routeName) + '</p><span class="status">' + (record.verified ? '已通过在线视觉复核' : '用户完成步骤，未在线复核') + '</span><div style="margin-top:16px"><button class="btn ghost" data-delete="' + record.recordId + '">移出馆藏</button></div></div></article>' }).join('') + '</section><div style="margin-top:22px"><button class="btn primary" data-page="intake">继续入馆</button></div>'
    app.innerHTML = shell(body)
  }

  function render() {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (state.page === 'home') renderHome()
    else if (state.page === 'halls') renderHalls()
    else if (state.page === 'intake') renderIntake()
    else if (state.page === 'diagnosis') renderDiagnosis()
    else if (state.page === 'action') renderAction()
    else if (state.page === 'coach') renderCoach()
    else if (state.page === 'finish') renderFinish()
    else if (state.page === 'result') renderResult()
    else if (state.page === 'community') renderCommunity()
    else if (state.page === 'curator') renderCurator()
    else if (state.page === 'collection') renderCollection()
  }
  function go(page) { state.page = page; history.pushState({ page: page }, '', '#' + page); render() }

  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpeg)$/.test(file.type)) { reject(new Error('请选择 JPG 或 PNG 图片')); return }
      const reader = new FileReader()
      reader.onerror = function () { reject(new Error('图片读取失败')) }
      reader.onload = function () {
        const image = new Image()
        image.onerror = function () { reject(new Error('图片无法解析')) }
        image.onload = function () {
          const max = 1400, scale = Math.min(1, max / Math.max(image.width, image.height))
          const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', .84))
        }
        image.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }

  function analyzeOnline(form) {
    const base = apiBase()
    if (!base) return Promise.reject(new Error('NO_API'))
    const mediaPromise = state.visit.rawFile ? Promise.resolve(state.visit.rawFile) : fetch(state.visit.image).then(function (response) { return response.blob() })
    return mediaPromise.then(function (blob) {
      const data = new FormData(); data.append('image', blob, state.visit.mediaType === 'video' ? 'failure.mp4' : 'failure.jpg'); data.append('description', form.description); data.append('target', form.target); data.append('constraints', form.constraints); data.append('source_url', form.sourceUrl || ''); data.append('source_time', form.sourceTime || ''); data.append('region', JSON.stringify(state.visit.region || null))
      if (state.visit.targetImage) return fetch(state.visit.targetImage).then(function (response) { return response.blob() }).then(function (targetBlob) { data.append('target_image', targetBlob, 'target.jpg'); return data })
      return data
    }).then(function (data) {
      return fetch(base + '/api/v1/cases/analyze', { method: 'POST', body: data })
    }).then(function (response) { return response.json().catch(function () { return {} }).then(function (data) { if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : '分析服务返回 ' + response.status); return data }) })
  }

  function searchDouyin(item) {
    if (!state.redfoxConfigured || !apiBase() || !item || item.failureDetected === false) return
    const keyword = String(item.shortName || item.anomaly || item.name || '').trim().slice(0, 60)
    if (!keyword) return
    state.douyinLoading = true; state.douyinError = ''; state.douyinResults = []; state.douyinKeyword = keyword
    if (state.page === 'diagnosis') renderDiagnosis()
    fetch(apiBase() + '/api/v1/douyin/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword, offset: 0, sortType: 'default', limit: 6, fingerprint: { shortName: item.shortName, anomaly: item.anomaly, area: item.area, stage: item.stage, target: item.target, hypotheses: item.hypotheses } })
    }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : '抖音作品检索返回 ' + response.status)
        return data
      })
    }).then(function (data) {
      state.douyinResults = Array.isArray(data.items) ? data.items.slice(0, 6) : []
      state.douyinLoading = false
      if (state.page === 'diagnosis') renderDiagnosis()
    }).catch(function (error) {
      state.douyinLoading = false; state.douyinError = error.message
      if (state.page === 'diagnosis') renderDiagnosis()
    })
  }

  let videoPollTimer = null
  function pollVideoJob(jobId) {
    clearTimeout(videoPollTimer)
    fetch(apiBase() + '/api/v1/video-jobs/' + encodeURIComponent(jobId)).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : '无法查询本地成片任务')
        return data
      })
    }).then(function (job) {
      state.videoJob = job
      if (state.page === 'result' && state.resultTab === 'content') renderResult()
      if (job.status === 'queued' || job.status === 'rendering') videoPollTimer = setTimeout(function () { pollVideoJob(job.id) }, 1000)
    }).catch(function (error) {
      state.videoJob = { status: 'failed', error: error.message }
      if (state.page === 'result' && state.resultTab === 'content') renderResult()
    })
  }

  function generateLocalVideo() {
    if (!apiBase()) { toast('请先启动本地服务'); return }
    if (!state.ffmpegAvailable) { toast('本机尚未检测到 FFmpeg'); return }
    const item = state.visit && state.visit.analysis
    if (!item) return
    state.videoJob = { status: 'queued', progress: 0, message: '正在准备本地素材' }; renderResult()
    const mediaPromise = state.visit.rawFile ? Promise.resolve(state.visit.rawFile) : fetch(state.visit.image).then(function (response) { if (!response.ok) throw new Error('无法读取当前现场素材'); return response.blob() })
    const afterPromise = state.checkImage ? fetch(state.checkImage).then(function (response) { return response.blob() }) : Promise.resolve(null)
    Promise.all([mediaPromise, afterPromise]).then(function (values) {
      const data = new FormData(), route = item.routes[state.selectedRoute] || { summary: '', steps: [] }
      data.append('media', values[0], state.visit.mediaType === 'video' ? 'source.mp4' : 'source.jpg')
      if (values[1]) data.append('after_media', values[1], 'after.jpg')
      data.append('template_id', state.videoTemplate)
      data.append('metadata', JSON.stringify({ title: item.name || item.shortName, anomaly: item.anomaly, cause: item.hypotheses && item.hypotheses[0] ? item.hypotheses[0].name : '原因仍待确认', route: routesMeta[state.selectedRoute].name + ' · ' + route.summary, steps: route.steps || [] }))
      return fetch(apiBase() + '/api/v1/video-jobs', { method: 'POST', body: data })
    }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (data) {
        if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : '无法创建本地成片任务')
        return data
      })
    }).then(function (job) { state.videoJob = job; renderResult(); pollVideoJob(job.id) }).catch(function (error) { state.videoJob = { status: 'failed', error: error.message }; renderResult() })
  }

  function addToList(key, value) {
    let list = []
    try { list = JSON.parse(localStorage.getItem(key) || '[]') } catch (_) {}
    if (list.indexOf(value) < 0) list.push(value)
    localStorage.setItem(key, JSON.stringify(list))
  }

  function handleFollowUp(answer) {
    const item = state.visit.analysis
    if (state.visit.mode === 'online' && apiBase()) {
      fetch(apiBase() + '/api/v1/cases/' + encodeURIComponent(item.id) + '/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: item.question, answer: answer }) }).then(function (response) { return response.json().catch(function () { return {} }).then(function (data) { if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : '追问服务返回 ' + response.status); return data }) }).then(function (updated) { state.visit.analysis = Object.assign(item, updated); state.selectedRoute = ''; toast('判断已根据新证据更新'); renderDiagnosis() }).catch(function (error) { toast(error.message) })
      return
    }
    Object.keys(item.routes).forEach(function (key) { item.routes[key].recommended = false })
    if (item.id === 'eyeliner') {
      const key = answer === 'yes' ? 'rescue' : 'transform'; item.routes[key].recommended = true
      item.followUpResult = answer === 'yes' ? '已确认愿意局部擦除，继续推荐“抢救”路线。' : '不愿局部擦除，已将“改造”为优先路线：补齐另一侧风格。'
    } else if (item.id === 'house') {
      const key = answer === 'yes' ? 'rescue' : 'transform'; item.routes[key].recommended = true
      item.followUpResult = answer === 'yes' ? '连接仍可活动，结构尚有校正空间，切换为“抢救”优先。' : '胶体已无法活动，强拆成本较高，保留“改造”为优先路线。'
    } else if (item.id === 'cake') {
      const key = answer === 'yes' ? 'stop' : 'transform'; item.routes[key].recommended = true
      item.followUpResult = answer === 'yes' ? '出现异常气味，食品安全优先，立即切换为“止损”路线。' : '未发现异常气味，但仍需确认保质期与温控；暂保留“改造”路线，不代表已经确认安全。'
    } else {
      item.followUpResult = '答案已记录，当前案例没有本地分支规则，原因仍保持不确定。'
    }
    state.selectedRoute = ''
    toast('判断已根据回答更新'); renderDiagnosis()
  }

  function commentMap() { try { return JSON.parse(localStorage.getItem('museum_seed_comments') || '{}') } catch (_) { return {} } }
  function addComment(postId) {
    const text = prompt('留下会诊意见、相似经历或需要补充的证据：')
    if (!text || !text.trim()) return
    const posts = userPosts(), target = posts.filter(function (post) { return post.id === postId })[0]
    if (target) { target.comments = target.comments || []; target.comments.push({ text: text.trim(), createdAt: new Date().toLocaleString('zh-CN') }); saveUserPosts(posts) }
    else { const map = commentMap(); map[postId] = map[postId] || []; map[postId].push({ text: text.trim(), createdAt: new Date().toLocaleString('zh-CN') }); localStorage.setItem('museum_seed_comments', JSON.stringify(map)) }
    toast('会诊意见已保存'); renderCommunity()
  }

  function submitCommunityPost() {
    if (!state.pendingPostImage) { toast('请选择一张真实现场图片'); return }
    const posts = userPosts()
    posts.unshift({ id: 'post-' + Date.now(), title: document.getElementById('postTitle').value.trim(), hall: document.getElementById('postHall').value, fingerprint: document.getElementById('postFingerprint').value.trim() || '待鉴定', content: document.getElementById('postContent').value.trim(), image: state.pendingPostImage, section: 'new', author: '本地用户', comments: [], createdAt: new Date().toLocaleString('zh-CN') })
    try { saveUserPosts(posts.slice(0, 30)); state.pendingPostImage = ''; state.communityTab = 'new'; toast('已发布到今日新展'); renderCommunity() } catch (_) { toast('浏览器本地空间不足，请选择更小的图片') }
  }

  function submitCuratorApply() {
    const profile = { name: document.getElementById('curatorName').value.trim(), hall: document.getElementById('curatorHall').value, role: document.getElementById('curatorRole').value, expertise: document.getElementById('curatorExpertise').value.trim(), status: 'local_pending', createdAt: new Date().toISOString() }
    localStorage.setItem('museum_curator_profile', JSON.stringify(profile)); toast('申请已保存为本地待审核'); renderCurator()
  }

  function submitCapsule() {
    const list = capsules()
    list.unshift({ id: 'capsule-' + Date.now(), type: document.getElementById('capsuleType').value, title: document.getElementById('capsuleTitle').value.trim(), fingerprint: document.getElementById('capsuleFingerprint').value.trim(), explanation: document.getElementById('capsuleExplanation').value.trim(), steps: document.getElementById('capsuleSteps').value.split('\n').filter(Boolean), boundary: document.getElementById('capsuleBoundary').value.trim(), status: 'local_pending', createdAt: new Date().toLocaleDateString('zh-CN') })
    localStorage.setItem('museum_capsules', JSON.stringify(list)); toast('内容已保存并进入本地待审核'); renderCurator()
  }

  function submitServiceRequest() {
    let requests = []
    try { requests = JSON.parse(localStorage.getItem('museum_service_requests') || '[]') } catch (_) {}
    requests.unshift({ id: 'request-' + Date.now(), caseId: state.visit.analysis.id, city: document.getElementById('serviceCity').value.trim(), need: document.getElementById('serviceNeed').value.trim(), status: '待接入服务方', createdAt: new Date().toISOString() })
    localStorage.setItem('museum_service_requests', JSON.stringify(requests)); toast('服务需求已保存；当前不会发送给虚构商家')
  }

  function publishResult() {
    const item = state.visit.analysis, confirmed = confirm('你是否确认这次抢救或改造已经达到可接受结果？\n“取消”仍可发布，但会进入今日新展而不是抢救成功区。')
    const posts = userPosts()
    posts.unshift({ id: 'result-' + Date.now(), sourceCaseId: item.id || '', title: item.name || item.shortName, content: '完成了“' + routesMeta[state.selectedRoute].name + '”路线：' + item.routes[state.selectedRoute].summary, hall: item.hall || '待分类展馆', image: state.visit.image, section: confirmed ? 'rescued' : 'new', fingerprint: item.shortName || item.anomaly, author: '本地用户', comments: [], createdAt: new Date().toLocaleString('zh-CN') })
    try { saveUserPosts(posts); state.communityTab = confirmed ? 'rescued' : 'new'; go('community'); toast('已发布到博物馆社区') } catch (_) { toast('本地空间不足，发布失败') }
  }

  function generatePoster() {
    const item = state.visit.analysis, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), image = new Image()
    canvas.width = 1080; canvas.height = 1440
    image.onload = function () {
      ctx.fillStyle = '#f2eadc'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      const scale = Math.max(1080 / image.width, 710 / image.height), width = image.width * scale, height = image.height * scale
      ctx.drawImage(image, (1080 - width) / 2, 0, width, height)
      ctx.fillStyle = '#211f1b'; ctx.fillRect(0, 710, 1080, 730)
      ctx.fillStyle = '#df6a48'; ctx.font = '700 28px sans-serif'; ctx.fillText('FAILURE MUSEUM · ' + (item.hall || '馆藏'), 70, 790)
      ctx.fillStyle = '#fffaf2'; ctx.font = '700 55px serif'; wrapCanvasText(ctx, item.name || item.shortName, 70, 895, 930, 75)
      ctx.fillStyle = '#cfc4b5'; ctx.font = '30px sans-serif'; wrapCanvasText(ctx, '异常：' + item.anomaly, 70, 1110, 930, 48)
      ctx.fillStyle = '#df6a48'; ctx.fillText('处理路线 · ' + routesMeta[state.selectedRoute].name, 70, 1320)
      const link = document.createElement('a'); link.download = '翻车博物馆-' + (item.id || Date.now()) + '.png'; link.href = canvas.toDataURL('image/png'); link.click(); toast('分享卡已生成')
    }
    image.onerror = function () { toast('当前媒体无法生成图片分享卡') }
    image.src = state.visit.image
  }
  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    let line = ''
    Array.from(String(text)).forEach(function (char) { const test = line + char; if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, y); line = char; y += lineHeight } else line = test })
    if (line) ctx.fillText(line, x, y)
  }

  app.addEventListener('click', function (event) {
    const pageButton = event.target.closest('[data-page]')
    if (pageButton) {
      if (pageButton.dataset.communityTab) state.communityTab = pageButton.dataset.communityTab
      if (pageButton.dataset.page === 'intake' && state.page !== 'diagnosis') {
        state.visit = null; state.selectedRoute = ''; state.currentStep = 0; state.checkImage = ''; state.verifyResult = null; state.videoJob = null
      }
      go(pageButton.dataset.page); return
    }
    const card = event.target.closest('[data-case]')
    if (card) {
      const item = window.MuseumCases.getCase(card.dataset.case)
      state.visit = { mode: 'builtin', caseId: item.id, image: '..' + item.image, description: item.shortName, target: item.target, constraints: '', analysis: JSON.parse(JSON.stringify(item)) }
      state.selectedRoute = ''; state.currentStep = 0; state.checkImage = ''; state.verifyResult = null; state.videoJob = null
      go('intake'); return
    }
    const hall = event.target.closest('[data-hall]')
    if (hall) { state.hallId = hall.dataset.hall; go('halls'); return }
    const scroller = event.target.closest('[data-scroll]')
    if (scroller) { document.getElementById(scroller.dataset.scroll).scrollIntoView({ behavior: 'smooth' }); return }
    const tab = event.target.closest('[data-tab]')
    if (tab) { state.matchTab = Number(tab.dataset.tab); renderDiagnosis(); return }
    const answer = event.target.closest('[data-answer]')
    if (answer) { handleFollowUp(answer.dataset.answer); return }
    const route = event.target.closest('[data-route]')
    if (route) { state.selectedRoute = route.dataset.route; renderAction(); return }
    const resultTab = event.target.closest('[data-result-tab]')
    if (resultTab) { state.resultTab = resultTab.dataset.resultTab; renderResult(); return }
    const template = event.target.closest('[data-template]')
    if (template) { state.contentTemplate = template.dataset.template; renderResult(); return }
    const communityTab = event.target.closest('[data-community-tab]')
    if (communityTab) { state.communityTab = communityTab.dataset.communityTab; renderCommunity(); return }
    const tool = event.target.closest('[data-tool]')
    if (tool) { addToList('museum_tool_list', tool.dataset.tool); toast('已加入采购清单'); return }
    const alliance = event.target.closest('[data-alliance]')
    if (alliance) { addToList('museum_alliances', alliance.dataset.alliance); toast('已加入“' + alliance.dataset.alliance + '”联盟'); return }
    const commenter = event.target.closest('[data-comment]')
    if (commenter) { addComment(commenter.dataset.comment); return }
    const action = event.target.closest('[data-action]')
    if (action) handleAction(action.dataset.action)
    const deleter = event.target.closest('[data-delete]')
    if (deleter && confirm('确定将这件记录移出本地馆藏吗？')) { localStorage.setItem('museum_collections_web', JSON.stringify(collections().filter(function (item) { return item.recordId !== deleter.dataset.delete }))); renderCollection() }
  })

  app.addEventListener('change', function (event) {
    if (event.target.id === 'videoTemplate') { state.videoTemplate = event.target.value; state.videoJob = null; renderResult(); return }
    if (event.target.id === 'imageInput' && event.target.files[0]) {
      const file = event.target.files[0]
      if (file.type.indexOf('video/') === 0) {
        state.visit = { mode: 'local', image: URL.createObjectURL(file), rawFile: file, mediaType: 'video', description: '', target: '', constraints: '' }
        state.selectedRoute = ''; state.currentStep = 0; state.checkImage = ''; state.verifyResult = null; state.videoJob = null; renderIntake()
      } else resizeImage(file).then(function (image) { state.visit = { mode: 'local', image: image, mediaType: 'image', description: '', target: '', constraints: '' }; state.selectedRoute = ''; state.currentStep = 0; state.checkImage = ''; state.verifyResult = null; state.videoJob = null; renderIntake() }).catch(function (error) { toast(error.message) })
    }
    if (event.target.id === 'targetInput' && event.target.files[0]) resizeImage(event.target.files[0]).then(function (image) { if (!state.visit) state.visit = { mode: 'local', image: '', description: '', target: '', constraints: '' }; state.visit.targetImage = image; renderIntake() }).catch(function (error) { toast(error.message) })
    if (event.target.id === 'postImage' && event.target.files[0]) resizeImage(event.target.files[0]).then(function (image) { state.pendingPostImage = image; toast('社区图片已选择') }).catch(function (error) { toast(error.message) })
    if (event.target.id === 'checkInput' && event.target.files[0]) {
      resizeImage(event.target.files[0]).then(function (image) { state.checkImage = image; state.verifyResult = null; renderCoach() }).catch(function (error) { toast(error.message) })
    }
  })

  app.addEventListener('submit', function (event) {
    event.preventDefault()
    if (event.target.id === 'hallSearch') { state.hallQuery = document.getElementById('hallQuery').value.trim(); renderHalls(); return }
    if (event.target.id === 'communityForm') { submitCommunityPost(); return }
    if (event.target.id === 'curatorApply') { submitCuratorApply(); return }
    if (event.target.id === 'capsuleForm') { submitCapsule(); return }
    if (event.target.id === 'serviceForm') { submitServiceRequest(); return }
    if (event.target.id !== 'intakeForm') return
    if (!state.visit || !state.visit.image) { toast('请先选择一张翻车现场图片'); return }
    const form = { description: document.getElementById('description').value.trim(), target: document.getElementById('target').value.trim(), constraints: document.getElementById('constraints').value.trim(), sourceUrl: document.getElementById('sourceUrl').value.trim(), sourceTime: document.getElementById('sourceTime').value.trim() }
    Object.assign(state.visit, form)
    if (state.visit.mode === 'builtin') { go('diagnosis'); return }
    if (!apiBase()) { state.visit.mode = 'pending'; go('diagnosis'); return }
    const button = event.target.querySelector('button[type=submit]'); button.disabled = true; button.innerHTML = '<i class="loader"></i> 正在分析真实图片…'
    analyzeOnline(form).then(function (analysis) { state.visit.mode = 'online'; state.visit.analysis = analysis; state.douyinResults = []; state.douyinError = ''; state.douyinKeyword = ''; go('diagnosis'); searchDouyin(analysis) }).catch(function (error) { toast(error.message === 'NO_API' ? '尚未配置分析服务' : error.message); button.disabled = false; button.textContent = '送往 AI 鉴定室' })
  })

  function handleAction(action) {
    if (action === 'roadmap') toast('该展馆已纳入后续知识库计划')
    if (action === 'settings') {
      const value = prompt('分析服务地址（例如 http://127.0.0.1:8000）\n留空时馆藏案例仍可完整体验，自选图片进入待分析：', apiBase())
      if (value !== null) { localStorage.setItem('museum_api_base', value.trim().replace(/\/$/, '')); toast(value.trim() ? '已保存分析服务地址' : '已切换为本地馆藏模式'); render() }
    }
    if (action === 'prev-step' && state.currentStep > 0) { state.currentStep--; state.checkImage = ''; state.verifyResult = null; renderCoach() }
    if (action === 'next-step') {
      state.currentStep++
      const complete = state.currentStep >= state.visit.analysis.routes[state.selectedRoute].steps.length
      state.checkImage = ''
      if (!complete) state.verifyResult = null
      state.page = complete ? 'result' : 'coach'; render()
    }
    if (action === 'verify') {
      if (!state.checkImage) { toast('请先拍摄或选择当前状态'); return }
      if (!apiBase()) { state.verifyResult = { offline: true, title: '等待人工确认', message: '复拍已完成，但未配置视觉验证服务。系统不会伪造 AI 通过结果。' }; renderCoach(); return }
      const base = apiBase(), data = new FormData()
      fetch(state.checkImage).then(function (r) { return r.blob() }).then(function (blob) { data.append('image', blob, 'check.jpg'); data.append('step', String(state.currentStep)); return fetch(base + '/api/v1/cases/' + encodeURIComponent(state.visit.analysis.id) + '/verify', { method: 'POST', body: data }) }).then(function (response) { return response.json().catch(function () { return {} }).then(function (data) { if (!response.ok) throw new Error(data.error && data.error.message ? data.error.message : '验证服务返回 ' + response.status); return data }) }).then(function (result) { state.verifyResult = result; renderCoach() }).catch(function (error) { toast(error.message) })
    }
    if (action === 'archive') {
      const item = state.visit.analysis, now = new Date(), records = collections()
      records.unshift({ recordId: 'web-' + Date.now(), caseId: item.id || '', name: item.name || item.shortName || '未命名展品', hall: item.hall || '待分类展馆', image: state.visit.image, routeName: routesMeta[state.selectedRoute].name, verified: Boolean(state.verifyResult && !state.verifyResult.offline), createdAt: now.toLocaleDateString('zh-CN') })
      try { localStorage.setItem('museum_collections_web', JSON.stringify(records.slice(0, 20))); state.currentStep = 0; state.selectedRoute = ''; state.checkImage = ''; go('collection'); toast('已收入本地馆藏') } catch (_) { toast('图片较大，本地存储空间不足') }
    }
    if (action === 'publish-result') publishResult()
    if (action === 'poster') generatePoster()
    if (action === 'generate-local-video') generateLocalVideo()
    if (action === 'copy-script') {
      const script = buildContent(state.visit.analysis, state.contentTemplate)
      navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(script).then(function () { toast('脚本已复制') }) : toast('当前浏览器不支持自动复制，请手动选择文本')
    }
    if (action === 'save-course') { addToList('museum_course_list', (platform.serviceCatalog[platform.hallByCase[state.visit.analysis.id]] || {}).course || '待补课程'); toast('已保存到学习清单') }
    if (action === 'voice') startVoiceInput()
  }

  function startVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) { toast('当前浏览器不支持语音识别，请使用文字输入'); return }
    const recognition = new Recognition(); recognition.lang = 'zh-CN'; recognition.interimResults = false
    const button = document.querySelector('[data-action="voice"]'); if (button) button.textContent = '正在聆听…'
    recognition.onresult = function (event) { const textarea = document.getElementById('description'); textarea.value = (textarea.value + ' ' + event.results[0][0].transcript).trim(); toast('语音描述已写入') }
    recognition.onerror = function () { toast('语音识别失败或未获得麦克风权限') }
    recognition.onend = function () { if (button) button.textContent = '◉ 语音描述' }
    recognition.start()
  }

  let regionDrag = null
  app.addEventListener('pointerdown', function (event) {
    const stage = event.target.closest('#regionStage')
    if (!stage) return
    event.preventDefault(); const rect = stage.getBoundingClientRect(); const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left)); const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    regionDrag = { stage: stage, rect: rect, startX: x, startY: y }; stage.setPointerCapture && stage.setPointerCapture(event.pointerId)
  })
  app.addEventListener('pointermove', function (event) {
    if (!regionDrag) return
    const x = Math.max(0, Math.min(regionDrag.rect.width, event.clientX - regionDrag.rect.left)), y = Math.max(0, Math.min(regionDrag.rect.height, event.clientY - regionDrag.rect.top))
    const left = Math.min(regionDrag.startX, x), top = Math.min(regionDrag.startY, y), width = Math.abs(x - regionDrag.startX), height = Math.abs(y - regionDrag.startY), box = document.getElementById('regionBox')
    if (box) { box.style.display = 'block'; box.style.left = left + 'px'; box.style.top = top + 'px'; box.style.width = width + 'px'; box.style.height = height + 'px' }
  })
  app.addEventListener('pointerup', function (event) {
    if (!regionDrag) return
    const x = Math.max(0, Math.min(regionDrag.rect.width, event.clientX - regionDrag.rect.left)), y = Math.max(0, Math.min(regionDrag.rect.height, event.clientY - regionDrag.rect.top)), left = Math.min(regionDrag.startX, x), top = Math.min(regionDrag.startY, y), width = Math.abs(x - regionDrag.startX), height = Math.abs(y - regionDrag.startY)
    if (width > 8 && height > 8) state.visit.region = { x: +(left / regionDrag.rect.width * 100).toFixed(2), y: +(top / regionDrag.rect.height * 100).toFixed(2), width: +(width / regionDrag.rect.width * 100).toFixed(2), height: +(height / regionDrag.rect.height * 100).toFixed(2) }
    regionDrag = null
  })

  window.addEventListener('popstate', function () { state.page = location.hash.slice(1) || 'home'; render() })
  state.page = location.hash.slice(1) || 'home'
  const previewParams = new URLSearchParams(location.search)
  if (['archive', 'report', 'content', 'service'].indexOf(previewParams.get('tab')) >= 0) state.resultTab = previewParams.get('tab')
  if (previewParams.get('case')) {
    const previewCase = window.MuseumCases.getCase(previewParams.get('case'))
    if (previewCase) {
      state.visit = { mode: 'builtin', caseId: previewCase.id, image: '..' + previewCase.image, description: previewCase.shortName, target: previewCase.target, constraints: '', analysis: JSON.parse(JSON.stringify(previewCase)) }
      state.selectedRoute = previewParams.get('route') || Object.keys(previewCase.routes).filter(function (key) { return previewCase.routes[key].recommended })[0] || 'rescue'
      if (previewParams.get('step')) state.currentStep = Math.max(0, Number(previewParams.get('step')) || 0)
    }
  }
  render()
  if (!localStorage.getItem('museum_api_base')) {
    fetch('/api/v1/health').then(function (response) { if (!response.ok) throw new Error('no backend'); return response.json() }).then(function (health) {
      state.backendReady = Boolean(health.ok); state.arkConfigured = Boolean(health.arkConfigured); state.redfoxConfigured = Boolean(health.redfoxConfigured); state.ffmpegAvailable = Boolean(health.ffmpegAvailable); state.arkModel = health.model || ''
      if (state.page === 'intake') renderIntake()
    }).catch(function () { state.backendReady = false })
  }
})()
