const caseData = require('../../data/cases')

Page({
  data: {
    cases: caseData.cases,
    halls: [
      { name: '厨房事故馆', icon: '◒', desc: '成品异常 · 食品安全' },
      { name: '变美事故馆', icon: '〽', desc: '妆容差异 · 实时修复' },
      { name: '手作事故馆', icon: '⌂', desc: '结构失败 · 改造重生' },
      { name: '家居改造馆', icon: '◇', desc: '色差气泡 · 组装错误' },
      { name: '植物急救馆', icon: '♧', desc: '黄叶萎蔫 · 状态诊断' },
      { name: '拍摄翻车馆', icon: '◉', desc: '光线构图 · 运镜失败' }
    ]
  },
  startIntake() { tt.navigateTo({ url: '/pages/intake/intake' }) },
  openCase(event) { tt.navigateTo({ url: '/pages/intake/intake?caseId=' + event.currentTarget.dataset.id }) },
  showRoadmap() { tt.showToast({ title: '该展馆已纳入后续知识库计划', icon: 'none' }) }
})
