import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useMihomoStore = defineStore('mihomo', () => {
  // State
  const isConnected = ref(false)
  const apiUrl = ref('')
  const secret = ref('')
  const mihomoConfig = ref(null)
  const mihomoVersion = ref('')
  const loading = ref(false)
  const error = ref(null)
  
  // FTP State
  const ftpConnected = ref(false)
  const ftpConfig = ref({
    host: '',
    port: 21,
    user: '',
    password: '',
    configPath: ''
  })

  // Getters
  const connectionStatus = computed(() => {
    if (loading.value) return 'connecting'
    if (isConnected.value) return 'connected'
    return 'disconnected'
  })

  // Actions
  const connect = async (url, secretKey = '') => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/mihomo/connect', {
        apiUrl: url,
        secret: secretKey
      })
      
      if (response.success) {
        isConnected.value = true
        apiUrl.value = url
        secret.value = secretKey
        mihomoVersion.value = response.version || ''
        
        // Persist connection info to localStorage
        localStorage.setItem('mihomo_apiUrl', url)
        localStorage.setItem('mihomo_secret', secretKey)
        
        return { success: true }
      } else {
        throw new Error(response.error || '连接失败')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || '连接失败'
      isConnected.value = false
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const disconnect = () => {
    isConnected.value = false
    apiUrl.value = ''
    secret.value = ''
    mihomoConfig.value = null
    mihomoVersion.value = ''
    error.value = null
    
    // Clear persisted connection info
    localStorage.removeItem('mihomo_apiUrl')
    localStorage.removeItem('mihomo_secret')
  }

  const fetchConfig = async () => {
    if (!isConnected.value || !apiUrl.value) {
      return { success: false, error: '未连接到 Mihomo' }
    }
    
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get('/mihomo/config', {
        params: {
          apiUrl: apiUrl.value,
          secret: secret.value
        }
      })
      
      console.log('Mihomo config response:', response)
      
      if (response.success && response.config) {
        mihomoConfig.value = response.config
        return { 
          success: true, 
          config: response.config,
          warning: response.warning 
        }
      } else {
        throw new Error(response.error || '获取配置失败')
      }
    } catch (err) {
      console.error('Fetch config error:', err)
      error.value = err.response?.data?.error || err.message || '获取配置失败'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const updateConfig = async (config) => {
    if (!isConnected.value || !apiUrl.value) {
      return { success: false, error: '未连接到 Mihomo' }
    }
    
    loading.value = true
    error.value = null
    
    try {
      const response = await api.patch('/mihomo/config', {
        apiUrl: apiUrl.value,
        secret: secret.value,
        config
      })
      
      if (response.success) {
        // Refresh config after update
        await fetchConfig()
        return { success: true }
      } else {
        throw new Error(response.error || '更新配置失败')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || '更新配置失败'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const fetchProxies = async () => {
    if (!isConnected.value || !apiUrl.value) {
      return { success: false, error: '未连接到 Mihomo' }
    }
    
    try {
      const response = await api.get('/mihomo/proxies', {
        params: {
          apiUrl: apiUrl.value,
          secret: secret.value
        }
      })
      
      if (response.success) {
        return { success: true, proxies: response.proxies }
      } else {
        throw new Error(response.error || '获取代理列表失败')
      }
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message || '获取代理列表失败' }
    }
  }

  // Restore connection from localStorage on init
  const restoreConnection = async () => {
    const savedUrl = localStorage.getItem('mihomo_apiUrl')
    const savedSecret = localStorage.getItem('mihomo_secret')
    
    if (savedUrl) {
      return await connect(savedUrl, savedSecret || '')
    }
    return { success: false }
  }

  const clearError = () => {
    error.value = null
  }

  // FTP Actions
  const setFtpConfig = (config) => {
    ftpConfig.value = { ...ftpConfig.value, ...config }
    // Persist to localStorage
    localStorage.setItem('ftp_config', JSON.stringify(ftpConfig.value))
  }

  const restoreFtpConfig = () => {
    const saved = localStorage.getItem('ftp_config')
    if (saved) {
      try {
        ftpConfig.value = JSON.parse(saved)
      } catch (e) {
        console.error('Failed to restore FTP config:', e)
      }
    }
  }

  const connectFtp = async (config) => {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/ftp/connect', config)
      
      if (response.success) {
        ftpConnected.value = true
        setFtpConfig(config)
        return { success: true, files: response.files }
      } else {
        throw new Error(response.error || 'FTP 连接失败')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || 'FTP 连接失败'
      ftpConnected.value = false
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const fetchFtpConfig = async () => {
    if (!ftpConfig.value.host) {
      return { success: false, error: '请先配置 FTP 连接信息' }
    }
    
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/ftp/read', ftpConfig.value)
      
      if (response.success && response.config) {
        mihomoConfig.value = response.config
        ftpConnected.value = true
        return { success: true, config: response.config, content: response.content }
      } else {
        throw new Error(response.error || '读取配置失败')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || '读取配置失败'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const saveFtpConfig = async (config) => {
    if (!ftpConfig.value.host) {
      return { success: false, error: '请先配置 FTP 连接信息' }
    }
    
    loading.value = true
    error.value = null
    
    try {
      const response = await api.post('/ftp/save', {
        ...ftpConfig.value,
        config
      })
      
      if (response.success) {
        return { success: true }
      } else {
        throw new Error(response.error || '保存配置失败')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || '保存配置失败'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const reloadConfig = async () => {
    if (!isConnected.value || !apiUrl.value) {
      return { success: false, error: '未连接到 Mihomo' }
    }
    
    loading.value = true
    error.value = null
    
    try {
      const response = await api.put('/mihomo/reload', {
        apiUrl: apiUrl.value,
        secret: secret.value
      })
      
      if (response.success) {
        return { success: true, message: response.message }
      } else {
        throw new Error(response.error || '重载配置失败')
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message || '重载配置失败'
      return { success: false, error: error.value }
    } finally {
      loading.value = false
    }
  }

  const disconnectFtp = () => {
    ftpConnected.value = false
  }

  return {
    // State
    isConnected,
    apiUrl,
    secret,
    mihomoConfig,
    mihomoVersion,
    loading,
    error,
    ftpConnected,
    ftpConfig,
    
    // Getters
    connectionStatus,
    
    // Actions
    connect,
    disconnect,
    fetchConfig,
    updateConfig,
    fetchProxies,
    restoreConnection,
    clearError,
    
    // FTP Actions
    setFtpConfig,
    restoreFtpConfig,
    connectFtp,
    fetchFtpConfig,
    saveFtpConfig,
    reloadConfig,
    disconnectFtp
  }
})
