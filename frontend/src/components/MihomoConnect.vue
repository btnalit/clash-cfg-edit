<template>
  <div class="mihomo-connect">
    <el-tabs v-model="activeTab">
      <!-- FTP 连接 Tab -->
      <el-tab-pane label="FTP 配置文件" name="ftp">
        <el-card class="connect-card">
          <template #header>
            <div class="card-header">
              <span>
                <el-icon><FolderOpened /></el-icon>
                FTP 配置文件
              </span>
              <el-tag 
                :type="mihomoStore.ftpConnected ? 'success' : 'info'" 
                size="small"
              >
                {{ mihomoStore.ftpConnected ? '已连接' : '未连接' }}
              </el-tag>
            </div>
          </template>

          <el-form 
            ref="ftpFormRef"
            :model="ftpForm" 
            :rules="ftpRules"
            label-width="100px"
            :disabled="mihomoStore.loading"
          >
            <el-form-item label="FTP 主机" prop="host">
              <el-input
                v-model="ftpForm.host"
                placeholder="10.20.2.254"
              />
            </el-form-item>

            <el-form-item label="端口" prop="port">
              <el-input-number
                v-model="ftpForm.port"
                :min="1"
                :max="65535"
                style="width: 120px"
              />
            </el-form-item>

            <el-form-item label="用户名" prop="user">
              <el-input
                v-model="ftpForm.user"
                placeholder="admin"
              />
            </el-form-item>

            <el-form-item label="密码" prop="password">
              <el-input
                v-model="ftpForm.password"
                type="password"
                placeholder="FTP 密码"
                show-password
              />
            </el-form-item>

            <el-form-item label="配置路径" prop="configPath">
              <el-input
                v-model="ftpForm.configPath"
                placeholder="/mihomoconfig/config.yaml"
              />
            </el-form-item>

            <el-form-item>
              <div class="button-group">
                <el-button
                  type="primary"
                  :loading="mihomoStore.loading"
                  @click="handleFtpConnect"
                >
                  <el-icon><Connection /></el-icon>
                  测试连接
                </el-button>
                
                <el-button
                  type="success"
                  @click="handleFtpLoadConfig"
                  :loading="mihomoStore.loading"
                >
                  <el-icon><Download /></el-icon>
                  加载配置到编辑器
                </el-button>
              </div>
            </el-form-item>
          </el-form>

          <el-alert
            type="info"
            :closable="false"
            class="info-alert"
          >
            <template #title>
              通过 FTP 直接读取 Mihomo 配置文件，可获取完整配置（包括代理凭证）
            </template>
          </el-alert>
        </el-card>
      </el-tab-pane>

      <!-- Mihomo API 连接 Tab -->
      <el-tab-pane label="Mihomo API" name="api">
        <el-card class="connect-card">
          <template #header>
            <div class="card-header">
              <span>
                <el-icon><Connection /></el-icon>
                Mihomo API 连接
              </span>
              <el-tag 
                :type="statusTagType" 
                size="small"
              >
                {{ statusText }}
              </el-tag>
            </div>
          </template>

          <el-form 
            ref="formRef"
            :model="form" 
            :rules="rules"
            label-width="100px"
            :disabled="mihomoStore.loading"
          >
            <el-form-item label="API 地址" prop="apiUrl">
              <el-input
                v-model="form.apiUrl"
                placeholder="127.0.0.1:9090"
                :disabled="mihomoStore.isConnected"
              >
                <template #prepend>http://</template>
              </el-input>
            </el-form-item>

            <el-form-item label="Secret" prop="secret">
              <el-input
                v-model="form.secret"
                type="password"
                placeholder="API 密钥（可选）"
                show-password
                :disabled="mihomoStore.isConnected"
              />
            </el-form-item>

            <el-form-item>
              <div class="button-group">
                <el-button
                  v-if="!mihomoStore.isConnected"
                  type="primary"
                  :loading="mihomoStore.loading"
                  @click="handleConnect"
                >
                  <el-icon><Connection /></el-icon>
                  连接
                </el-button>
                <el-button
                  v-else
                  type="danger"
                  @click="handleDisconnect"
                >
                  <el-icon><SwitchButton /></el-icon>
                  断开连接
                </el-button>
                
                <el-button
                  v-if="mihomoStore.isConnected"
                  type="success"
                  @click="handleLoadConfig"
                  :loading="mihomoStore.loading"
                >
                  <el-icon><Download /></el-icon>
                  加载配置到编辑器
                </el-button>
              </div>
            </el-form-item>
          </el-form>

          <!-- Connection Info -->
          <div v-if="mihomoStore.isConnected" class="connection-info">
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="版本">
                {{ mihomoStore.mihomoVersion || '未知' }}
              </el-descriptions-item>
              <el-descriptions-item label="地址">
                {{ mihomoStore.apiUrl }}
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <el-alert
            type="warning"
            :closable="false"
            class="info-alert"
          >
            <template #title>
              注意：Mihomo API 不返回代理凭证信息，建议使用 FTP 方式获取完整配置
            </template>
          </el-alert>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Error Alert -->
    <el-alert
      v-if="mihomoStore.error"
      :title="mihomoStore.error"
      type="error"
      show-icon
      closable
      @close="mihomoStore.clearError"
      class="error-alert"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Connection, SwitchButton, Download, FolderOpened } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useMihomoStore } from '@/stores/mihomo'

const emit = defineEmits(['config-loaded'])

const mihomoStore = useMihomoStore()
const formRef = ref(null)
const ftpFormRef = ref(null)
const activeTab = ref('ftp')

const form = ref({
  apiUrl: '',
  secret: ''
})

const ftpForm = ref({
  host: '',
  port: 21,
  user: '',
  password: '',
  configPath: ''
})

const rules = {
  apiUrl: [
    { required: true, message: '请输入 API 地址', trigger: 'blur' },
    { 
      pattern: /^[\w.-]+:\d+$/, 
      message: '格式应为 host:port，例如 127.0.0.1:9090', 
      trigger: 'blur' 
    }
  ]
}

const ftpRules = {
  host: [
    { required: true, message: '请输入 FTP 主机地址', trigger: 'blur' }
  ],
  user: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ],
  configPath: [
    { required: true, message: '请输入配置文件路径', trigger: 'blur' }
  ]
}

const statusTagType = computed(() => {
  switch (mihomoStore.connectionStatus) {
    case 'connected': return 'success'
    case 'connecting': return 'warning'
    default: return 'info'
  }
})

const statusText = computed(() => {
  switch (mihomoStore.connectionStatus) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中...'
    default: return '未连接'
  }
})

// Mihomo API handlers
const handleConnect = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  const result = await mihomoStore.connect(form.value.apiUrl, form.value.secret)
  
  if (result.success) {
    ElMessage.success('连接成功')
  } else {
    ElMessage.error(result.error || '连接失败')
  }
}

const handleDisconnect = () => {
  mihomoStore.disconnect()
  ElMessage.info('已断开连接')
}

const handleLoadConfig = async () => {
  const result = await mihomoStore.fetchConfig()
  
  if (result.success && result.config) {
    console.log('Loaded config from Mihomo:', result.config)
    emit('config-loaded', result.config)
    
    if (result.warning) {
      ElMessage.warning({
        message: result.warning,
        duration: 5000
      })
    }
  } else {
    ElMessage.error(result.error || '加载配置失败')
  }
}

// FTP handlers
const handleFtpConnect = async () => {
  const valid = await ftpFormRef.value.validate().catch(() => false)
  if (!valid) return

  const result = await mihomoStore.connectFtp(ftpForm.value)
  
  if (result.success) {
    ElMessage.success('FTP 连接成功')
  } else {
    ElMessage.error(result.error || 'FTP 连接失败')
  }
}

const handleFtpLoadConfig = async () => {
  const valid = await ftpFormRef.value.validate().catch(() => false)
  if (!valid) return

  // Save FTP config first
  mihomoStore.setFtpConfig(ftpForm.value)
  
  const result = await mihomoStore.fetchFtpConfig()
  
  if (result.success && result.config) {
    console.log('Loaded config from FTP:', result.config)
    emit('config-loaded', result.config)
    ElMessage.success('配置已加载到编辑器')
  } else {
    ElMessage.error(result.error || '加载配置失败')
  }
}

// Restore saved connection info on mount
onMounted(() => {
  // Restore Mihomo API config
  const savedUrl = localStorage.getItem('mihomo_apiUrl')
  const savedSecret = localStorage.getItem('mihomo_secret')
  
  if (savedUrl) {
    form.value.apiUrl = savedUrl
    form.value.secret = savedSecret || ''
  }
  
  // Restore FTP config
  mihomoStore.restoreFtpConfig()
  if (mihomoStore.ftpConfig.host) {
    ftpForm.value = { ...mihomoStore.ftpConfig }
  }
})
</script>

<style scoped>
.mihomo-connect {
  margin-bottom: 20px;
}

.connect-card {
  max-width: 600px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.button-group {
  display: flex;
  gap: 12px;
}

.connection-info {
  margin-top: 16px;
}

.error-alert {
  margin-top: 16px;
}

.info-alert {
  margin-top: 16px;
}
</style>
