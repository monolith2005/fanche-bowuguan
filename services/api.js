const config = require('../config')

function configured() { return Boolean(config.apiBaseUrl) }

function parseUploadResponse(raw) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (error) { throw new Error('服务返回了无法解析的数据') }
  }
  return raw
}

function analyze(params) {
  return new Promise(function(resolve, reject) {
    if (!configured()) {
      reject(new Error('ANALYSIS_SERVICE_NOT_CONFIGURED'))
      return
    }
    tt.uploadFile({
      url: config.apiBaseUrl + '/api/' + config.apiVersion + '/cases/analyze',
      filePath: params.imagePath,
      name: 'image',
      formData: {
        description: params.description || '',
        target: params.target || '',
        constraints: params.constraints || ''
      },
      success: function(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('分析服务请求失败（' + response.statusCode + '）'))
          return
        }
        try { resolve(parseUploadResponse(response.data)) } catch (error) { reject(error) }
      },
      fail: function(error) { reject(new Error(error.errMsg || '图片上传失败')) }
    })
  })
}

function verify(params) {
  return new Promise(function(resolve, reject) {
    if (!configured()) { reject(new Error('ANALYSIS_SERVICE_NOT_CONFIGURED')); return }
    tt.uploadFile({
      url: config.apiBaseUrl + '/api/' + config.apiVersion + '/cases/' + params.caseId + '/verify',
      filePath: params.imagePath,
      name: 'image',
      formData: { step: String(params.step) },
      success: function(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve(parseUploadResponse(response.data)) } catch (error) { reject(error) }
        } else { reject(new Error('验证服务请求失败')) }
      },
      fail: function(error) { reject(new Error(error.errMsg || '验证图片上传失败')) }
    })
  })
}

module.exports = { configured: configured, analyze: analyze, verify: verify }
