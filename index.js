import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";
import { callPopup } from "../../../../script.js";
import { generateFilename } from "../../../utils.js";

// 插件名称和设置定义
const extensionName = "prompt-struct-exporter";
const defaultSettings = {
    enabled: true,
    autoExport: false,
    exportDirectory: "",
    lastExportPath: "",
};

// 初始化日志函数
function logDebug(...args) {
    if (extension_settings[extensionName].debugMode) {
        console.log(`[${extensionName}]`, ...args);
    }
}

function logError(...args) {
    console.error(`[${extensionName}]`, ...args);
}

// 清除无法序列化的内容
function sanitizeForJSON(obj) {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'function') return '[Function]';
    
    if (typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForJSON(item));
    }
    
    // 处理对象
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        try {
            if (key === 'extension' && Object.keys(value).length === 0) {
                result[key] = {};
                continue;
            }
            
            // 跳过一些特殊对象
            if (value instanceof Element || value instanceof Window) {
                result[key] = '[DOM Element]';
                continue;
            }
            
            // 跳过函数和Buffer
            if (typeof value === 'function') {
                result[key] = '[Function]';
                continue;
            }
            
            // 处理Buffer或类Buffer对象
            if (value?.type === 'Buffer' || (value?.buffer && value?.byteLength)) {
                result[key] = '[Buffer Data]';
                continue;
            }
            
            result[key] = sanitizeForJSON(value);
        } catch (error) {
            result[key] = `[Error: ${error.message}]`;
        }
    }
    
    return result;
}

// 导出提示结构
function exportPromptStruct(promptStruct) {
    try {
        logDebug("开始导出提示结构");
        if (!promptStruct) {
            logError("尝试导出空的提示结构");
            throw new Error("没有可导出的提示结构数据");
        }
        
        // 清理数据，确保可以序列化
        const sanitizedData = sanitizeForJSON(promptStruct);
        
        // 准备JSON数据
        const jsonData = JSON.stringify(sanitizedData, null, 2);
        
        // 创建Blob和下载链接
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // 准备文件名
        const charName = promptStruct.Charname || "unknown";
        const username = promptStruct.UserCharname || "user";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `prompt_struct_${charName}_${username}_${timestamp}.json`;
        
        // 创建下载链接并触发
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        // 更新最后导出路径
        extension_settings[extensionName].lastExportPath = filename;
        saveSettingsDebounced();
        
        logDebug("提示结构导出成功", filename);
        toastr.success(`Prompt结构已导出到: ${filename}`, "导出成功");
        
        return { success: true, filename };
    } catch (error) {
        logError("导出提示结构失败", error);
        toastr.error(`导出失败: ${error.message}`, "错误");
        return { success: false, error: error.message };
    }
}

// 加载插件设置
async function loadSettings() {
    // 初始化设置项
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    $('#prompt_exporter_enabled').prop('checked', extension_settings[extensionName].enabled);
    $('#prompt_exporter_auto_export').prop('checked', extension_settings[extensionName].autoExport);
    $('#prompt_exporter_debug_mode').prop('checked', extension_settings[extensionName].debugMode);
}

let lastChatData = null;

// 注册事件监听器
function registerEventListeners() {
    // 监听提示词准备好事件
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (data) => {
        logDebug("提示词准备好事件触发", data ? "有数据" : "无数据");
        lastChatData = data;
        
        // 如果启用了自动导出，则直接导出
        if (extension_settings[extensionName].enabled && extension_settings[extensionName].autoExport) {
            exportPromptStruct(data);
        }
    });
}

// 主入口函数
jQuery(async () => {
    logDebug("插件初始化中");
    
    // 创建UI
    const settingsHtml = `
    <div class="prompt-struct-exporter-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Prompt结构导出器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="flex-container">
                    <label class="flex-container">
                        <input id="prompt_exporter_enabled" type="checkbox">
                        <span>启用导出功能</span>
                    </label>
                </div>
                <div class="flex-container">
                    <label class="flex-container">
                        <input id="prompt_exporter_auto_export" type="checkbox">
                        <span>自动导出每次生成的提示结构</span>
                    </label>
                </div>
                <div class="flex-container">
                    <label class="flex-container">
                        <input id="prompt_exporter_debug_mode" type="checkbox">
                        <span>调试模式（日志详细）</span>
                    </label>
                </div>
                <div class="flex-container">
                    <input id="export_prompt_struct_button" class="menu_button" type="button" value="导出最近的提示结构" />
                </div>
                <div id="last_export_info" class="flex-container" style="font-size: 0.8em; margin-top: 10px; display: none;">
                    <span>最后导出: </span>
                    <span id="last_export_path"></span>
                </div>
                <hr class="sysHR" />
            </div>
        </div>
    </div>`;
    
    // 添加设置到扩展设置区域
    $("#extensions_settings").append(settingsHtml);
    
    // 绑定UI事件
    $("#prompt_exporter_enabled").on("input", function() {
        extension_settings[extensionName].enabled = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $("#prompt_exporter_auto_export").on("input", function() {
        extension_settings[extensionName].autoExport = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    $("#prompt_exporter_debug_mode").on("input", function() {
        extension_settings[extensionName].debugMode = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    
    // 导出按钮点击事件
    $("#export_prompt_struct_button").on("click", function() {
        if (!extension_settings[extensionName].enabled) {
            toastr.warning("请先启用导出功能", "提示");
            return;
        }
        
        if (!lastChatData) {
            toastr.error("没有可用的提示结构数据，请先发送消息", "错误");
            return;
        }
        
        exportPromptStruct(lastChatData);
        
        // 显示最后导出信息
        if (extension_settings[extensionName].lastExportPath) {
            $("#last_export_path").text(extension_settings[extensionName].lastExportPath);
            $("#last_export_info").show();
        }
    });
    
    // 加载设置
    await loadSettings();
    
    // 注册事件
    registerEventListeners();
    
    // 初始化UI状态
    if (extension_settings[extensionName].lastExportPath) {
        $("#last_export_path").text(extension_settings[extensionName].lastExportPath);
        $("#last_export_info").show();
    }
    
    logDebug("插件初始化完成");
});
