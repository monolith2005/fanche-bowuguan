const cases = require('../../data/cases')
const visit = require('../../utils/visit')

Page({
  data: { item: null, selected: '', routeList: [] },
  onLoad() {
    const current = visit.getVisit()
    if (!current || current.mode === 'pending') { tt.redirectTo({ url: '/pages/home/home' }); return }
    const item = current.mode === 'builtin' ? cases.getCase(current.caseId) : current.analysis
    const meta = [
      { key: 'rescue', name: '抢救', icon: '↗', desc: '尽量恢复目标结果' },
      { key: 'transform', name: '改造', icon: '✦', desc: '换一个可接受的终点' },
      { key: 'restart', name: '重开', icon: '↻', desc: '总结错误后重新开始' },
      { key: 'stop', name: '止损', icon: '■', desc: '安全优先，停止操作' }
    ]
    const list = meta.map(function(entry) { const detail = item.routes[entry.key] || {}; return Object.assign({}, entry, detail) })
    const recommended = list.filter(function(route) { return route.recommended })[0] || list[0]
    this.setData({ item: item, routeList: list, selected: recommended.key })
  },
  selectRoute(event) { this.setData({ selected: event.currentTarget.dataset.key }) },
  startCoach() {
    const current = visit.getVisit(); current.selectedRoute = this.data.selected; visit.setVisit(current)
    tt.navigateTo({ url: '/pages/coach/coach' })
  }
})
