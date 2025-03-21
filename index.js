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
    lastExportTime: null,
    debugMode: false
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
    $('#prompt_exporter_debug').prop('checked', extension_settings[extensionName].debugMode);
    
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

// 处理JSON序列化中的循环引用问题
function stringifyWithCircularRefs() {
    const seen = new WeakSet();
    return (key, value) => {
        // 处理Buffer对象
        if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
            return {
                _type: 'Buffer',
                data: Array.from(value.data)
            };
        }
        
        // 处理Date对象
        if (value instanceof Date) {
            return {
                _type: 'Date',
                value: value.toISOString()
            };
        }
        
        // 处理循环引用
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular Reference]';
            }
            seen.add(value);
        }
        
        return value;
    };
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
        
        // 创建JSON字符串，处理循环引用
        const jsonData = JSON.stringify(data, stringifyWithCircularRefs(), 2);
        
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
        logError(`导出数据时出错: ${error.message}`, error);
        toastr.error(`导出失败: ${error.message}`, "导出错误");
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

function onDebugModeChange() {
    extension_settings[extensionName].debugMode = $('#prompt_exporter_debug').prop('checked');
    saveSettingsDebounced();
    logInfo(`调试模式${extension_settings[extensionName].debugMode ? '已启用' : '已禁用'}`);
}

// 安全地定义插件API
function definePluginAPI() {
    try {
        // 确保全局命名空间存在
        window.SillyTavern = window.SillyTavern || {};
        window.SillyTavern.Extensions = window.SillyTavern.Extensions || {};
        
        // 已经存在则不覆盖
        if (window.SillyTavern.Extensions[extensionName]) {
            logInfo("插件API已经存在，不再重复定义");
            return;
        }
        
        // 定义插件接口
        window.SillyTavern.Extensions[extensionName] = {
            name: "Prompt结构导出插件",
            // 插件接口定义
            interfaces: {
                chat: {
                    // 通过ReplyHandler捕获提示词结构
                    ReplyHandler: (reply, args) => {
                        if (!extension_settings[extensionName].enabled) {
                            return false; // 不阻断正常流程
                        }
                        
                        try {
                            const debugMode = extension_settings[extensionName].debugMode;
                            
                            if (debugMode) {
                                logInfo("ReplyHandler被调用");
                                console.log("Reply:", reply);
                                console.log("Args:", args);
                            }
                            
                            // 如果包含prompt_struct，保存它
                            if (args.prompt_struct) {
                                logInfo("从ReplyHandler捕获到提示词结构");
                                
                                // 深拷贝提示词结构，避免修改原始对象
                                const promptStructCopy = JSON.parse(JSON.stringify(args.prompt_struct));
                                
                                // 保存最新的提示词数据
                                lastExportData = {
                                    timestamp: new Date().toISOString(),
                                    prompt_structure: promptStructCopy,
                                    source: "ReplyHandler"
                                };
                                
                                // 如果启用了自动导出，则自动导出
                                if (extension_settings[extensionName].autoExport) {
                                    logInfo("自动导出已启用，正在导出数据...");
                                    exportPromptStructure(lastExportData);
                                }
                            } else if (debugMode) {
                                logWarning("ReplyHandler未找到prompt_struct");
                            }
                            
                        } catch (error) {
                            logError(`ReplyHandler出错: ${error.message}`, error);
                        }
                        
                        return false; // 不阻断正常流程
                    }
                }
            }
        };
        
        logInfo("插件API定义完成");
    } catch (error) {
        logError(`定义插件API出错: ${error.message}`, error);
    }
}

// 尝试在页面上显示调试信息
function createDebugPanel() {
    if (!extension_settings[extensionName].debugMode) {
        return;
    }
    
    // 如果已存在调试面板，则不再创建
    if ($("#prompt_exporter_debug_panel").length > 0) {
        return;
    }
    
    const debugPanelHtml = `
    <div id="prompt_exporter_debug_panel" class="prompt-exporter-debug-panel">
        <div class="prompt-exporter-debug-header">
            <h3>提示词结构导出 - 调试面板</h3>
            <button id="prompt_exporter_debug_close" class="prompt-exporter-debug-close">X</button>
        </div>
        <div class="prompt-exporter-debug-content">
            <div class="prompt-exporter-debug-info">未捕获到数据</div>
        </div>
    </div>`;
    
    $("body").append(debugPanelHtml);
    
    // 绑定关闭按钮事件
    $("#prompt_exporter_debug_close").on("click", () => {
        $("#prompt_exporter_debug_panel").hide();
    });
    
    // 默认隐藏
    $("#prompt_exporter_debug_panel").hide();
}

// 更新调试面板内容
function updateDebugPanel() {
    if (!extension_settings[extensionName].debugMode) {
        return;
    }
    
    const $debugPanel = $("#prompt_exporter_debug_panel");
    if ($debugPanel.length === 0) {
        return;
    }
    
    if (!lastExportData) {
        $debugPanel.find(".prompt-exporter-debug-info").text("未捕获到数据");
        return;
    }
    
    let debugInfo = "捕获到提示词结构:\n\n";
    
    try {
        const promptStruct = lastExportData.prompt_structure;
        
        if (promptStruct.char_prompt) {
            debugInfo += `角色提示词: ${promptStruct.char_prompt.text?.length || 0} 个文本段落\n`;
            
            if (promptStruct.char_prompt.text) {
                promptStruct.char_prompt.text.forEach((text, index) => {
                    debugInfo += `  - 文本段落 ${index+1}: ${text.description}, 重要度: ${text.important}\n`;
                });
            }
        }
        
        if (promptStruct.user_prompt) {
            debugInfo += `\n用户提示词: ${promptStruct.user_prompt.text?.length || 0} 个文本段落\n`;
        }
        
        if (promptStruct.world_prompt) {
            debugInfo += `\n世界提示词: ${promptStruct.world_prompt.text?.length || 0} 个文本段落\n`;
        }
        
        if (promptStruct.chat_log) {
            debugInfo += `\n聊天记录: ${promptStruct.chat_log.length} 条消息\n`;
            
            // 检查角色定义问题
            const problemEntries = promptStruct.chat_log.filter(entry => !entry.role || entry.role === 'undefined');
            if (problemEntries.length > 0) {
                debugInfo += `警告: 发现 ${problemEntries.length} 条没有角色定义的聊天记录项\n`;
            }
        }
    } catch (error) {
        debugInfo += `解析提示词结构出错: ${error.message}\n`;
    }
    
    $debugPanel.find(".prompt-exporter-debug-content").html(`<pre>${debugInfo}</pre>`);
    $debugPanel.show();
}

// 安全地设置事件监听器
function setupEventListeners() {
    try {
        // 监听提示词就绪事件
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (eventData) => {
            if (!extension_settings[extensionName].enabled) {
                return;
            }
            
            const debugMode = extension_settings[extensionName].debugMode;
            
            if (debugMode) {
                logInfo("CHAT_COMPLETION_PROMPT_READY事件触发");
                console.log("事件数据:", eventData);
            }
            
            // 尝试从事件中提取提示词结构
            if (eventData && (eventData.prompt_struct || eventData.promptStruct)) {
                const promptStruct = eventData.prompt_struct || eventData.promptStruct;
                
                if (promptStruct) {
                    logInfo("从事件中捕获到提示词结构");
                    
                    // 深拷贝提示词结构，避免修改原始对象
                    try {
                        const promptStructCopy = JSON.parse(JSON.stringify(promptStruct));
                        
                        lastExportData = {
                            timestamp: new Date().toISOString(),
                            prompt_structure: promptStructCopy,
                            source: "CHAT_COMPLETION_PROMPT_READY"
                        };
                        
                        if (extension_settings[extensionName].autoExport) {
                            exportPromptStructure(lastExportData);
                        }
                        
                        updateDebugPanel();
                    } catch (error) {
                        logError(`复制提示词结构时出错: ${error.message}`, error);
                    }
                }
            } else if (debugMode) {
                logWarning("事件中未找到提示词结构");
            }
        });
        
        logInfo("事件监听器设置完成");
    } catch (error) {
        logError(`设置事件监听器出错: ${error.message}`, error);
    }
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
                    <b>Prompt结构导出插件</b>
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
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_debug" type="checkbox" />
                            <span>调试模式 (更详细的日志)</span>
                        </label>
                        <div class="flex-container flexGap5">
                            <input id="prompt_exporter_export" class="menu_button" type="button" value="导出最新提示词结构" />
                        </div>
                        <div id="prompt_exporter_last_time" class="flex-container">尚未导出</div>
                        <div class="prompt-exporter-info">
                            <p>使用方法: 启用插件后，发送一条消息，然后点击"导出最新提示词结构"按钮。</p>
                            <p>如果发生错误或者无法捕获提示词结构，请开启调试模式并查看控制台输出。</p>
                            <p>插件使用ReplyHandler接口捕获提示词结构，不会干扰正常的API请求流程。</p>
                        </div>
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
        $("#prompt_exporter_debug").on("input", onDebugModeChange);
        $("#prompt_exporter_export").on("click", onExportButtonClick);
        
        // 定义插件API
        definePluginAPI();
        
        // 设置事件监听器
        setupEventListeners();
        
        // 创建调试面板
        createDebugPanel();
        
        // 加载设置
        loadSettings();
        
        logInfo("Prompt结构导出插件初始化完成");
        
    } catch (error) {
        logError(`初始化插件时出错: ${error.message}`, error);
    }
});
