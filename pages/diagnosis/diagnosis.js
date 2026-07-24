const cases = require('../../data/cases')
const visit = require('../../utils/visit')

Page({
  data: { pending: false, item: null, imagePath: '', answered: false, matchesTab: 0, tabs: ['长得最像', '经历最像', '最值得参考'] },
  onLoad() {
    const current = visit.getVisit()
    if (!current) { tt.redirectTo({ url: '/pages/home/home' }); return }
    if (current.mode === 'pending') { this.setData({ pending: true, imagePath: current.imagePath }); return }
    if (current.mode === 'builtin') { this.setData({ item: cases.getCase(current.caseId), imagePath: current.imagePath }); return }
    this.setData({ item: this.normalizeOnline(current.analysis), imagePath: current.imagePath })
  },
  normalizeOnline(result) {
    result = result || {}
    result.matches = Array.isArray(result.matches) ? result.matches : []
    result.hypotheses = Array.isArray(result.hypotheses) ? result.hypotheses : []
    result.evidence = Array.isArray(result.evidence) ? result.evidence : []
    return result
  },
  selectTab(event) { this.setData({ matchesTab: Number(event.currentTarget.dataset.index) }) },
  answerQuestion(event) {
    this.setData({ answered: true, answer: event.currentTarget.dataset.answer })
    tt.showToast({ title: '已记录，将用于更新判断', icon: 'none' })
  },
  chooseAction() { tt.navigateTo({ url: '/pages/action/action' }) },
  goBack() { tt.navigateBack() }
})
