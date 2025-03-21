import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, power_user } from "../../../../script.js";
import { getRequestHeaders } from "../../../../script.js";
import { callPopup } from "../../../../script.js";

const extensionName = "prompt-exporter";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: true,
    exportPath: "exports",
    logToConsole: false,
    autoExport: false,
    includeTimestamp: true,
    exportMetadata: true
};

// 初始化插件设置
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    // 确保所有默认设置都存在
    for (const key in defaultSettings) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
}

// 导出Prompt数据
async function exportPromptData(promptData) {
    try {
        if (!extension_settings[extensionName].enabled) {
            console.log("[Prompt导出工具] 插件已禁用，不导出数据");
            return;
        }

        // 记录日志
        if (extension_settings[extensionName].logToConsole) {
            console.log("[Prompt导出工具] 收到的Prompt数据:", promptData);
        }

        // 准备导出数据
        const exportData = {
            timestamp: new Date().toISOString(),
            metadata: extension_settings[extensionName].exportMetadata ? {
                powerUserSettings: {
                    contextSize: power_user.max_context,
                    responseLength: power_user.max_response_length,
                    // 其他可能有用的设置
                }
            } : undefined,
            promptData: promptData
        };

        if (!extension_settings[extensionName].includeTimestamp) {
            delete exportData.timestamp;
        }

        // 格式化文件名
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const fileName = `prompt_data_${timestamp}.json`;
        
        // 发送到服务器保存
        const response = await fetch('/api/save_prompt', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                fileName: fileName,
                exportPath: extension_settings[extensionName].exportPath,
                data: exportData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            toastr.success(`成功导出Prompt数据到: ${result.path}`, 'Prompt导出工具');
            
            // 如果设置了自动导出，则不弹出下载对话框
            if (!extension_settings[extensionName].autoExport) {
                // 创建下载链接
                const downloadUrl = `/api/download_prompt?fileName=${encodeURIComponent(fileName)}&exportPath=${encodeURIComponent(extension_settings[extensionName].exportPath)}`;
                const confirmResult = await callPopup("<h3>Prompt数据已导出</h3><p>点击确定下载文件，或取消关闭此对话框</p>", 'confirm');
                
                if (confirmResult) {
                    // 创建并触发下载链接
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            }
        } else {
            toastr.error(`导出Prompt数据失败: ${result.error || '未知错误'}`, 'Prompt导出工具');
        }
    } catch (error) {
        console.error("[Prompt导出工具] 导出过程中发生错误:", error);
        toastr.error(`导出过程中发生错误: ${error.message || error}`, 'Prompt导出工具');
    }
}

// 创建插件UI
function createUI() {
    const settingsHtml = `
    <div id="prompt_exporter_settings" class="prompt-exporter-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Prompt导出工具</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="prompt-exporter-block flex-container">
                    <label class="checkbox_label">
                        <input id="prompt_exporter_enabled" type="checkbox" ${extension_settings[extensionName].enabled ? 'checked' : ''}>
                        <span>启用插件</span>
                    </label>
                </div>
                <div class="prompt-exporter-block flex-container">
                    <label class="checkbox_label">
                        <input id="prompt_exporter_log_console" type="checkbox" ${extension_settings[extensionName].logToConsole ? 'checked' : ''}>
                        <span>记录到控制台</span>
                    </label>
                </div>
                <div class="prompt-exporter-block flex-container">
                    <label class="checkbox_label">
                        <input id="prompt_exporter_auto_export" type="checkbox" ${extension_settings[extensionName].autoExport ? 'checked' : ''}>
                        <span>自动导出(不弹出下载对话框)</span>
                    </label>
                </div>
                <div class="prompt-exporter-block flex-container">
                    <label class="checkbox_label">
                        <input id="prompt_exporter_timestamp" type="checkbox" ${extension_settings[extensionName].includeTimestamp ? 'checked' : ''}>
                        <span>包含时间戳</span>
                    </label>
                </div>
                <div class="prompt-exporter-block flex-container">
                    <label class="checkbox_label">
                        <input id="prompt_exporter_metadata" type="checkbox" ${extension_settings[extensionName].exportMetadata ? 'checked' : ''}>
                        <span>包含元数据</span>
                    </label>
                </div>
                <div class="prompt-exporter-block flex-container">
                    <label for="prompt_exporter_path">导出路径:</label>
                    <input id="prompt_exporter_path" type="text" value="${extension_settings[extensionName].exportPath}">
                </div>
                <div class="prompt-exporter-block flex-container flex-justify-center">
                    <input id="prompt_exporter_test" class="menu_button" type="button" value="测试导出" />
                </div>
                <hr class="sysHR">
            </div>
        </div>
    </div>`;

    $('#extensions_settings').append(settingsHtml);
    
    // 添加事件监听器
    $('#prompt_exporter_enabled').on('change', function() {
        extension_settings[extensionName].enabled = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#prompt_exporter_log_console').on('change', function() {
        extension_settings[extensionName].logToConsole = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#prompt_exporter_auto_export').on('change', function() {
        extension_settings[extensionName].autoExport = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#prompt_exporter_timestamp').on('change', function() {
        extension_settings[extensionName].includeTimestamp = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#prompt_exporter_metadata').on('change', function() {
        extension_settings[extensionName].exportMetadata = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $('#prompt_exporter_path').on('input', function() {
        extension_settings[extensionName].exportPath = $(this).val();
        saveSettingsDebounced();
    });
    
    $('#prompt_exporter_test').on('click', function() {
        exportPromptData({
            test: true,
            timestamp: Date.now(),
            message: "这是一个测试导出"
        });
    });
}

// 添加服务器API路由
async function addServerRoutes() {
    try {
        const response = await fetch('/api/add_prompt_exporter_routes', {
            method: 'POST',
            headers: getRequestHeaders()
        });
        
        const result = await response.json();
        if (!result.success) {
            console.error("[Prompt导出工具] 添加服务器路由失败:", result.error);
            toastr.error(`无法添加服务器路由: ${result.error}`, 'Prompt导出工具');
        } else {
            console.log("[Prompt导出工具] 服务器路由添加成功");
        }
    } catch (error) {
        console.error("[Prompt导出工具] 添加服务器路由时出错:", error);
        toastr.error(`添加服务器路由时出错: ${error.message || error}`, 'Prompt导出工具');
    }
}

// 插件初始化
jQuery(async () => {
    loadSettings();
    createUI();
    await addServerRoutes();
    
    // 监听CHAT_COMPLETION_PROMPT_READY事件来获取prompt数据
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (data) => {
        try {
            if (!extension_settings[extensionName].enabled) return;
            
            // 获取生成的提示数据
            if (data && data.chat) {
                console.log("[Prompt导出工具] 捕获到Chat Completion Prompt数据");
                await exportPromptData(data);
            } else {
                console.warn("[Prompt导出工具] 收到的数据格式不正确:", data);
            }
        } catch (error) {
            console.error("[Prompt导出工具] 处理事件时出错:", error);
        }
    });
});
