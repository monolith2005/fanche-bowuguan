const KEY = 'museum_collections'

function list() { const value = tt.getStorageSync(KEY); return Array.isArray(value) ? value : [] }
function save(item) {
  const current = list()
  const next = [item].concat(current.filter(function(entry) { return entry.recordId !== item.recordId }))
  tt.setStorageSync(KEY, next.slice(0, 50))
  return next
}
function remove(recordId) {
  const current = list()
  const target = current.filter(function(item) { return item.recordId === recordId })[0]
  const next = current.filter(function(item) { return item.recordId !== recordId })
  tt.setStorageSync(KEY, next)
  if (target && target.image && target.image.indexOf('ttfile://') === 0 && tt.removeSavedFile) {
    tt.removeSavedFile({ filePath: target.image })
  }
  return next
}
module.exports = { list: list, save: save, remove: remove }
