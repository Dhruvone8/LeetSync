// Content script to monitor LeetCode submissions - FIXED WITH MAIN WORLD INJECTION

let lastSubmittedCode = null;
let isSubmitting = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 10;

console.log('🚀 LeetCode GitHub Sync Extension Loaded');

// Inject code extractor into page's main world to access Monaco
function injectCodeExtractor() {
    // Check if already injected
    if (document.getElementById('leetcode-sync-injected')) {
        return;
    }

    const script = document.createElement('script');
    script.id = 'leetcode-sync-injected';
    script.textContent = `
        (function() {
            // Function to extract code from Monaco editor
            window.__leetcodeSyncExtractCode = function() {
                console.log('🔍 [Injected] Extracting code from Monaco...');
                
                try {
                    if (window.monaco && window.monaco.editor) {
                        // Try getEditors first - GET THE LONGEST CODE
                        try {
                            const editors = window.monaco.editor.getEditors();
                            console.log('[Injected] Found', editors.length, 'editors');
                            
                            let longestCode = '';
                            
                            for (let i = 0; i < editors.length; i++) {
                                try {
                                    const editor = editors[i];
                                    const model = editor.getModel();
                                    if (model) {
                                        const code = model.getValue();
                                        console.log('[Injected] Editor ' + i + ' length:', code.length);
                                        
                                        if (code && code.length > longestCode.length) {
                                            longestCode = code;
                                        }
                                    }
                                } catch (e) {
                                    console.log('[Injected] Editor ' + i + ' error:', e.message);
                                    continue;
                                }
                            }
                            
                            if (longestCode.length > 20) {
                                console.log('[Injected] ✅ Extracted from getEditors (' + longestCode.length + ' chars)');
                                return longestCode;
                            }
                        } catch (e) {
                            console.log('[Injected] getEditors failed:', e.message);
                        }
                        
                        // Try getModels
                        try {
                            const models = window.monaco.editor.getModels();
                            console.log('[Injected] Found', models.length, 'models');
                            
                            let longestCode = '';
                            
                            for (let i = 0; i < models.length; i++) {
                                try {
                                    const model = models[i];
                                    const code = model.getValue();
                                    console.log('[Injected] Model ' + i + ' length:', code.length);
                                    
                                    if (code && code.length > longestCode.length) {
                                        longestCode = code;
                                    }
                                } catch (e) {
                                    console.log('[Injected] Model ' + i + ' error:', e.message);
                                    continue;
                                }
                            }
                            
                            if (longestCode.length > 20) {
                                console.log('[Injected] ✅ Extracted from getModels (' + longestCode.length + ' chars)');
                                return longestCode;
                            }
                        } catch (e) {
                            console.log('[Injected] getModels failed:', e.message);
                        }
                    } else {
                        console.log('[Injected] Monaco not available');
                    }
                } catch (error) {
                    console.error('[Injected] Error:', error);
                }
                
                return null;
            };
            
            // Listen for extraction requests from content script
            window.addEventListener('leetcode-sync-extract-code', function(e) {
                const requestId = e.detail.requestId;
                const code = window.__leetcodeSyncExtractCode();
                
                // Send response back
                window.dispatchEvent(new CustomEvent('leetcode-sync-code-response', {
                    detail: { requestId: requestId, code: code }
                }));
            });
            
            console.log('✅ [Injected] LeetCode Sync code extractor ready');
        })();
    `;

    (document.head || document.documentElement).appendChild(script);
    console.log('✅ Injected code extractor into main world');
}

// Wait for element to appear
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeout);
    });
}

// Extract problem information - FIXED NUMBER EXTRACTION
async function extractProblemInfo() {
    console.log('📋 Attempting to extract problem info...');

    try {
        // Wait for title element
        const titleElement = await waitForElement('[data-cy="question-title"], .text-title-large, div[class*="text-title"]', 5000);

        if (!titleElement) {
            console.error('❌ Title element not found');
            return null;
        }

        const title = titleElement.textContent.trim();
        console.log('📌 Found title:', title);

        // Extract problem number and name
        let problemNumber = '';
        let problemName = '';

        // Parse "802. Find Eventual Safe States" format
        if (title.includes('.')) {
            const dotIndex = title.indexOf('.');
            problemNumber = title.substring(0, dotIndex).trim();
            problemName = title.substring(dotIndex + 1).trim();
            console.log('📝 Parsed - Number:', problemNumber, 'Name:', problemName);
        } else {
            // Fallback
            const numberMatch = title.match(/^(\d+)/);
            problemNumber = numberMatch ? numberMatch[1] : '0';
            problemName = title.replace(/^\d+\.?\s*/, '');
        }

        // Extract difficulty
        let difficulty = 'medium';

        const difficultyElement = document.querySelector('[diff]') ||
            document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
            Array.from(document.querySelectorAll('div, span')).find(el => {
                const text = el.textContent.toLowerCase().trim();
                return (text === 'easy' || text === 'medium' || text === 'hard') && el.textContent.length < 10;
            });

        if (difficultyElement) {
            const diffText = difficultyElement.textContent.toLowerCase();
            console.log('🎯 Difficulty:', diffText);
            if (diffText.includes('easy')) difficulty = 'easy';
            else if (diffText.includes('hard')) difficulty = 'hard';
            else if (diffText.includes('medium')) difficulty = 'medium';
        }

        // Clean problem name for filename
        const cleanName = problemName
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '')
            .trim();

        const result = {
            number: problemNumber,
            name: cleanName,
            difficulty: difficulty,
            fullTitle: title
        };

        console.log('✅ Extracted:', result);
        return result;

    } catch (error) {
        console.error('❌ Error extracting problem info:', error);
        return null;
    }
}

// Extract code using injected script (main world) with fallback to DOM
function extractCode() {
    return new Promise((resolve) => {
        console.log('💻 Extracting code...');

        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        let resolved = false;

        // Set up listener for response from injected script
        const responseHandler = (e) => {
            if (e.detail.requestId === requestId && !resolved) {
                resolved = true;
                window.removeEventListener('leetcode-sync-code-response', responseHandler);

                const code = e.detail.code;
                if (code && code.length > 20) {
                    console.log('✅ Got code from injected script (' + code.length + ' chars)');
                    resolve(code);
                } else {
                    console.log('⚠️ Injected script returned no code, trying DOM fallback...');
                    resolve(extractCodeFromDOM());
                }
            }
        };

        window.addEventListener('leetcode-sync-code-response', responseHandler);

        // Send extraction request to injected script
        window.dispatchEvent(new CustomEvent('leetcode-sync-extract-code', {
            detail: { requestId: requestId }
        }));

        // Timeout fallback after 1 second
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                window.removeEventListener('leetcode-sync-code-response', responseHandler);
                console.log('⚠️ Injected script timeout, trying DOM fallback...');
                resolve(extractCodeFromDOM());
            }
        }, 1000);
    });
}

// DOM-based code extraction fallback
function extractCodeFromDOM() {
    console.log('🔍 Trying DOM extraction...');

    try {
        // Method 1: Monaco view-lines
        const viewLines = document.querySelectorAll('.view-line');
        console.log('Found', viewLines.length, 'view lines');

        if (viewLines.length > 0) {
            const lines = [];
            viewLines.forEach(line => {
                const lineText = line.textContent;
                lines.push(lineText);
            });

            const code = lines.join('\n');
            if (code && code.length > 20) {
                console.log('✅ Extracted from view-lines (' + code.length + ' chars)');
                return code;
            }
        }

        // Method 2: Monaco lines-content
        const linesContent = document.querySelector('.lines-content');
        if (linesContent) {
            const code = linesContent.textContent;
            if (code && code.length > 20) {
                console.log('✅ Extracted from lines-content (' + code.length + ' chars)');
                return code;
            }
        }

        // Method 3: CodeMirror (older LeetCode versions)
        const codeMirror = document.querySelector('.CodeMirror-code');
        if (codeMirror) {
            const lines = [];
            codeMirror.querySelectorAll('.CodeMirror-line').forEach(line => {
                lines.push(line.textContent);
            });
            const code = lines.join('\n');
            if (code && code.length > 20) {
                console.log('✅ Extracted from CodeMirror (' + code.length + ' chars)');
                return code;
            }
        }

        // Method 4: Textarea fallback
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
            if (textarea.value && textarea.value.length > 20) {
                console.log('✅ Extracted from textarea (' + textarea.value.length + ' chars)');
                return textarea.value;
            }
        }

        console.error('❌ No code found via DOM extraction');
        return null;

    } catch (error) {
        console.error('❌ DOM extraction error:', error);
        return null;
    }
}

// Detect language
function detectLanguage() {
    console.log('🔤 Detecting language...');

    try {
        const buttons = Array.from(document.querySelectorAll('button'));

        const languageButton = buttons.find(btn => {
            const text = btn.textContent;
            return text.match(/C\+\+|Java|Python|JavaScript|TypeScript|Go|Rust|C#|Ruby|Swift|Kotlin|Scala|PHP/i) &&
                !text.includes('Description') &&
                text.length < 30;
        });

        if (languageButton) {
            const langText = languageButton.textContent.toLowerCase().trim();
            console.log('🔤 Language text:', langText);

            const languageMap = {
                'c++': 'cpp', 'cpp': 'cpp',
                'java': 'java',
                'python': 'py', 'python3': 'py',
                'javascript': 'js',
                'typescript': 'ts',
                'c#': 'cs', 'csharp': 'cs',
                'go': 'go', 'golang': 'go',
                'rust': 'rs',
                'kotlin': 'kt',
                'swift': 'swift',
                'ruby': 'rb',
                'scala': 'scala',
                'php': 'php',
                'c': 'c'
            };

            for (const [key, ext] of Object.entries(languageMap)) {
                if (langText.includes(key)) {
                    console.log('✅ Detected:', ext);
                    return ext;
                }
            }
        }

        console.warn('⚠️ Default: cpp');
        return 'cpp';

    } catch (error) {
        console.error('❌ Error:', error);
        return 'cpp';
    }
}

// Monitor submit button
function monitorSubmitButton() {
    console.log('👀 Monitoring submit button...');

    let submitButtonFound = false;

    const observer = new MutationObserver(() => {
        if (submitButtonFound) return;

        const submitButton = document.querySelector('button[data-e2e-locator="console-submit-button"]') ||
            Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.trim().toLowerCase() === 'submit'
            );

        if (submitButton && !submitButton.dataset.monitored) {
            submitButton.dataset.monitored = 'true';
            submitButtonFound = true;
            console.log('✅ Submit button monitored');

            submitButton.addEventListener('click', async () => {
                console.log('🔔 SUBMIT CLICKED!');
                isSubmitting = true;

                // Wait for Monaco to update
                await new Promise(resolve => setTimeout(resolve, 300));

                const currentCode = await extractCode();
                const currentLang = detectLanguage();
                const currentProblem = await extractProblemInfo();

                console.log('📦 Captured data:');
                console.log('  - Code type:', typeof currentCode);
                console.log('  - Code length:', currentCode?.length || 0);
                console.log('  - Code valid:', !!(currentCode && typeof currentCode === 'string' && currentCode.length > 20));
                console.log('  - Language:', currentLang);
                console.log('  - Problem:', currentProblem?.fullTitle);
                console.log('  - Number:', currentProblem?.number);

                if (currentCode && typeof currentCode === 'string' && currentCode.length > 20 && currentLang && currentProblem) {
                    try {
                        sessionStorage.setItem('leetcode_pending_code', currentCode);
                        sessionStorage.setItem('leetcode_pending_language', currentLang);
                        sessionStorage.setItem('leetcode_pending_problem', JSON.stringify(currentProblem));

                        // Verify it was saved
                        const savedCode = sessionStorage.getItem('leetcode_pending_code');
                        console.log('💾 Saved to sessionStorage. Verification:', {
                            saved: !!savedCode,
                            length: savedCode?.length
                        });
                    } catch (e) {
                        console.error('❌ SessionStorage error:', e);
                    }
                } else {
                    console.error('❌ Invalid data on submit!', {
                        hasCode: !!currentCode,
                        codeType: typeof currentCode,
                        codeLength: currentCode?.length,
                        hasLang: !!currentLang,
                        hasProblem: !!currentProblem
                    });
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Monitor for accepted submissions
function monitorSubmissions() {
    console.log('👀 Monitoring submissions...');

    const observer = new MutationObserver((mutations) => {
        if (!isSubmitting) return;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;

                const text = node.textContent || '';
                const isAccepted = text.includes('Accepted') ||
                    node.querySelector?.('[class*="text-green"]')?.textContent?.includes('Accepted') ||
                    node.querySelector?.('[class*="success"]')?.textContent?.includes('Accepted');

                if (isAccepted) {
                    console.log('🎉 ACCEPTED!');

                    setTimeout(async () => {
                        console.log('⏱️ Processing submission...');

                        let code = sessionStorage.getItem('leetcode_pending_code');
                        let language = sessionStorage.getItem('leetcode_pending_language');
                        let problemJson = sessionStorage.getItem('leetcode_pending_problem');

                        console.log('📦 Retrieved from sessionStorage:');
                        console.log('  - Code type:', typeof code);
                        console.log('  - Code length:', code?.length);
                        console.log('  - Language:', language);
                        console.log('  - Problem JSON:', !!problemJson);

                        let problemInfo = null;
                        if (problemJson) {
                            try {
                                problemInfo = JSON.parse(problemJson);
                            } catch (e) {
                                console.error('Parse error:', e);
                            }
                        }

                        // Re-extract if needed with retries
                        if (!problemInfo) {
                            console.log('Re-extracting problem...');
                            problemInfo = await extractProblemInfo();
                        }

                        // Try multiple times to get code if needed
                        if (!code || !code.length) {
                            console.log('Re-extracting code...');
                            for (let attempt = 0; attempt < 3; attempt++) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                                code = await extractCode();
                                if (code && code.length > 20) {
                                    console.log(`✅ Got code on attempt ${attempt + 1}`);
                                    break;
                                }
                                console.log(`⏳ Attempt ${attempt + 1} failed, retrying...`);
                            }
                        }

                        if (!language) {
                            console.log('Re-detecting language...');
                            language = detectLanguage();
                        }

                        console.log('📊 Final data check:');
                        console.log('  - Problem number:', problemInfo?.number);
                        console.log('  - Problem name:', problemInfo?.name);
                        console.log('  - Difficulty:', problemInfo?.difficulty);
                        console.log('  - Language:', language);
                        console.log('  - Code length:', code?.length);
                        console.log('  - Has valid code:', !!(code && code.length > 20));

                        if (problemInfo && code && language && typeof code === 'string' && code.length > 20) {
                            const submissionData = {
                                ...problemInfo,
                                code: code,
                                language: language,
                                timestamp: new Date().toISOString()
                            };

                            console.log('📤 Sending to background...');

                            const codeHash = btoa(code).slice(0, 50);
                            if (codeHash !== lastSubmittedCode) {
                                lastSubmittedCode = codeHash;

                                chrome.runtime.sendMessage({
                                    type: 'SOLUTION_SUBMITTED',
                                    data: submissionData
                                }, (response) => {
                                    if (chrome.runtime.lastError) {
                                        console.error('❌ Send error:', chrome.runtime.lastError);
                                    } else {
                                        console.log('✅ Sent successfully!');
                                    }
                                });
                            }

                            sessionStorage.clear();
                        } else {
                            console.error('❌ Invalid data:', {
                                hasProblem: !!problemInfo,
                                hasCode: !!code,
                                codeLength: code?.length,
                                hasLang: !!language
                            });
                        }

                        isSubmitting = false;
                    }, 2000);

                    break;
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize
async function init() {
    console.log('🔧 Init (attempt ' + (initAttempts + 1) + ')');

    // Inject code extractor into main world first
    injectCodeExtractor();

    const problemInfo = await extractProblemInfo();

    if (problemInfo) {
        console.log('🎯 Monitoring:', problemInfo.fullTitle);
        monitorSubmitButton();
        monitorSubmissions();
        console.log('✅ Ready!');
        return true;
    } else {
        initAttempts++;
        if (initAttempts < MAX_INIT_ATTEMPTS) {
            console.log('⏳ Retry in 2s...');
            setTimeout(init, 2000);
        }
        return false;
    }
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
} else {
    setTimeout(init, 1000);
}

// Handle navigation
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('/problems/')) {
            console.log('🔄 Page changed');
            isSubmitting = false;
            lastSubmittedCode = null;
            initAttempts = 0;
            setTimeout(init, 1500);
        }
    }
}).observe(document, { subtree: true, childList: true });

console.log('✅ Script ready');