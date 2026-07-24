const cases = require('../../data/cases')
const api = require('../../services/api')
const visit = require('../../utils/visit')

Page({
  data: { imagePath: '', caseId: '', builtin: false, description: '', target: '', constraints: '', loading: false, serviceReady: api.configured() },
  onLoad(options) {
    if (options.caseId) {
      const item = cases.getCase(options.caseId)
      if (item) this.setData({ imagePath: item.image, caseId: item.id, builtin: true, description: item.shortName, target: item.target })
    }
  },
  chooseImage() {
    const self = this
    tt.chooseImage({ count: 1, sourceType: ['album', 'camera'], success(result) { self.setData({ imagePath: result.tempFilePaths[0], caseId: '', builtin: false }) } })
  },
  onDescription(event) { this.setData({ description: event.detail.value }) },
  onTarget(event) { this.setData({ target: event.detail.value }) },
  onConstraints(event) { this.setData({ constraints: event.detail.value }) },
  analyze() {
    if (!this.data.imagePath) { tt.showToast({ title: '请先拍摄或选择图片', icon: 'none' }); return }
    if (this.data.builtin) {
      visit.setVisit({ mode: 'builtin', caseId: this.data.caseId, imagePath: this.data.imagePath, description: this.data.description, target: this.data.target, constraints: this.data.constraints })
      tt.navigateTo({ url: '/pages/diagnosis/diagnosis' })
      return
    }
    if (!api.configured()) {
      visit.setVisit({ mode: 'pending', imagePath: this.data.imagePath, description: this.data.description, target: this.data.target, constraints: this.data.constraints })
      tt.showModal({ title: '分析服务尚未配置', content: '图片已在本机选取，但不会套用内置案例冒充分析。请先配置后端；你仍可查看待分析记录。', confirmText: '查看状态', success(result) { if (result.confirm) tt.navigateTo({ url: '/pages/diagnosis/diagnosis' }) } })
      return
    }
    const self = this
    this.setData({ loading: true })
    api.analyze(this.data).then(function(result) {
      visit.setVisit({ mode: 'online', imagePath: self.data.imagePath, analysis: result })
      tt.navigateTo({ url: '/pages/diagnosis/diagnosis' })
    }).catch(function(error) { tt.showModal({ title: '分析失败', content: error.message || '请稍后重试', showCancel: false }) }).then(function() { self.setData({ loading: false }) })
  }
})
