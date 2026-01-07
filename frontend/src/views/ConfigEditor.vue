<template>
  <div class="config-editor">
    <div class="editor-header">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      <span class="current-file">
        <el-icon><Document /></el-icon>
        {{ configStore.currentFile }}
        <el-tag v-if="mihomoStore.isConnected" type="success" size="small" class="mihomo-tag">
          Mihomo 已连接
        </el-tag>
        <el-tag v-if="configStore.fromMihomo" type="warning" size="small" class="mihomo-tag">
          在线配置
        </el-tag>
      </span>
      <div class="actions">
        <!-- 重载配置按钮 -->
        <el-button 
          v-if="mihomoStore.isConnected" 
          type="warning" 
          :icon="Refresh" 
          @click="handleReloadConfig" 
          :loading="reloading"
        >
          重载配置
        </el-button>
        
        <el-button :icon="View" @click="previewYAML">预览YAML</el-button>
        
        <!-- FTP 保存下拉菜单 -->
        <el-dropdown v-if="mihomoStore.ftpConnected && configStore.fromMihomo" @command="handleFtpSaveCommand">
          <el-button type="primary" :loading="saving">
            保存配置
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="ftp" :icon="Upload">保存到 FTP</el-dropdown-item>
              <el-dropdown-item command="local" :icon="Document">保存到本地</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        
        <!-- Mihomo API 保存下拉菜单 -->
        <el-dropdown v-else-if="mihomoStore.isConnected" @command="handleSaveCommand">
          <el-button type="primary" :loading="saving">
            保存配置
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="!configStore.fromMihomo" command="file" :icon="Document">保存到文件</el-dropdown-item>
              <el-dropdown-item command="mihomo" :icon="Upload">保存到 Mihomo</el-dropdown-item>
              <el-dropdown-item v-if="!configStore.fromMihomo" command="both" :icon="Check">同时保存</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        
        <!-- 普通文件保存按钮 -->
        <el-button v-else-if="!configStore.fromMihomo" type="primary" :icon="Check" @click="saveConfig" :loading="saving">
          保存配置
        </el-button>
        
        <!-- 未连接提示 -->
        <el-button v-else type="info" disabled>
          请先连接 Mihomo/FTP 以保存
        </el-button>
      </div>
    </div>

    <div class="editor-content" v-loading="!metadata">
      <el-tabs v-model="activeTab" v-if="metadata">
        <el-tab-pane 
          v-for="category in metadata.categories" 
          :key="category.id"
          :label="category.name"
          :name="category.id"
        >
          <component 
            :is="getComponentForCategory(category)"
            :category="category"
            :config="configStore.config"
            @update="updateConfig"
          />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- YAML Preview Dialog -->
    <el-dialog 
      v-model="previewVisible" 
      title="YAML预览" 
      width="70%"
      :close-on-click-modal="false"
    >
      <el-input
        v-model="yamlPreview"
        type="textarea"
        :rows="20"
        readonly
        style="font-family: 'Consolas', 'Monaco', monospace"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Document, View, Check, Upload, ArrowDown, Refresh } from '@element-plus/icons-vue'
import yaml from 'js-yaml'
import { fileAPI, configAPI } from '@/api'
import { useConfigStore } from '@/stores/config'
import { useMihomoStore } from '@/stores/mihomo'
import BasicConfigForm from '@/components/BasicConfigForm.vue'
import ProxyTable from '@/components/ProxyTable.vue'
import ProxyGroupTable from '@/components/ProxyGroupTable.vue'
import RuleTable from '@/components/RuleTable.vue'

const router = useRouter()
const configStore = useConfigStore()
const mihomoStore = useMihomoStore()

const activeTab = ref('basic')
const metadata = ref(null)
const saving = ref(false)
const reloading = ref(false)
const previewVisible = ref(false)
const yamlPreview = ref('')

const goBack = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要返回吗？未保存的更改将丢失。',
      '确认返回',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    router.push('/')
  } catch {
  }
}

const getComponentForCategory = (category) => {
  if (category.id === 'proxies') return ProxyTable
  if (category.id === 'proxy-groups') return ProxyGroupTable
  if (category.id === 'rules') return RuleTable
  return BasicConfigForm
}

const updateConfig = (key, value) => {
  const config = { ...configStore.config }
  if (key.includes('.')) {
    const keys = key.split('.')
    let obj = config
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {}
      obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
  } else {
    config[key] = value
  }
  configStore.setConfig(config)
}

const validateConfig = async () => {
  const validateRes = await configAPI.validate(configStore.config)
  
  if (validateRes.errors && validateRes.errors.length > 0) {
    await ElMessageBox.confirm(
      `配置验证发现 ${validateRes.errors.length} 个错误：\n\n${validateRes.errors.slice(0, 5).join('\n')}${validateRes.errors.length > 5 ? '\n...' : ''}\n\n是否仍要保存？`,
      '配置验证失败',
      {
        confirmButtonText: '仍要保存',
        cancelButtonText: '取消',
        type: 'error'
      }
    )
  } else if (validateRes.warnings && validateRes.warnings.length > 0) {
    await ElMessageBox.confirm(
      `配置验证发现 ${validateRes.warnings.length} 个警告：\n\n${validateRes.warnings.slice(0, 3).join('\n')}${validateRes.warnings.length > 3 ? '\n...' : ''}\n\n是否继续保存？`,
      '配置验证警告',
      {
        confirmButtonText: '继续保存',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  }
  
  return true
}

const saveToFile = async () => {
  const res = await fileAPI.save(configStore.currentFile, configStore.config)
  if (res.success) {
    return true
  }
  throw new Error('保存到文件失败')
}

const saveToMihomo = async () => {
  const result = await mihomoStore.updateConfig(configStore.config)
  if (result.success) {
    return true
  }
  throw new Error(result.error || '保存到 Mihomo 失败')
}

const saveToFtp = async () => {
  const result = await mihomoStore.saveFtpConfig(configStore.config)
  if (result.success) {
    return true
  }
  throw new Error(result.error || '保存到 FTP 失败')
}

const saveConfig = async () => {
  saving.value = true
  try {
    await validateConfig()
    await saveToFile()
    ElMessage.success('保存成功')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + error.message)
    }
  } finally {
    saving.value = false
  }
}

const handleSaveCommand = async (command) => {
  saving.value = true
  try {
    await validateConfig()
    
    if (command === 'file') {
      await saveToFile()
      ElMessage.success('已保存到文件')
    } else if (command === 'mihomo') {
      await saveToMihomo()
      ElMessage.success('已保存到 Mihomo')
    } else if (command === 'both') {
      await saveToFile()
      await saveToMihomo()
      ElMessage.success('已同时保存到文件和 Mihomo')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + error.message)
    }
  } finally {
    saving.value = false
  }
}

const handleSaveFtp = async () => {
  saving.value = true
  try {
    await validateConfig()
    await saveToFtp()
    ElMessage.success('已保存到 FTP')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + error.message)
    }
  } finally {
    saving.value = false
  }
}

const handleFtpSaveCommand = async (command) => {
  saving.value = true
  try {
    await validateConfig()
    
    if (command === 'ftp') {
      await saveToFtp()
      ElMessage.success('已保存到 FTP')
    } else if (command === 'local') {
      await saveToLocal()
      ElMessage.success('已保存到本地')
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('保存失败: ' + error.message)
    }
  } finally {
    saving.value = false
  }
}

const saveToLocal = async () => {
  const result = await fileAPI.saveLocal(configStore.config, 'ftp-backup')
  if (result.success) {
    ElMessage.info(`文件已保存为: ${result.filename}`)
    return true
  }
  throw new Error(result.error || '保存到本地失败')
}

const handleReloadConfig = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要重载 Mihomo 配置吗？这将使 Mihomo 重新读取配置文件。',
      '重载配置',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    reloading.value = true
    const result = await mihomoStore.reloadConfig()
    
    if (result.success) {
      ElMessage.success('配置重载成功')
    } else {
      ElMessage.error('重载失败: ' + result.error)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('重载失败: ' + error.message)
    }
  } finally {
    reloading.value = false
  }
}

const previewYAML = () => {
  try {
    yamlPreview.value = yaml.dump(configStore.config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true
    })
    previewVisible.value = true
  } catch (error) {
    ElMessage.error('生成YAML失败: ' + error.message)
  }
}

const loadMetadata = async () => {
  try {
    const response = await fetch('/config-metadata.json')
    metadata.value = await response.json()
    configStore.setMetadata(metadata.value)
  } catch (error) {
    ElMessage.error('加载配置元数据失败')
  }
}

onMounted(() => {
  if (!configStore.currentFile) {
    router.push('/')
    return
  }
  loadMetadata()
})
</script>

<style scoped>
.config-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-header {
  height: 64px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
}

.current-file {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.mihomo-tag {
  margin-left: 8px;
}

.actions {
  display: flex;
  gap: 12px;
}

.editor-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: #f5f7fa;
}

.editor-content :deep(.el-tabs) {
  background: white;
  border-radius: 4px;
  padding: 16px;
}

.editor-content :deep(.el-tabs__content) {
  padding: 16px 0;
}
</style>
