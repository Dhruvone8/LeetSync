// Content script to monitor LeetCode submissions - ROBUST VERSION

let lastSubmittedCode = null;
let isSubmitting = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 10;

console.log('🚀 LeetCode GitHub Sync Extension Loaded');

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

// Extract problem information from the page
async function extractProblemInfo() {
    console.log('📋 Attempting to extract problem info...');
    
    try {
        // Wait for title element to appear
        const titleElement = await waitForElement('[data-cy="question-title"], .text-title-large, div[class*="text-title"], a[href*="/problems/"]', 5000);
        
        if (!titleElement) {
            console.error('❌ Could not find title element after waiting');
            
            // Fallback: extract from URL
            const urlMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
            if (urlMatch) {
                const slug = urlMatch[1];
                const problemName = slug.split('-').map(w => 
                    w.charAt(0).toUpperCase() + w.slice(1)
                ).join('');
                
                console.log('⚠️ Using URL-based fallback');
                return {
                    number: '0',
                    name: problemName,
                    difficulty: 'medium',
                    fullTitle: problemName
                };
            }
            return null;
        }

        const title = titleElement.textContent.trim();
        console.log('📌 Found title:', title);
        
        // Extract problem number and name
        let problemNumber = '';
        let problemName = '';
        
        if (title.includes('.')) {
            const parts = title.split('.');
            problemNumber = parts[0].trim();
            problemName = parts.slice(1).join('.').trim();
        } else {
            // Extract from URL
            const urlMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
            if (urlMatch) {
                const slug = urlMatch[1];
                problemName = slug.split('-').map(w => 
                    w.charAt(0).toUpperCase() + w.slice(1)
                ).join('');
            }
            const numberMatch = title.match(/^(\d+)/);
            problemNumber = numberMatch ? numberMatch[1] : '0';
        }

        // Extract difficulty - try multiple methods
        let difficulty = 'medium';
        
        // Method 1: Look for difficulty attribute
        let difficultyElement = document.querySelector('[diff]');
        
        // Method 2: Look for class-based difficulty
        if (!difficultyElement) {
            difficultyElement = document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard');
        }
        
        // Method 3: Look for any element containing just difficulty text
        if (!difficultyElement) {
            difficultyElement = Array.from(document.querySelectorAll('div, span')).find(el => {
                const text = el.textContent.toLowerCase().trim();
                return (text === 'easy' || text === 'medium' || text === 'hard') && 
                       el.textContent.length < 10;
            });
        }

        if (difficultyElement) {
            const diffText = difficultyElement.textContent.toLowerCase();
            console.log('🎯 Found difficulty text:', diffText);
            if (diffText.includes('easy')) difficulty = 'easy';
            else if (diffText.includes('hard')) difficulty = 'hard';
            else if (diffText.includes('medium')) difficulty = 'medium';
        } else {
            console.warn('⚠️ Could not find difficulty, using default: medium');
        }

        // Clean problem name
        const cleanName = problemName
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '')
            .trim();

        const result = {
            number: problemNumber,
            name: cleanName || 'Problem',
            difficulty: difficulty,
            fullTitle: title
        };

        console.log('✅ Extracted problem info:', result);
        return result;
        
    } catch (error) {
        console.error('❌ Error extracting problem info:', error);
        return null;
    }
}

// Extract code from Monaco editor
function extractCode() {
    console.log('💻 Attempting to extract code...');
    
    try {
        // Method 1: Monaco API (most reliable)
        if (window.monaco && window.monaco.editor) {
            console.log('🔍 Trying Monaco API...');
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
                const code = models[0].getValue();
                if (code && code.trim().length > 0) {
                    console.log('✅ Code extracted via Monaco API (' + code.length + ' chars)');
                    return code;
                }
            }
        }

        // Method 2: View lines
        console.log('🔍 Trying view-line extraction...');
        const viewLines = document.querySelectorAll('.view-line');
        if (viewLines.length > 0) {
            const lines = Array.from(viewLines).map(line => line.textContent);
            const code = lines.join('\n');
            if (code && code.trim().length > 0) {
                console.log('✅ Code extracted via view lines (' + code.length + ' chars)');
                return code;
            }
        }

        // Method 3: Textarea
        console.log('🔍 Trying textarea fallback...');
        const textarea = document.querySelector('textarea');
        if (textarea && textarea.value) {
            console.log('✅ Code extracted via textarea (' + textarea.value.length + ' chars)');
            return textarea.value;
        }

        console.error('❌ Could not extract code');
        return null;
        
    } catch (error) {
        console.error('❌ Error extracting code:', error);
        return null;
    }
}

// Detect programming language
function detectLanguage() {
    console.log('🔤 Detecting language...');
    
    try {
        // Look for language button
        const languageButton = document.querySelector('[id*="headlessui-listbox-button"]') ||
            document.querySelector('button[id^="headlessui-listbox-button"]') ||
            Array.from(document.querySelectorAll('button')).find(btn => 
                btn.textContent.match(/C\+\+|Java|Python|JavaScript|TypeScript|Go|Rust|C#|Ruby|Swift|Kotlin|Scala|PHP|C(?!\+)/i)
            );

        if (languageButton) {
            const langText = languageButton.textContent.toLowerCase().trim();
            console.log('🔤 Found language button text:', langText);

            const languageMap = {
                'c++': 'cpp', 'cpp': 'cpp', 'c': 'c',
                'java': 'java', 'python': 'py', 'python3': 'py',
                'javascript': 'js', 'typescript': 'ts',
                'c#': 'cs', 'csharp': 'cs',
                'go': 'go', 'golang': 'go',
                'rust': 'rs', 'kotlin': 'kt',
                'swift': 'swift', 'ruby': 'rb',
                'scala': 'scala', 'php': 'php',
                'mysql': 'sql', 'mssql': 'sql',
                'oracle': 'sql', 'postgresql': 'sql'
            };

            for (const [key, ext] of Object.entries(languageMap)) {
                if (langText.includes(key)) {
                    console.log('✅ Detected:', key, '→', ext);
                    return ext;
                }
            }
        }

        console.warn('⚠️ Using default: cpp');
        return 'cpp';
        
    } catch (error) {
        console.error('❌ Error detecting language:', error);
        return 'cpp';
    }
}

// Monitor submit button
function monitorSubmitButton() {
    console.log('👀 Setting up submit button monitor...');
    
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
            console.log('✅ Submit button found and monitored');
            
            submitButton.addEventListener('click', async () => {
                console.log('🔔 SUBMIT BUTTON CLICKED!');
                isSubmitting = true;
                
                // Small delay to let Monaco update
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const currentCode = extractCode();
                const currentLang = detectLanguage();
                const currentProblem = await extractProblemInfo();
                
                console.log('📦 Captured:', {
                    hasCode: !!currentCode,
                    hasLang: !!currentLang,
                    hasProblem: !!currentProblem,
                    codeLength: currentCode?.length || 0
                });
                
                if (currentCode && currentLang && currentProblem) {
                    sessionStorage.setItem('leetcode_pending_code', currentCode);
                    sessionStorage.setItem('leetcode_pending_language', currentLang);
                    sessionStorage.setItem('leetcode_pending_problem', JSON.stringify(currentProblem));
                    console.log('💾 Saved to sessionStorage');
                } else {
                    console.error('❌ Missing data on submit!');
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
    console.log('👀 Setting up submission monitor...');
    
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
                    console.log('🎉 ACCEPTED DETECTED!');
                    
                    setTimeout(async () => {
                        console.log('⏱️ Processing...');
                        
                        let code = sessionStorage.getItem('leetcode_pending_code');
                        let language = sessionStorage.getItem('leetcode_pending_language');
                        let problemJson = sessionStorage.getItem('leetcode_pending_problem');
                        
                        let problemInfo = null;
                        if (problemJson) {
                            try {
                                problemInfo = JSON.parse(problemJson);
                            } catch (e) {
                                console.error('Parse error:', e);
                            }
                        }
                        
                        // Fallback extraction
                        if (!problemInfo) problemInfo = await extractProblemInfo();
                        if (!code) code = extractCode();
                        if (!language) language = detectLanguage();

                        if (problemInfo && code && language) {
                            const submissionData = {
                                ...problemInfo,
                                code: code,
                                language: language,
                                timestamp: new Date().toISOString()
                            };

                            console.log('📤 Sending:', {
                                problem: submissionData.fullTitle,
                                number: submissionData.number,
                                difficulty: submissionData.difficulty,
                                language: language
                            });

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

                            sessionStorage.removeItem('leetcode_pending_code');
                            sessionStorage.removeItem('leetcode_pending_language');
                            sessionStorage.removeItem('leetcode_pending_problem');
                        } else {
                            console.error('❌ Missing data:', {
                                problem: !!problemInfo,
                                code: !!code,
                                lang: !!language
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

// Initialize with retries
async function init() {
    console.log('🔧 Initializing... (attempt ' + (initAttempts + 1) + ')');
    
    const problemInfo = await extractProblemInfo();
    
    if (problemInfo) {
        console.log('🎯 Monitoring:', problemInfo.fullTitle);
        monitorSubmitButton();
        monitorSubmissions();
        console.log('✅ Initialization complete!');
        return true;
    } else {
        initAttempts++;
        if (initAttempts < MAX_INIT_ATTEMPTS) {
            console.log('⏳ Retrying in 2s...');
            setTimeout(init, 2000);
        } else {
            console.error('❌ Max init attempts reached');
        }
        return false;
    }
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init, 1000);
    });
} else {
    setTimeout(init, 1000);
}

// Handle SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('/problems/')) {
            console.log('🔄 Page changed, reinitializing...');
            isSubmitting = false;
            lastSubmittedCode = null;
            initAttempts = 0;
            setTimeout(init, 1500);
        }
    }
}).observe(document, { subtree: true, childList: true });

console.log('✅ Content script ready');