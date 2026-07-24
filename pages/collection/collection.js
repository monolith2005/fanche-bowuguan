const storage = require('../../utils/storage')

Page({
  data: { collections: [] },
  onShow() { this.load() },
  onPullDownRefresh() { this.load(); tt.stopPullDownRefresh() },
  load() { this.setData({ collections: storage.list() }) },
  remove(event) {
    const self = this; const id = event.currentTarget.dataset.id
    tt.showModal({ title: '移出馆藏？', content: '只删除本机的这条记录，原图片不会被删除。', success(result) { if (result.confirm) self.setData({ collections: storage.remove(id) }) } })
  },
  create() { tt.navigateTo({ url: '/pages/intake/intake' }) },
  onShareAppMessage() { return { title: '翻车不是终点，来翻车博物馆看看', path: '/pages/home/home' } }
})
