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
        
        // 创建JSON字符串，处理循环引用和特殊对象
        const jsonData = JSON.stringify(data, (key, value) => {
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

// 插件初始化
jQuery(async () => {
    try {
        logInfo("初始化Prompt结构导出增强版插件...");
        
        // 创建设置UI
        const settingsHtml = `
        <div id="prompt_structure_exporter" class="prompt-exporter-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Prompt结构导出增强版</b>
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
        
        // 注册插件API处理器
        registerPluginAPI();
        
        // 加载设置
        loadSettings();
        
        logInfo("Prompt结构导出增强版插件初始化完成");
        
    } catch (error) {
        logError("初始化插件时出错", error);
    }
});

/**
 * 核心功能：注册插件API，用于捕获prompt_struct
 */
function registerPluginAPI() {
    try {
        // 确保全局变量存在
        window.SillyTavern = window.SillyTavern || {};
        window.SillyTavern.Extensions = window.SillyTavern.Extensions || {};
        
        // 定义插件接口
        window.SillyTavern.Extensions[extensionName] = {
            // 插件接口定义
            interfaces: {
                chat: {
                    // 添加GetPrompt处理器，这将在buildPromptStruct过程中被调用
                    GetPrompt: async (arg, prompt_struct, detail_level) => {
                        if (!extension_settings[extensionName].enabled) {
                            return { text: [], additional_chat_log: [], extension: {} };
                        }

                        try {
                            const debugMode = extension_settings[extensionName].debugMode;
                            
                            // 记录完整的prompt_struct
                            if (debugMode) {
                                logInfo("GetPrompt被调用，捕获到完整的prompt_struct");
                                console.log("完整的prompt_struct:", prompt_struct);
                                
                                // 检查结构完整性
                                if (prompt_struct) {
                                    if (prompt_struct.char_prompt) {
                                        logInfo(`角色提示词: ${JSON.stringify(prompt_struct.char_prompt.text?.length || 0)} 个文本段落`);
                                    }
                                    
                                    if (prompt_struct.user_prompt) {
                                        logInfo(`用户提示词: ${JSON.stringify(prompt_struct.user_prompt.text?.length || 0)} 个文本段落`);
                                    }
                                    
                                    if (prompt_struct.world_prompt) {
                                        logInfo(`世界提示词: ${JSON.stringify(prompt_struct.world_prompt.text?.length || 0)} 个文本段落`);
                                    }
                                    
                                    // 检查聊天记录
                                    if (prompt_struct.chat_log) {
                                        logInfo(`聊天记录: ${prompt_struct.chat_log.length} 条消息`);
                                        
                                        // 检查角色定义问题
                                        const problemEntries = prompt_struct.chat_log.filter(entry => !entry.role || entry.role === 'undefined');
                                        if (problemEntries.length > 0) {
                                            logWarning(`发现 ${problemEntries.length} 条没有角色定义的聊天记录项`);
                                        }
                                    }
                                }
                            }
                            
                            // 保存最新的提示词数据
                            lastExportData = {
                                timestamp: new Date().toISOString(),
                                prompt_structure: prompt_struct,
                                request_arguments: arg
                            };
                            
                            // 如果启用了自动导出，则自动导出
                            if (extension_settings[extensionName].autoExport) {
                                logInfo("自动导出已启用，正在导出数据...");
                                exportPromptStructure(lastExportData);
                            }
                            
                            // 返回空的single_part_prompt_t，不影响原有提示词
                            return { text: [], additional_chat_log: [], extension: {} };
                        } catch (error) {
                            logError("处理提示词时出错", error);
                            return { text: [], additional_chat_log: [], extension: {} };
                        }
                    }
                }
            }
        };
        
        // 尝试监听可能通过事件暴露的提示词结构
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (eventData) => {
            if (!extension_settings[extensionName].enabled) {
                return;
            }
            
            const debugMode = extension_settings[extensionName].debugMode;
            
            if (debugMode) {
                logInfo("CHAT_COMPLETION_PROMPT_READY事件触发");
                console.log("事件数据:", eventData);
            }
            
            // 如果lastExportData还没有被设置(通过插件API)，尝试从事件中提取
            if (!lastExportData && eventData && eventData.prompt_struct) {
                logInfo("从事件中提取到提示词结构");
                lastExportData = {
                    timestamp: new Date().toISOString(),
                    prompt_structure: eventData.prompt_struct,
                    event_source: "CHAT_COMPLETION_PROMPT_READY"
                };
                
                if (extension_settings[extensionName].autoExport) {
                    exportPromptStructure(lastExportData);
                }
            }
        });
        
        // 安装文件系统API钩子
        hookFileSystem();
        
        logInfo("插件API和事件监听器注册完成");
    } catch (error) {
        logError("注册插件API时出错", error);
    }
}

/**
 * 尝试钩住关键文件系统函数以捕获提示词结构
 */
function hookFileSystem() {
    try {
        const originalSendRequest = window.sendRequest || window.fetch;
        
        // 替换全局的sendRequest函数(如果存在)
        if (window.sendRequest) {
            window.sendRequest = async function(endpoint, data, callback) {
                const debugMode = extension_settings[extensionName].enabled && extension_settings[extensionName].debugMode;
                
                // 如果是生成请求，并且包含prompt_struct
                if (endpoint.includes("/generate") && data && (data.prompt_struct || data.promptStruct)) {
                    if (debugMode) {
                        logInfo(`检测到生成请求: ${endpoint}`);
                        console.log("请求数据:", data);
                    }
                    
                    const promptStruct = data.prompt_struct || data.promptStruct;
                    if (promptStruct) {
                        logInfo("从请求中捕获到提示词结构");
                        lastExportData = {
                            timestamp: new Date().toISOString(),
                            prompt_structure: promptStruct,
                            request_endpoint: endpoint,
                            request_data: data
                        };
                        
                        if (extension_settings[extensionName].autoExport) {
                            exportPromptStructure(lastExportData);
                        }
                    }
                }
                
                // 调用原始函数
                return originalSendRequest.apply(this, arguments);
            };
            
            logInfo("sendRequest函数钩子安装完成");
        }
        
        // 替换全局的fetch函数
        window.fetch = async function(resource, options) {
            const debugMode = extension_settings[extensionName].enabled && extension_settings[extensionName].debugMode;
            
            // 如果是POST请求，尝试检查请求体
            if (options && options.method === 'POST' && options.body) {
                const url = typeof resource === 'string' ? resource : resource.url;
                
                // 如果是生成API请求
                if (url.includes("/generate") || url.includes("/chat-completions")) {
                    try {
                        let requestData;
                        
                        // 处理不同类型的请求体
                        if (typeof options.body === 'string') {
                            requestData = JSON.parse(options.body);
                        } else if (options.body instanceof FormData) {
                            // 处理FormData
                            for (const pair of options.body.entries()) {
                                if (pair[0] === 'data' || pair[0] === 'prompt_struct') {
                                    try {
                                        requestData = JSON.parse(pair[1]);
                                    } catch (e) {
                                        // 忽略解析错误
                                    }
                                }
                            }
                        }
                        
                        if (debugMode) {
                            logInfo(`检测到API请求: ${url}`);
                            console.log("请求数据:", requestData);
                        }
                        
                        // 提取提示词结构
                        if (requestData) {
                            const promptStruct = requestData.prompt_struct || 
                                                requestData.promptStruct || 
                                                requestData.prompt || 
                                                requestData.data?.prompt_struct;
                                                
                            if (promptStruct) {
                                logInfo("从fetch请求中捕获到提示词结构");
                                lastExportData = {
                                    timestamp: new Date().toISOString(),
                                    prompt_structure: promptStruct,
                                    request_url: url,
                                    request_data: requestData
                                };
                                
                                if (extension_settings[extensionName].autoExport) {
                                    exportPromptStructure(lastExportData);
                                }
                            }
                        }
                    } catch (error) {
                        if (debugMode) {
                            logWarning(`解析fetch请求数据时出错: ${error.message}`);
                        }
                    }
                }
            }
            
            // 调用原始fetch函数
            return originalSendRequest.apply(this, arguments);
        };
        
        logInfo("fetch函数钩子安装完成");
        
    } catch (error) {
        logError("安装文件系统钩子时出错", error);
    }
}
