function setVisit(data) { getApp().globalData.currentVisit = data; return data }
function getVisit() { return getApp().globalData.currentVisit }
module.exports = { setVisit: setVisit, getVisit: getVisit }
