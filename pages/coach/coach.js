const cases = require('../../data/cases')
const api = require('../../services/api')
const visit = require('../../utils/visit')
const storage = require('../../utils/storage')

Page({
  data: { item: null, route: null, routeKey: '', currentStep: 0, checkImage: '', verifying: false, verifyResult: null, serviceReady: api.configured(), finished: false },
  onLoad() {
    const current = visit.getVisit()
    if (!current || !current.selectedRoute) { tt.redirectTo({ url: '/pages/home/home' }); return }
    const item = current.mode === 'builtin' ? cases.getCase(current.caseId) : current.analysis
    this.setData({ item: item, route: item.routes[current.selectedRoute], routeKey: current.selectedRoute })
  },
  takeCheckPhoto() {
    const self = this
    tt.chooseImage({ count: 1, sourceType: ['camera', 'album'], success(result) { self.setData({ checkImage: result.tempFilePaths[0], verifyResult: null }) } })
  },
  verify() {
    if (!this.data.checkImage) { tt.showToast({ title: '请先拍摄当前状态', icon: 'none' }); return }
    if (!api.configured()) {
      this.setData({ verifyResult: { offline: true, title: '等待人工确认', message: '复拍已完成，但未配置视觉验证服务。请自行对照步骤确认；系统不会伪造 AI 通过结果。' } })
      return
    }
    const self = this
    this.setData({ verifying: true })
    api.verify({ caseId: this.data.item.id, imagePath: this.data.checkImage, step: this.data.currentStep }).then(function(result) {
      self.setData({ verifyResult: result })
    }).catch(function(error) { tt.showModal({ title: '验证失败', content: error.message, showCancel: false }) }).then(function() { self.setData({ verifying: false }) })
  },
  nextStep() {
    const next = this.data.currentStep + 1
    if (next >= this.data.route.steps.length) { this.setData({ finished: true }); return }
    this.setData({ currentStep: next, checkImage: '', verifyResult: null })
  },
  finish() {
    const current = visit.getVisit()
    const now = new Date()
    const self = this
    function saveRecord(imagePath) {
      const record = {
        recordId: 'record-' + now.getTime(),
        caseId: self.data.item.id || '',
        name: self.data.item.name || self.data.item.shortName || '未命名展品',
        hall: self.data.item.hall || '待分类展馆',
        image: imagePath,
        routeKey: self.data.routeKey,
        routeName: ({ rescue: '抢救', transform: '改造', restart: '重开', stop: '止损' })[self.data.routeKey],
        result: '用户完成步骤并主动归档',
        verified: Boolean(self.data.verifyResult && !self.data.verifyResult.offline),
        createdAt: now.getFullYear() + '-' + twoDigits(now.getMonth() + 1) + '-' + twoDigits(now.getDate())
      }
      storage.save(record)
      tt.showToast({ title: '已收入我的馆藏', icon: 'success' })
      setTimeout(function() { tt.switchTab({ url: '/pages/collection/collection' }) }, 650)
    }
    if (current.imagePath.indexOf('/assets/') === 0) { saveRecord(current.imagePath); return }
    tt.saveFile({
      tempFilePath: current.imagePath,
      success(result) { saveRecord(result.savedFilePath) },
      fail() {
        tt.showModal({ title: '图片无法长期保存', content: '馆藏文字可以保存，但这张临时图片可能在稍后失效。是否仍然归档？', success(result) { if (result.confirm) saveRecord(current.imagePath) } })
      }
    })
  }
})

function twoDigits(value) { return value < 10 ? '0' + value : String(value) }
