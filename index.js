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
        
        // 创建JSON字符串，使用函数处理循环引用问题
        const jsonData = JSON.stringify(data, (key, value) => {
            // 处理Buffer对象，将其转换为base64字符串
            if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
                return {
                    _type: 'Buffer',
                    data: btoa(String.fromCharCode.apply(null, value.data))
                };
            }
            
            // 处理Date对象
            if (value instanceof Date) {
                return {
                    _type: 'Date',
                    value: value.toISOString()
                };
            }
            
            return value;
        }, 2);
        
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

// 单独处理提示词结构，确保捕获完整的single_part_prompt_t
function processPromptStructure(data) {
    try {
        if (!data) {
            logWarning("处理提示词结构时收到空数据");
            return null;
        }
        
        const debugMode = extension_settings[extensionName].debugMode;
        
        // 尝试提取完整的prompt_struct_t
        let promptStruct = null;
        
        // 尝试从不同属性中提取prompt结构
        if (data.prompt_struct) {
            promptStruct = data.prompt_struct;
            logInfo("从prompt_struct属性找到提示词结构");
        } else if (data.promptStruct) {
            promptStruct = data.promptStruct;
            logInfo("从promptStruct属性找到提示词结构");
        } else if (data.request && data.request.prompt_struct) {
            promptStruct = data.request.prompt_struct;
            logInfo("从request.prompt_struct属性找到提示词结构");
        } else {
            // 如果没有明确的prompt_struct，则保存整个数据并添加警告
            promptStruct = data;
            logWarning("未找到明确的prompt_struct属性，保存整个事件数据");
        }
        
        // 检查结构完整性
        if (promptStruct) {
            const result = {
                timestamp: new Date().toISOString(),
                captured_data: data,  // 保存原始捕获数据，以备调试
                prompt_structure: promptStruct
            };
            
            // 如果开启了调试模式，记录更详细的信息
            if (debugMode) {
                logInfo("调试模式已开启，记录详细信息");
                console.log("完整的提示词结构:", promptStruct);
                
                // 检查并记录关键组件
                if (promptStruct.char_prompt) {
                    logInfo(`角色提示词: 包含 ${promptStruct.char_prompt.text?.length || 0} 个文本段落`);
                    if (promptStruct.char_prompt.text) {
                        promptStruct.char_prompt.text.forEach((text, index) => {
                            logInfo(`  - 文本段落 ${index+1}: ${text.description}, 重要度: ${text.important}`);
                        });
                    }
                }
                
                if (promptStruct.user_prompt) {
                    logInfo(`用户提示词: 包含 ${promptStruct.user_prompt.text?.length || 0} 个文本段落`);
                }
                
                if (promptStruct.world_prompt) {
                    logInfo(`世界提示词: 包含 ${promptStruct.world_prompt.text?.length || 0} 个文本段落`);
                }
                
                // 检查是否有角色定义问题
                const chatLog = promptStruct.chat_log || [];
                const problemEntries = chatLog.filter(entry => !entry.role || entry.role === 'undefined');
                if (problemEntries.length > 0) {
                    logWarning(`发现 ${problemEntries.length} 条没有角色定义的聊天记录项`);
                }
            }
            
            return result;
        } else {
            logWarning("未能提取有效的提示词结构");
            return {
                timestamp: new Date().toISOString(),
                error: "无法提取有效的提示词结构",
                raw_data: data
            };
        }
    } catch (error) {
        logError("处理提示词结构时出错", error);
        return {
            timestamp: new Date().toISOString(),
            error: `处理提示词结构出错: ${error.message}`,
            stack: error.stack
        };
    }
}

// 事件监听器 - 当提示词准备好时
function onPromptReady(eventData) {
    try {
        if (!extension_settings[extensionName].enabled) {
            return;
        }
        
        const { dryRun } = eventData;
        
        // 如果是dry run，不处理
        if (dryRun) {
            logInfo("跳过干运行(dryRun)事件");
            return;
        }
        
        logInfo("捕获到提示词就绪事件");
        
        // 处理并保存提示词结构
        lastExportData = processPromptStructure(eventData);
        
        // 如果启用了自动导出，则自动导出
        if (extension_settings[extensionName].autoExport && lastExportData) {
            logInfo("自动导出已启用，正在导出数据...");
            exportPromptStructure(lastExportData);
        }
    } catch (error) {
        logError("处理提示词就绪事件时出错", error);
    }
}

// 尝试捕获ReplyAPI的请求构建过程
function setupAPIHooks() {
    try {
        logInfo("设置API钩子...");
        
        // 尝试钩住可能包含prompt_struct的API调用
        // 这里需要根据SillyTavern实际实现来调整
        
        // 监听fetch请求
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = args[0];
            const options = args[1] || {};
            
            // 只处理POST请求，可能包含提示词结构
            if (options.method === 'POST' && typeof url === 'string') {
                try {
                    // 克隆请求体以避免影响原始请求
                    if (options.body) {
                        const bodyClone = options.body.clone ? await options.body.clone() : options.body;
                        
                        // 如果是JSON格式
                        if (typeof bodyClone === 'string' && bodyClone.startsWith('{')) {
                            const bodyData = JSON.parse(bodyClone);
                            
                            // 如果包含prompt_struct结构
                            if (bodyData.prompt_struct || bodyData.promptStruct) {
                                logInfo(`捕获到API请求中的提示词结构: ${url}`);
                                lastExportData = processPromptStructure(bodyData);
                                
                                if (extension_settings[extensionName].autoExport && lastExportData) {
                                    exportPromptStructure(lastExportData);
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 忽略解析错误，不影响原始请求
                    logWarning(`解析API请求时出错: ${e.message}`);
                }
            }
            
            // 继续原始fetch调用
            return originalFetch.apply(this, args);
        };
        
        logInfo("API钩子设置完成");
    } catch (error) {
        logError("设置API钩子时出错", error);
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
                        <label class="checkbox_label flex-container">
                            <input id="prompt_exporter_debug" type="checkbox" />
                            <span>调试模式 (更详细的日志)</span>
                        </label>
                        <div class="flex-container flexGap5">
                            <input id="prompt_exporter_export" class="menu_button" type="button" value="导出最新提示词结构" />
                        </div>
                        <div id="prompt_exporter_last_time" class="flex-container">尚未导出</div>
                        <div class="prompt-exporter-info">
                            <p>提示: 如果无法捕获完整结构，请尝试开启调试模式并查看控制台输出</p>
                            <p>如果出现"Message role not set"警告，这表明提示词结构中存在未设置角色的消息</p>
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
        
        // 监听提示词就绪事件
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onPromptReady);
        
        // 额外监听可能包含完整结构的事件
        if (event_types.FINAL_PROMPT) {
            eventSource.on(event_types.FINAL_PROMPT, onPromptReady);
            logInfo("监听FINAL_PROMPT事件");
        }
        
        // 设置API钩子
        setupAPIHooks();
        
        // 加载设置
        loadSettings();
        
        logInfo("Prompt结构导出插件初始化完成");
        
    } catch (error) {
        logError("初始化插件时出错", error);
    }
});
