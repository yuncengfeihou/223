import { extension_settings, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 定义插件名称和设置
const extensionName = "prompt-structure-exporter";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
let lastExportData = null;
let lastExportTime = null;

// 日志函数
function logInfo(message) {
    console.log(`[${extensionName}] INFO: ${message}`);
}

function logError(message, error) {
    console.error(`[${extensionName}] ERROR: ${message}`, error);
    toastr.error(message, "Prompt结构导出插件");
}

function logWarning(message) {
    console.warn(`[${extensionName}] WARNING: ${message}`);
    toastr.warning(message, "Prompt结构导出插件");
}

// 默认设置
const defaultSettings = {
    enabled: true,
    autoExport: false,
    exportPath: "",
    lastExportTime: null
};

// 加载设置
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    // 更新UI以反映当前设置
    $('#prompt_exporter_enabled').prop('checked', extension_settings[extensionName].enabled);
    $('#prompt_exporter_auto').prop('checked', extension_settings[extensionName].autoExport);
    $('#prompt_exporter_path').val(extension_settings[extensionName].exportPath);
    
    if (extension_settings[extensionName].lastExportTime) {
        lastExportTime = new Date(extension_settings[extensionName].lastExportTime);
        updateLastExportTime();
    }
}

// 更新最后导出时间的显示
function updateLastExportTime() {
    if (lastExportTime) {
        const timeStr = lastExportTime.toLocaleString();
        $('#prompt_exporter_last_time').text(`最后导出: ${timeStr}`);
    } else {
        $('#prompt_exporter_last_time').text('尚未导出');
    }
}

// 导出数据到文件
function exportPromptStructure(data) {
    try {
        if (!data) {
            logWarning("没有可导出的数据");
            return;
        }
        
        logInfo("准备导出数据...");
        
        // 创建文件名 (当前时间戳)
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const filename = `prompt_structure_${timestamp}.json`;
        
        // 创建JSON字符串
        const jsonData = JSON.stringify(data, null, 2);
        
        // 创建Blob对象
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        // 触发下载
        document.body.appendChild(a);
        a.click();
        
        // 清理
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // 更新状态
        lastExportTime = new Date();
        extension_settings[extensionName].lastExportTime = lastExportTime.toISOString();
        updateLastExportTime();
        saveSettingsDebounced();
        
        logInfo(`数据已导出到文件: ${filename}`);
        toastr.success(`提示词结构已导出到 ${filename}`, "导出成功");
        
    } catch (error) {
        logError("导出数据时出错", error);
    }
}

// 处理导出按钮点击事件
function onExportButtonClick() {
    logInfo("导出按钮被点击");
    if (lastExportData) {
        exportPromptStructure(lastExportData);
    } else {
        logWarning("没有捕获到提示词数据，请尝试发送一条消息后再导出");
        toastr.warning("没有捕获到提示词数据，请尝试发送一条消息后再导出", "导出失败");
    }
}

// 事件监听器 - 当提示词准备好时
function onPromptReady(eventData) {
    try {
        if (!extension_settings[extensionName].enabled) {
            return;
        }
        
        const { chat, dryRun } = eventData;
        
        // 如果是dry run，不处理
        if (dryRun) {
            return;
        }
        
        logInfo("捕获到提示词就绪事件");
        
        // 保存最新的提示词数据
        lastExportData = {
            timestamp: new Date().toISOString(),
            prompt_structure: eventData
        };
        
        // 如果启用了自动导出，则自动导出
        if (extension_settings[extensionName].autoExport) {
            logInfo("自动导出已启用，正在导出数据...");
            exportPromptStructure(lastExportData);
        }
    } catch (error) {
        logError("处理提示词就绪事件时出错", error);
    }
}

// 设置更改处理函数
function onEnabledChange() {
    extension_settings[extensionName].enabled = $('#prompt_exporter_enabled').prop('checked');
    saveSettingsDebounced();
    logInfo(`插件${extension_settings[extensionName].enabled ? '已启用' : '已禁用'}`);
}

function onAutoExportChange() {
    extension_settings[extensionName].autoExport = $('#prompt_exporter_auto').prop('checked');
    saveSettingsDebounced();
    logInfo(`自动导出${extension_settings[extensionName].autoExport ? '已启用' : '已禁用'}`);
}

function onExportPathChange() {
    extension_settings[extensionName].exportPath = $('#prompt_exporter_path').val();
    saveSettingsDebounced();
}

// 插件初始化
jQuery(async () => {
    try {
        logInfo("初始化Prompt结构导出插件...");
        
        // 创建设置UI
        const settingsHtml = `
        <div id="prompt_structure_exporter" class="prompt-exporter-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Prompt结构导出</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="prompt-exporter-block flex-container">
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_enabled" type="checkbox" />
                            <span>启用插件</span>
                        </label>
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_auto" type="checkbox" />
                            <span>自动导出 (每次发送消息时)</span>
                        </label>
                        <div class="flex-container flexGap5">
                            <input id="prompt_exporter_export" class="menu_button" type="button" value="导出最新提示词结构" />
                        </div>
                        <div id="prompt_exporter_last_time" class="flex-container">尚未导出</div>
                    </div>
                    <hr class="sysHR" />
                </div>
            </div>
        </div>`;
        
        // 添加设置到UI
        $("#extensions_settings").append(settingsHtml);
        
        // 绑定事件
        $("#prompt_exporter_enabled").on("input", onEnabledChange);
        $("#prompt_exporter_auto").on("input", onAutoExportChange);
        $("#prompt_exporter_export").on("click", onExportButtonClick);
        
        // 监听提示词就绪事件
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onPromptReady);
        
        // 加载设置
        loadSettings();
        
        logInfo("Prompt结构导出插件初始化完成");
        
    } catch (error) {
        logError("初始化插件时出错", error);
    }
});
