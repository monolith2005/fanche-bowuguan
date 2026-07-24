const config = require('./config')

App({
  globalData: {
    apiBaseUrl: config.apiBaseUrl,
    currentVisit: null
  },
  onLaunch() {
    const collections = tt.getStorageSync('museum_collections')
    if (!Array.isArray(collections)) {
      tt.setStorageSync('museum_collections', [])
    }
  }
})
