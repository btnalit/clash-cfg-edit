<template>
  <div class="proxy-table">
    <div class="table-header">
      <el-button type="primary" :icon="Plus" @click="showAddDialog">添加代理</el-button>
      <el-select v-model="selectedProtocol" placeholder="筛选协议" clearable style="width: 200px">
        <el-option
          v-for="protocol in protocols"
          :key="protocol.type"
          :label="protocol.label"
          :value="protocol.type"
        />
      </el-select>
    </div>

    <el-table :data="filteredProxies" style="width: 100%">
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column prop="server" label="服务器" min-width="200" />
      <el-table-column prop="port" label="端口" width="100" />
      <el-table-column prop="dialer-proxy" label="前置代理" width="150">
        <template #default="{ row }">
          <el-tag v-if="row['dialer-proxy']" type="info" size="small">
            {{ row['dialer-proxy'] }}
          </el-tag>
          <span v-else class="no-dialer-proxy">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row, $index }">
          <el-button size="small" @click="editProxy(row, $index)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteProxy($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑代理' : '添加代理'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="currentProxy" label-width="120px">
        <el-form-item label="协议类型">
          <el-select v-model="currentProxy.type" @change="onProtocolChange" :disabled="isEdit">
            <el-option
              v-for="protocol in protocols"
              :key="protocol.type"
              :label="protocol.label"
              :value="protocol.type"
            />
          </el-select>
        </el-form-item>

        <template v-for="field in currentFields" :key="field.key">
          <el-form-item
            v-if="shouldShowField(field)"
            :label="field.label"
            :required="field.required"
          >
            <!-- String input -->
            <el-input
              v-if="field.type === 'string'"
              v-model="currentProxy[field.key]"
              :placeholder="field.label"
            />
            <!-- Number input -->
            <el-input-number
              v-else-if="field.type === 'number'"
              v-model="currentProxy[field.key]"
              :placeholder="field.label"
              style="width: 100%"
            />
            <!-- Boolean switch -->
            <el-switch
              v-else-if="field.type === 'boolean'"
              v-model="currentProxy[field.key]"
            />
            <!-- Select dropdown -->
            <el-select
              v-else-if="field.type === 'select'"
              v-model="currentProxy[field.key]"
              :placeholder="'请选择' + field.label"
              clearable
            >
              <el-option
                v-for="option in field.options"
                :key="option"
                :label="option || '(空)'"
                :value="option"
              />
            </el-select>
            <!-- Dialer-Proxy dropdown -->
            <el-select
              v-else-if="field.type === 'dialer-proxy'"
              v-model="currentProxy[field.key]"
              placeholder="选择前置代理（可选）"
              clearable
              filterable
            >
              <el-option
                v-for="proxyName in availableDialerProxies"
                :key="proxyName"
                :label="proxyName"
                :value="proxyName"
              />
            </el-select>
            <!-- Array input (e.g., ALPN) -->
            <el-select
              v-else-if="field.type === 'array'"
              v-model="currentProxy[field.key]"
              multiple
              filterable
              allow-create
              default-first-option
              :placeholder="'输入' + field.label + '，按回车添加'"
              style="width: 100%"
            >
              <el-option
                v-for="option in (field.options || defaultArrayOptions[field.key] || [])"
                :key="option"
                :label="option"
                :value="option"
              />
            </el-select>
            <!-- Nested object fields -->
            <div v-else-if="field.type === 'object' && field.nestedFields" class="nested-fields">
              <el-checkbox 
                v-model="nestedFieldsEnabled[field.key]" 
                @change="(val) => onNestedFieldToggle(field.key, val)"
              >
                启用 {{ field.label }}
              </el-checkbox>
              <div v-if="nestedFieldsEnabled[field.key]" class="nested-fields-content">
                <template v-for="nestedField in field.nestedFields" :key="nestedField.key">
                  <!-- Nested string field -->
                  <el-form-item
                    v-if="nestedField.type === 'string'"
                    :label="nestedField.label"
                    :required="nestedField.required"
                    label-width="100px"
                  >
                    <el-input
                      :model-value="getNestedValue(field.key, nestedField.key)"
                      :placeholder="nestedField.label"
                      @update:model-value="(val) => setNestedValue(field.key, nestedField.key, val)"
                    />
                  </el-form-item>
                  <!-- Nested object field (e.g., headers) -->
                  <template v-else-if="nestedField.type === 'object' && nestedField.nestedFields">
                    <el-form-item
                      v-for="deepField in nestedField.nestedFields"
                      :key="deepField.key"
                      :label="deepField.label"
                      label-width="100px"
                    >
                      <el-input
                        :model-value="getDeepNestedValue(field.key, nestedField.key, deepField.key)"
                        :placeholder="deepField.label"
                        @update:model-value="(val) => setDeepNestedValue(field.key, nestedField.key, deepField.key, val)"
                      />
                    </el-form-item>
                  </template>
                </template>
              </div>
            </div>
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProxy">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({
  category: Object,
  config: Object
})

const emit = defineEmits(['update'])

const protocols = computed(() => props.category.protocols || [])
const selectedProtocol = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentProxy = ref({})
const editIndex = ref(-1)
const currentFields = ref([])
const nestedFieldsEnabled = reactive({})

// Default options for array fields
const defaultArrayOptions = {
  alpn: ['h2', 'http/1.1', 'h3']
}

const proxies = computed(() => props.config.proxies || [])

const filteredProxies = computed(() => {
  if (!selectedProtocol.value) return proxies.value
  return proxies.value.filter(p => p.type === selectedProtocol.value)
})

// Get available proxies for dialer-proxy selection (excluding current proxy being edited)
// Include both proxies and proxy groups
const availableDialerProxies = computed(() => {
  const currentName = currentProxy.value.name
  const proxyNames = proxies.value
    .map(p => p.name)
    .filter(name => name && name !== currentName)
  
  // Also include proxy groups
  const proxyGroups = props.config['proxy-groups'] || []
  const groupNames = proxyGroups.map(g => g.name).filter(name => name)
  
  return [...proxyNames, ...groupNames]
})

// Check if a field should be shown based on showWhen condition
const shouldShowField = (field) => {
  if (!field.showWhen) return true
  const { field: conditionField, value: conditionValue } = field.showWhen
  const currentValue = currentProxy.value[conditionField]
  // Handle boolean comparison (string "true"/"false" vs boolean true/false)
  if (typeof conditionValue === 'boolean') {
    return currentValue === conditionValue || currentValue === String(conditionValue)
  }
  return currentValue === conditionValue
}

// Handle nested field toggle
const onNestedFieldToggle = (fieldKey, enabled) => {
  if (enabled) {
    if (!currentProxy.value[fieldKey]) {
      currentProxy.value[fieldKey] = {}
    }
  } else {
    delete currentProxy.value[fieldKey]
  }
}

// Get nested value for v-model
const getNestedValue = (parentKey, childKey) => {
  return currentProxy.value[parentKey]?.[childKey] || ''
}

// Set nested value
const setNestedValue = (parentKey, childKey, value) => {
  if (!currentProxy.value[parentKey]) {
    currentProxy.value[parentKey] = {}
  }
  if (value) {
    currentProxy.value[parentKey][childKey] = value
  } else {
    delete currentProxy.value[parentKey][childKey]
  }
}

// Get deep nested value (e.g., ws-opts.headers.Host)
const getDeepNestedValue = (parentKey, middleKey, childKey) => {
  return currentProxy.value[parentKey]?.[middleKey]?.[childKey] || ''
}

// Set deep nested value
const setDeepNestedValue = (parentKey, middleKey, childKey, value) => {
  if (!currentProxy.value[parentKey]) {
    currentProxy.value[parentKey] = {}
  }
  if (!currentProxy.value[parentKey][middleKey]) {
    currentProxy.value[parentKey][middleKey] = {}
  }
  if (value) {
    currentProxy.value[parentKey][middleKey][childKey] = value
  } else {
    delete currentProxy.value[parentKey][middleKey][childKey]
    // Clean up empty objects
    if (Object.keys(currentProxy.value[parentKey][middleKey]).length === 0) {
      delete currentProxy.value[parentKey][middleKey]
    }
  }
}

// Initialize nested fields enabled state based on current proxy data
const initNestedFieldsEnabled = () => {
  const protocol = protocols.value.find(p => p.type === currentProxy.value.type)
  if (!protocol) return
  
  // Reset all nested fields first
  Object.keys(nestedFieldsEnabled).forEach(key => {
    delete nestedFieldsEnabled[key]
  })
  
  protocol.fields.forEach(field => {
    if (field.type === 'object' && field.nestedFields) {
      // Check if the nested object exists and has any values
      const nestedObj = currentProxy.value[field.key]
      nestedFieldsEnabled[field.key] = !!(nestedObj && Object.keys(nestedObj).length > 0)
    }
  })
}

const onProtocolChange = () => {
  const protocol = protocols.value.find(p => p.type === currentProxy.value.type)
  currentFields.value = protocol?.fields || []
  
  // Create new proxy with fields in correct order (name first, then type, then others)
  const newProxy = {}
  
  // First add name and type
  newProxy.name = currentProxy.value.name || ''
  newProxy.type = currentProxy.value.type
  
  // Then add other fields in the order defined in metadata
  currentFields.value.forEach(field => {
    if (field.key !== 'name' && field.key !== 'type') {
      if (field.default !== undefined) {
        newProxy[field.key] = field.default
      } else if (field.type === 'array') {
        // Initialize array fields as empty array
        newProxy[field.key] = []
      }
    }
  })
  
  currentProxy.value = newProxy
  
  // Reset nested fields enabled state
  Object.keys(nestedFieldsEnabled).forEach(key => {
    delete nestedFieldsEnabled[key]
  })
}

const showAddDialog = () => {
  isEdit.value = false
  currentProxy.value = { type: 'ss' }
  onProtocolChange()
  dialogVisible.value = true
}

const editProxy = (row, index) => {
  isEdit.value = true
  editIndex.value = index
  currentProxy.value = JSON.parse(JSON.stringify(row)) // Deep clone
  const protocol = protocols.value.find(p => p.type === row.type)
  currentFields.value = protocol?.fields || []
  initNestedFieldsEnabled()
  dialogVisible.value = true
}

const saveProxy = () => {
  const protocol = protocols.value.find(p => p.type === currentProxy.value.type)
  const requiredFields = protocol?.fields.filter(f => f.required) || []
  
  for (const field of requiredFields) {
    const value = currentProxy.value[field.key]
    // Check for empty string, null, undefined
    if (value === undefined || value === null || value === '') {
      ElMessage.error(`请填写 ${field.label}`)
      return
    }
  }

  // Port validation (1-65535)
  const port = currentProxy.value.port
  if (port !== undefined && (port < 1 || port > 65535)) {
    ElMessage.error('端口必须在 1-65535 之间')
    return
  }

  // VLESS-specific validation
  if (currentProxy.value.type === 'vless') {
    // Validate UUID format (required field, must be valid format)
    const uuid = currentProxy.value.uuid
    if (!isValidUUID(uuid)) {
      ElMessage.error('UUID 格式不正确，应为 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx 格式')
      return
    }
    
    // Validate REALITY public-key if reality-opts is enabled
    if (currentProxy.value['reality-opts'] && !currentProxy.value['reality-opts']['public-key']) {
      ElMessage.error('REALITY 模式需要配置公钥 (public-key)')
      return
    }
  }

  // VMess UUID validation
  if (currentProxy.value.type === 'vmess') {
    const uuid = currentProxy.value.uuid
    if (!isValidUUID(uuid)) {
      ElMessage.error('UUID 格式不正确，应为 xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx 格式')
      return
    }
  }

  // SOCKS5-specific validation
  if (currentProxy.value.type === 'socks5') {
    const username = currentProxy.value.username
    const password = currentProxy.value.password
    // Username and password must both be filled or both be empty
    const hasUsername = username && username.trim() !== ''
    const hasPassword = password && password.trim() !== ''
    if (hasUsername !== hasPassword) {
      ElMessage.error('用户名和密码必须同时填写或同时为空')
      return
    }
  }

  // Clean up empty nested objects before saving
  const proxyToSave = cleanupEmptyObjects({ ...currentProxy.value })
  
  // Reorder fields to ensure 'name' is first, then 'type', then others
  const orderedProxy = reorderProxyFields(proxyToSave)

  const newProxies = [...proxies.value]
  let oldName = null
  
  if (isEdit.value) {
    oldName = newProxies[editIndex.value].name
    newProxies[editIndex.value] = orderedProxy
    
    if (oldName !== orderedProxy.name) {
      updateProxyGroupReferences(oldName, orderedProxy.name)
      updateDialerProxyReferences(oldName, orderedProxy.name)
      ElMessage.success(`修改成功，已同步更新代理组和前置代理中的引用`)
    } else {
      ElMessage.success('修改成功')
    }
  } else {
    newProxies.push(orderedProxy)
    ElMessage.success('添加成功')
  }
  
  emit('update', 'proxies', newProxies)
  dialogVisible.value = false
}

// Validate UUID format
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

// Clean up empty nested objects and empty arrays
const cleanupEmptyObjects = (obj) => {
  const result = { ...obj }
  Object.keys(result).forEach(key => {
    if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = cleanupEmptyObjects(result[key])
      if (Object.keys(result[key]).length === 0) {
        delete result[key]
      }
    } else if (Array.isArray(result[key]) && result[key].length === 0) {
      // Remove empty arrays
      delete result[key]
    } else if (result[key] === '' || result[key] === undefined) {
      delete result[key]
    }
  })
  return result
}

// Reorder proxy fields to ensure correct YAML output format
// name should be first, then type, then other required fields, then optional fields
const reorderProxyFields = (proxy) => {
  const orderedProxy = {}
  
  // Define field order for each protocol type
  const fieldOrders = {
    ss: ['name', 'type', 'server', 'port', 'cipher', 'password', 'udp', 'dialer-proxy'],
    vmess: ['name', 'type', 'server', 'port', 'uuid', 'alterId', 'cipher', 'tls', 'skip-cert-verify', 'servername', 'network', 'ws-opts', 'h2-opts', 'grpc-opts', 'udp', 'dialer-proxy'],
    vless: ['name', 'type', 'server', 'port', 'uuid', 'flow', 'tls', 'skip-cert-verify', 'servername', 'client-fingerprint', 'network', 'reality-opts', 'ws-opts', 'grpc-opts', 'udp', 'dialer-proxy'],
    trojan: ['name', 'type', 'server', 'port', 'password', 'sni', 'skip-cert-verify', 'alpn', 'network', 'ws-opts', 'grpc-opts', 'udp', 'dialer-proxy'],
    hysteria2: ['name', 'type', 'server', 'port', 'password', 'up', 'down', 'obfs', 'obfs-password', 'sni', 'skip-cert-verify', 'fingerprint', 'alpn', 'dialer-proxy'],
    socks5: ['name', 'type', 'server', 'port', 'username', 'password', 'tls', 'skip-cert-verify', 'sni', 'fingerprint', 'udp', 'dialer-proxy'],
    http: ['name', 'type', 'server', 'port', 'username', 'password', 'tls', 'skip-cert-verify', 'sni', 'dialer-proxy'],
    anytls: ['name', 'type', 'server', 'port', 'password', 'sni', 'alpn', 'skip-cert-verify', 'udp', 'dialer-proxy']
  }
  
  const proxyType = proxy.type?.toLowerCase()
  const order = fieldOrders[proxyType] || ['name', 'type', 'server', 'port']
  
  // Add fields in defined order
  order.forEach(field => {
    if (proxy[field] !== undefined && proxy[field] !== '' && proxy[field] !== null) {
      orderedProxy[field] = proxy[field]
    }
  })
  
  // Add any remaining fields not in the order list
  Object.keys(proxy).forEach(key => {
    if (!(key in orderedProxy) && proxy[key] !== undefined && proxy[key] !== '' && proxy[key] !== null) {
      orderedProxy[key] = proxy[key]
    }
  })
  
  return orderedProxy
}

const deleteProxy = async (index) => {
  const deletedProxyName = proxies.value[index].name
  
  try {
    await ElMessageBox.confirm(
      `确定要删除代理 "${deletedProxyName}" 吗？该代理将从所有代理组和前置代理引用中移除。`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    // First clear dialer-proxy references from other proxies
    const updatedProxies = proxies.value.map((proxy, i) => {
      if (i === index) return proxy // Will be removed
      if (proxy['dialer-proxy'] === deletedProxyName) {
        const { 'dialer-proxy': _, ...rest } = proxy
        return rest
      }
      return proxy
    }).filter((_, i) => i !== index)
    
    emit('update', 'proxies', updatedProxies)
    
    removeProxyFromGroups(deletedProxyName)
    
    ElMessage.success('删除成功')
  } catch {
    // 用户取消删除
  }
}

const updateProxyGroupReferences = (oldName, newName) => {
  const proxyGroups = props.config['proxy-groups'] || []
  const updatedGroups = proxyGroups.map(group => {
    if (group.proxies && Array.isArray(group.proxies)) {
      return {
        ...group,
        proxies: group.proxies.map(proxy => proxy === oldName ? newName : proxy)
      }
    }
    return group
  })
  
  emit('update', 'proxy-groups', updatedGroups)
}

// Update dialer-proxy references when a proxy is renamed
const updateDialerProxyReferences = (oldName, newName) => {
  const updatedProxies = proxies.value.map(proxy => {
    if (proxy['dialer-proxy'] === oldName) {
      return { ...proxy, 'dialer-proxy': newName }
    }
    return proxy
  })
  
  emit('update', 'proxies', updatedProxies)
}

const removeProxyFromGroups = (proxyName) => {
  const proxyGroups = props.config['proxy-groups'] || []
  const updatedGroups = proxyGroups.map(group => {
    if (group.proxies && Array.isArray(group.proxies)) {
      return {
        ...group,
        proxies: group.proxies.filter(proxy => proxy !== proxyName)
      }
    }
    return group
  })
  
  emit('update', 'proxy-groups', updatedGroups)
}
</script>

<style scoped>
.proxy-table {
  width: 100%;
}

.table-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.nested-fields {
  width: 100%;
}

.nested-fields-content {
  margin-top: 12px;
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.nested-fields-content .el-form-item {
  margin-bottom: 12px;
}

.nested-fields-content .el-form-item:last-child {
  margin-bottom: 0;
}

.no-dialer-proxy {
  color: #c0c4cc;
}
</style>
