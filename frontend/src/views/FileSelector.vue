<template>
  <div class="file-selector">
    <el-card class="selector-card">
      <template #header>
        <div class="card-header">
          <el-icon style="margin-right: 8px"><Folder /></el-icon>
          <span>选择或上传Clash配置文件</span>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="服务器文件" name="server">
          <div class="server-files">
            <div class="toolbar">
              <el-button 
                type="primary" 
                :icon="Refresh" 
                @click="loadFiles"
                :loading="loading"
              >
                刷新列表
              </el-button>

              <!-- Mihomo 连接按钮 -->
              <el-button
                :type="mihomoStore.isConnected ? 'success' : 'default'"
                :icon="Link"
                @click="showMihomoDialog = true"
              >
                {{ mihomoStore.isConnected ? 'Mihomo 已连接' : '连接 Mihomo' }}
              </el-button>
            </div>

            <el-table 
              :data="files" 
              v-loading="loading"
              @row-click="selectFile"
              highlight-current-row
              style="width: 100%"
            >
              <el-table-column prop="name" label="文件名" />
              <el-table-column prop="size" label="大小" width="120">
                <template #default="{ row }">
                  {{ formatSize(row.size) }}
                </template>
              </el-table-column>
              <el-table-column prop="modified" label="修改时间" width="200">
                <template #default="{ row }">
                  {{ formatDate(row.modified) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180">
                <template #default="{ row }">
                  <el-button 
                    type="primary" 
                    size="small"
                    @click.stop="selectFile(row)"
                  >
                    编辑
                  </el-button>
                  <el-button 
                    type="danger" 
                    size="small"
                    @click.stop="deleteFile(row)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="上传文件" name="upload">
          <div class="upload-section">
            <el-upload
              drag
              :auto-upload="false"
              :on-change="handleFileChange"
              :limit="1"
              accept=".yaml,.yml"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">
                拖拽文件到此处或<em>点击上传</em>
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  只支持 .yaml 或 .yml 格式的文件
                </div>
              </template>
            </el-upload>

            <el-button 
              type="primary" 
              @click="uploadFile"
              :disabled="!selectedUploadFile"
              :loading="uploading"
              style="margin-top: 16px"
            >
              上传并编辑
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- Mihomo Connect Dialog -->
    <el-dialog
      v-model="showMihomoDialog"
      title="Mihomo 连接管理"
      width="650px"
      :close-on-click-modal="false"
    >
      <MihomoConnect @config-loaded="handleMihomoConfigLoaded" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, Refresh, UploadFilled, Link } from '@element-plus/icons-vue'
import { fileAPI } from '@/api'
import { useConfigStore } from '@/stores/config'
import { useMihomoStore } from '@/stores/mihomo'
import MihomoConnect from '@/components/MihomoConnect.vue'

const router = useRouter()
const configStore = useConfigStore()
const mihomoStore = useMihomoStore()

const activeTab = ref('server')
const files = ref([])
const loading = ref(false)
const uploading = ref(false)
const selectedUploadFile = ref(null)
const showMihomoDialog = ref(false)

const loadFiles = async () => {
  loading.value = true
  try {
    const res = await fileAPI.list()
    if (res.success) {
      files.value = res.files
    }
  } catch (error) {
    ElMessage.error('加载文件列表失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

const selectFile = async (file) => {
  try {
    const res = await fileAPI.read(file.name)
    if (res.success) {
      configStore.setCurrentFile(file.name)
      configStore.setConfig(res.config)
      configStore.setOriginalContent(res.content)
      configStore.setFromMihomo(false)
      router.push('/editor')
    }
  } catch (error) {
    ElMessage.error('读取文件失败: ' + error.message)
  }
}

const deleteFile = async (file) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件 "${file.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const res = await fileAPI.delete(file.name)
    if (res.success) {
      ElMessage.success('删除成功')
      loadFiles()
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + error.message)
    }
  }
}

const handleFileChange = (file) => {
  selectedUploadFile.value = file
}

const uploadFile = async () => {
  if (!selectedUploadFile.value) return
  
  uploading.value = true
  try {
    const res = await fileAPI.upload(selectedUploadFile.value.raw)
    if (res.success) {
      ElMessage.success('上传成功')
      await selectFile({ name: res.file.name })
    }
  } catch (error) {
    ElMessage.error('上传失败: ' + error.message)
  } finally {
    uploading.value = false
  }
}

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const formatDate = (date) => {
  return new Date(date).toLocaleString('zh-CN')
}

// 处理从 Mihomo 加载配置
const handleMihomoConfigLoaded = (config) => {
  if (config) {
    console.log('Received config from Mihomo/FTP:', config)
    
    // 确保配置有基本结构
    const normalizedConfig = {
      ...config,
      proxies: config.proxies || [],
      'proxy-groups': config['proxy-groups'] || [],
      rules: config.rules || []
    }
    
    // 设置一个虚拟文件名表示来自 Mihomo/FTP
    const fileName = mihomoStore.ftpConnected ? '[FTP 配置文件]' : '[Mihomo 在线配置]'
    configStore.setCurrentFile(fileName)
    configStore.setConfig(normalizedConfig)
    configStore.setOriginalContent(null)
    configStore.setFromMihomo(true)
    showMihomoDialog.value = false
    ElMessage.success('已加载配置')
    router.push('/editor')
  }
}

onMounted(() => {
  loadFiles()
})
</script>

<style scoped>
.file-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 60px);
  padding: 24px;
}

.selector-card {
  width: 100%;
  max-width: 1000px;
}

.card-header {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 600;
}

.server-files {
  padding: 16px 0;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.upload-section {
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

:deep(.el-upload-dragger) {
  width: 480px;
}
</style>
