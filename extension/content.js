// Content script to monitor LeetCode submissions - DEBUG VERSION

let lastSubmittedCode = null;
let isSubmitting = false;

console.log('🚀 LeetCode GitHub Sync Extension Loaded');

// Extract problem information from the page
function extractProblemInfo() {
    console.log('📋 Attempting to extract problem info...');
    try {
        // Try multiple selectors
        const titleElement = document.querySelector('[data-cy="question-title"]') ||
            document.querySelector('.text-title-large') ||
            document.querySelector('div[class*="text-title"]') ||
            document.querySelector('a[href*="/problems/"]');
        
        if (!titleElement) {
            console.error('❌ Could not find title element');
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
            // Try to extract from URL
            const urlMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
            if (urlMatch) {
                const slug = urlMatch[1];
                problemName = slug.split('-').map(w => 
                    w.charAt(0).toUpperCase() + w.slice(1)
                ).join('');
                
                // Try to find number in page
                const numberMatch = title.match(/^(\d+)/);
                problemNumber = numberMatch ? numberMatch[1] : '0';
            }
        }

        // Extract difficulty
        let difficulty = 'medium';
        
        // Try multiple selectors for difficulty
        const difficultyElement = document.querySelector('[diff]') ||
            document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
            document.querySelector('[class*="difficulty"]') ||
            Array.from(document.querySelectorAll('div')).find(el => {
                const text = el.textContent.toLowerCase();
                return (text === 'easy' || text === 'medium' || text === 'hard') && 
                       el.textContent.length < 10;
            });

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

// Extract the code from the editor
function extractCode() {
    console.log('💻 Attempting to extract code...');
    try {
        // Method 1: Monaco API
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
        } else {
            console.log('⚠️ Monaco editor not available');
        }

        // Method 2: View lines
        console.log('🔍 Trying view-line extraction...');
        const viewLines = document.querySelectorAll('.view-line');
        console.log('Found', viewLines.length, 'view lines');
        
        if (viewLines.length > 0) {
            const lines = Array.from(viewLines).map(line => {
                return line.textContent;
            });
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

        console.error('❌ Could not extract code from any method');
        return null;
    } catch (error) {
        console.error('❌ Error extracting code:', error);
        return null;
    }
}

// Detect language from the editor
function detectLanguage() {
    console.log('🔤 Attempting to detect language...');
    try {
        // Multiple selectors for language button
        const languageButton = document.querySelector('[id*="headlessui-listbox-button"]') ||
            document.querySelector('button[class*="rounded"]') ||
            document.querySelector('[class*="lang"]') ||
            Array.from(document.querySelectorAll('button')).find(btn => 
                btn.textContent.match(/C\+\+|Java|Python|JavaScript|TypeScript/i)
            );

        if (languageButton) {
            const langText = languageButton.textContent.toLowerCase().trim();
            console.log('🔤 Found language text:', langText);

            const languageMap = {
                'c++': 'cpp',
                'cpp': 'cpp',
                'c': 'c',
                'java': 'java',
                'python': 'py',
                'python3': 'py',
                'javascript': 'js',
                'typescript': 'ts',
                'c#': 'cs',
                'csharp': 'cs',
                'go': 'go',
                'golang': 'go',
                'rust': 'rs',
                'kotlin': 'kt',
                'swift': 'swift',
                'ruby': 'rb',
                'scala': 'scala',
                'php': 'php',
                'mysql': 'sql',
                'mssql': 'sql',
                'oracle': 'sql',
                'postgresql': 'sql'
            };

            for (const [key, ext] of Object.entries(languageMap)) {
                if (langText.includes(key)) {
                    console.log('✅ Detected language:', key, '-> extension:', ext);
                    return ext;
                }
            }
        }

        console.warn('⚠️ Could not detect language, using default: txt');
        return 'txt';
    } catch (error) {
        console.error('❌ Error detecting language:', error);
        return 'txt';
    }
}

// Monitor for submit button clicks
function monitorSubmitButton() {
    console.log('👀 Setting up submit button monitor...');
    
    const observer = new MutationObserver(() => {
        const submitButton = document.querySelector('button[data-e2e-locator="console-submit-button"]') ||
            Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.trim().toLowerCase() === 'submit'
            );

        if (submitButton && !submitButton.dataset.monitored) {
            submitButton.dataset.monitored = 'true';
            console.log('✅ Submit button found and monitored');
            
            submitButton.addEventListener('click', () => {
                console.log('🔔 SUBMIT BUTTON CLICKED!');
                isSubmitting = true;
                
                // Capture everything immediately
                const currentCode = extractCode();
                const currentLang = detectLanguage();
                const currentProblem = extractProblemInfo();
                
                console.log('📦 Captured data:', {
                    hasCode: !!currentCode,
                    hasLang: !!currentLang,
                    hasProblem: !!currentProblem,
                    codeLength: currentCode?.length || 0,
                    language: currentLang,
                    problem: currentProblem?.fullTitle
                });
                
                if (currentCode && currentLang && currentProblem) {
                    sessionStorage.setItem('leetcode_pending_code', currentCode);
                    sessionStorage.setItem('leetcode_pending_language', currentLang);
                    sessionStorage.setItem('leetcode_pending_problem', JSON.stringify(currentProblem));
                    console.log('💾 Data saved to sessionStorage');
                } else {
                    console.error('❌ Missing required data on submit!');
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Listen for successful submissions
function monitorSubmissions() {
    console.log('👀 Setting up submission result monitor...');
    
    const observer = new MutationObserver((mutations) => {
        if (!isSubmitting) return;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    const textContent = node.textContent || '';
                    
                    // Check for "Accepted"
                    const isAccepted = textContent.includes('Accepted') ||
                        node.querySelector('[class*="text-green"]')?.textContent?.includes('Accepted') ||
                        node.querySelector('[class*="success"]')?.textContent?.includes('Accepted');

                    if (isAccepted) {
                        console.log('🎉 ACCEPTED SOLUTION DETECTED!');

                        setTimeout(() => {
                            console.log('⏱️ Processing accepted solution...');
                            
                            const code = sessionStorage.getItem('leetcode_pending_code');
                            const language = sessionStorage.getItem('leetcode_pending_language');
                            const problemJson = sessionStorage.getItem('leetcode_pending_problem');
                            
                            console.log('📦 Retrieved from sessionStorage:', {
                                hasCode: !!code,
                                hasLanguage: !!language,
                                hasProblem: !!problemJson
                            });
                            
                            let problemInfo = null;
                            if (problemJson) {
                                try {
                                    problemInfo = JSON.parse(problemJson);
                                } catch (e) {
                                    console.error('Error parsing problem JSON:', e);
                                }
                            }

                            if (problemInfo && code && language) {
                                const submissionData = {
                                    ...problemInfo,
                                    code: code,
                                    language: language,
                                    timestamp: new Date().toISOString()
                                };

                                console.log('📤 Preparing to send to background script:', {
                                    problem: submissionData.fullTitle,
                                    number: submissionData.number,
                                    name: submissionData.name,
                                    difficulty: submissionData.difficulty,
                                    language: submissionData.language,
                                    codeLength: submissionData.code.length
                                });

                                // Check for duplicates
                                const codeHash = btoa(unescape(encodeURIComponent(code))).slice(0, 50);
                                if (codeHash !== lastSubmittedCode) {
                                    lastSubmittedCode = codeHash;

                                    console.log('🚀 Sending message to background script...');
                                    
                                    // Send to background script
                                    chrome.runtime.sendMessage({
                                        type: 'SOLUTION_SUBMITTED',
                                        data: submissionData
                                    }, (response) => {
                                        if (chrome.runtime.lastError) {
                                            console.error('❌ Message error:', chrome.runtime.lastError);
                                        } else {
                                            console.log('✅ Message sent successfully!', response);
                                        }
                                    });
                                } else {
                                    console.log('⏭️ Duplicate submission detected, skipping');
                                }

                                // Clear session storage
                                sessionStorage.removeItem('leetcode_pending_code');
                                sessionStorage.removeItem('leetcode_pending_language');
                                sessionStorage.removeItem('leetcode_pending_problem');
                                console.log('🧹 Cleared sessionStorage');
                            } else {
                                console.error('❌ Missing required data:', {
                                    hasProblemInfo: !!problemInfo,
                                    hasCode: !!code,
                                    hasLanguage: !!language
                                });
                            }

                            isSubmitting = false;
                        }, 2000);
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize
function init() {
    console.log('🔧 Initializing LeetCode GitHub Sync...');
    const currentProblem = extractProblemInfo();
    if (currentProblem) {
        console.log('🎯 Monitoring problem:', currentProblem.fullTitle);
    }
    monitorSubmitButton();
    monitorSubmissions();
    console.log('✅ Initialization complete!');
}

// Start when ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
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
            console.log('🔄 Page navigation detected, reinitializing...');
            isSubmitting = false;
            lastSubmittedCode = null;
            setTimeout(init, 1500);
        }
    }
}).observe(document, { subtree: true, childList: true });

console.log('✅ Content script fully loaded and running');