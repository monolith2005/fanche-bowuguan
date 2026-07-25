(function (root) {
  'use strict'

  const state = { status: 'loading', configured: false, client: null, user: null, email: '', otpSent: false, syncing: false, progress: '', error: '', lastSyncedAt: '' }

  function publicState() {
    return { status: state.status, configured: state.configured, user: state.user ? { id: state.user.id, email: state.user.email } : null, email: state.email, otpSent: state.otpSent, syncing: state.syncing, progress: state.progress, error: state.error, lastSyncedAt: state.lastSyncedAt }
  }
  function emit() { root.dispatchEvent(new CustomEvent('museum:cloud-state', { detail: publicState() })) }
  function fail(error) { state.error = error && error.message ? error.message : String(error || '云端服务错误'); state.syncing = false; emit(); throw error }
  function safeSegment(value) { return String(value || 'record').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 90) || 'record' }
  function extensionFor(blob, fallback) {
    const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }
    return map[blob.type] || fallback || 'bin'
  }
  async function mediaBlob(value) {
    if (!value || String(value).startsWith('blob:')) return null
    const response = await fetch(value)
    if (!response.ok) throw new Error('无法读取待同步媒体：' + response.status)
    return response.blob()
  }
  async function digest(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(hash)).map(function (byte) { return byte.toString(16).padStart(2, '0') }).join('')
  }
  async function signed(bucket, path) {
    if (!path) return ''
    const result = await state.client.storage.from(bucket).createSignedUrl(path, 3600)
    if (result.error) throw result.error
    return result.data.signedUrl
  }
  async function upload(bucket, path, value) {
    const blob = await mediaBlob(value)
    if (!blob) return ''
    const result = await state.client.storage.from(bucket).upload(path + '.' + extensionFor(blob), blob, { upsert: true, contentType: blob.type, cacheControl: '3600' })
    if (result.error) throw result.error
    return result.data.path
  }

  async function init() {
    try {
      const preset = root.MUSEUM_CLOUD_CONFIG || null
      const response = preset ? null : await fetch('/api/v1/cloud-config')
      const config = preset || (response && response.ok ? await response.json() : {})
      if (!config || !config.configured || !config.url || !config.anonKey) {
        state.status = 'unconfigured'; state.configured = false; emit(); return publicState()
      }
      state.configured = true; state.status = 'connecting'
      const sdk = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
      state.client = sdk.createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
      state.client.auth.onAuthStateChange(function (_event, session) {
        state.user = session && session.user || null; state.status = state.user ? 'authenticated' : 'anonymous'; state.error = ''; emit()
      })
      const sessionResult = await state.client.auth.getSession()
      if (sessionResult.error) throw sessionResult.error
      state.user = sessionResult.data.session && sessionResult.data.session.user || null
      state.status = state.user ? 'authenticated' : 'anonymous'; emit(); return publicState()
    } catch (error) {
      state.status = 'unavailable'; state.error = error.message || String(error); emit(); return publicState()
    }
  }

  async function sendOtp(email) {
    if (!state.client) throw new Error('云端工作区尚未配置')
    state.email = String(email || '').trim().toLowerCase(); state.error = ''
    if (!/^\S+@\S+\.\S+$/.test(state.email)) throw new Error('请输入有效邮箱地址')
    const result = await state.client.auth.signInWithOtp({ email: state.email, options: { shouldCreateUser: true } })
    if (result.error) return fail(result.error)
    state.otpSent = true; state.status = 'otp-sent'; emit(); return publicState()
  }
  async function verifyOtp(token) {
    if (!state.client || !state.email) throw new Error('请先发送邮箱验证码')
    const code = String(token || '').replace(/\D/g, '')
    if (code.length !== 6) throw new Error('请输入六位邮箱验证码')
    const result = await state.client.auth.verifyOtp({ email: state.email, token: code, type: 'email' })
    if (result.error) return fail(result.error)
    state.user = result.data.user; state.otpSent = false; state.status = 'authenticated'; emit(); return publicState()
  }
  async function signOut() {
    if (!state.client) return
    const result = await state.client.auth.signOut({ scope: 'local' })
    if (result.error) return fail(result.error)
    state.user = null; state.status = 'anonymous'; state.otpSent = false; emit()
  }

  async function syncRecord(record, index, total) {
    const owner = state.user.id, clientId = safeSegment(record.recordId), prefix = owner + '/' + clientId
    state.progress = '正在同步 ' + (index + 1) + ' / ' + total + '：' + (record.name || '未命名展品'); emit()
    const sourcePath = await upload('case-media', prefix + '/source', record.image)
    const artifactPath = await upload('artifact-media', prefix + '/artifact', record.artifactImage)
    const contentHash = await digest({ caseId: record.caseId || '', name: record.name, hallId: record.hallId, anomaly: record.anomaly, image: String(record.image || '') })
    const caseRow = {
      owner_id: owner, client_record_id: record.recordId, source_kind: String(record.image || '').startsWith('data:video') ? 'video' : 'image',
      source_object_path: sourcePath || null, target_object_path: null, entry_hall_id: record.entryHallId || null,
      suggested_hall_id: record.suggestedHallId || record.hallId, final_hall_id: record.hallId,
      classification_reason: record.classificationReason || '', analysis_json: record.analysis || {}, status: 'archived', content_hash: contentHash
    }
    const duplicateResult = await state.client.from('cases').select('id').eq('owner_id', owner).eq('content_hash', contentHash).maybeSingle()
    if (duplicateResult.error) throw duplicateResult.error
    let caseId = duplicateResult.data && duplicateResult.data.id
    if (!caseId) {
      const caseResult = await state.client.from('cases').upsert(caseRow, { onConflict: 'owner_id,client_record_id' }).select('id').single()
      if (caseResult.error) throw caseResult.error
      caseId = caseResult.data.id
    }
    const artifactResult = await state.client.from('artifacts').upsert({ case_id: caseId, owner_id: owner, object_path: artifactPath || null, model: record.artifactModel || '', prompt_version: 'pixel-artifact-v1', status: artifactPath ? 'ready' : 'failed', error_code: artifactPath ? null : 'LOCAL_FALLBACK_ONLY' }, { onConflict: 'case_id' })
    if (artifactResult.error) throw artifactResult.error
    const publishedAt = record.published ? new Date().toISOString() : null
    const collectionResult = await state.client.from('collections').upsert({ case_id: caseId, owner_id: owner, hall_id: record.hallId, route_name: record.routeName || '', verified: Boolean(record.verified), published_at: publishedAt, archived_at: new Date().toISOString() }, { onConflict: 'case_id' }).select('id').single()
    if (collectionResult.error) throw collectionResult.error
    if (record.published) {
      const postResult = await state.client.from('community_posts').upsert({ collection_id: collectionResult.data.id, owner_id: owner, content_json: { title: record.name || '未命名展品', hall_id: record.hallId, anomaly: record.anomaly || '', route_name: record.routeName || '' }, published_at: publishedAt, withdrawn_at: null }, { onConflict: 'collection_id' })
      if (postResult.error) throw postResult.error
    } else {
      const withdrawResult = await state.client.from('community_posts').update({ withdrawn_at: new Date().toISOString() }).eq('collection_id', collectionResult.data.id)
      if (withdrawResult.error) throw withdrawResult.error
    }
  }

  async function syncLocal(records) {
    if (!state.user) throw new Error('请先登录后再同步')
    const list = Array.isArray(records) ? records : []
    state.syncing = true; state.error = ''; state.progress = list.length ? '准备同步…' : '本地没有待同步馆藏'; emit()
    try {
      for (let index = 0; index < list.length; index++) await syncRecord(list[index], index, list.length)
      state.syncing = false; state.lastSyncedAt = new Date().toLocaleString('zh-CN'); state.progress = '同步完成：' + list.length + ' 件馆藏'; emit(); return { count: list.length }
    } catch (error) { return fail(error) }
  }

  async function pullCloud() {
    if (!state.user) throw new Error('请先登录后再读取云端馆藏')
    state.syncing = true; state.progress = '正在读取云端馆藏…'; state.error = ''; emit()
    try {
      const result = await state.client.from('collections').select('id,hall_id,route_name,verified,published_at,archived_at,case:cases(id,client_record_id,source_object_path,suggested_hall_id,classification_reason,analysis_json),artifact:artifacts(id,object_path,model,status)').order('archived_at', { ascending: false })
      if (result.error) throw result.error
      const records = []
      for (const row of result.data || []) {
        const caseRow = row.case || {}, artifactRow = Array.isArray(row.artifact) ? row.artifact[0] : row.artifact || {}, analysis = caseRow.analysis_json || {}
        const finalHall = root.MuseumPlatform && root.MuseumPlatform.halls.filter(function (hall) { return hall.id === row.hall_id })[0]
        const suggestedHall = root.MuseumPlatform && root.MuseumPlatform.halls.filter(function (hall) { return hall.id === caseRow.suggested_hall_id })[0]
        records.push({
          recordId: caseRow.client_record_id || 'cloud-' + row.id, caseId: caseRow.id || '', name: analysis.name || analysis.shortName || '未命名展品', hallId: row.hall_id,
          hall: finalHall ? finalHall.name : row.hall_id, suggestedHallId: caseRow.suggested_hall_id || '', suggestedHallName: suggestedHall ? suggestedHall.name : analysis.hall || '', classificationReason: caseRow.classification_reason || '',
          image: await signed('case-media', caseRow.source_object_path), artifactId: artifactRow.id || '', artifactImage: artifactRow.object_path ? await signed('artifact-media', artifactRow.object_path) : '', artifactModel: artifactRow.model || '',
          anomaly: analysis.anomaly || '', analysis: analysis, routeName: row.route_name || '', verified: Boolean(row.verified), published: Boolean(row.published_at), createdAt: new Date(row.archived_at).toLocaleDateString('zh-CN'), cloud: true
        })
      }
      state.syncing = false; state.lastSyncedAt = new Date().toLocaleString('zh-CN'); state.progress = '已读取 ' + records.length + ' 件云端馆藏'; emit(); return records
    } catch (error) { return fail(error) }
  }

  root.MuseumCloud = { init: init, getState: publicState, sendOtp: sendOtp, verifyOtp: verifyOtp, signOut: signOut, syncLocal: syncLocal, pullCloud: pullCloud }
  init()
})(window)
