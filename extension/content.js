console.log('🚀 LeetCode Sync content script loaded');

let isSubmitting = false;
let lastHash = null;

// 🔹 Monaco extraction via background
async function extractCodeFromMonaco() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: 'EXECUTE_MONACO_EXTRACT' },
            (res) => resolve(res?.code || null)
        );
    });
}

async function extractCode() {
    const code = await extractCodeFromMonaco();
    return code;
}

// 🔹 Extract problem info
async function extractProblemInfo() {
    const titleEl = document.querySelector('[data-cy="question-title"]');
    if (!titleEl) return null;

    const title = titleEl.textContent.trim();
    const [num, ...rest] = title.split('.');
    const name = rest.join('.')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    let difficulty = 'medium';
    const diffEl = document.querySelector('[diff]');
    if (diffEl) difficulty = diffEl.textContent.toLowerCase();

    return {
        number: num.trim(),
        name,
        difficulty,
        fullTitle: title
    };
}

// 🔹 Detect language
function detectLanguage() {
    const btns = Array.from(document.querySelectorAll('button'));

    const btn = btns.find(b =>
        /c\+\+|python|java|javascript|typescript|go|rust|kotlin|swift/i.test(b.textContent)
    );

    if (!btn) return 'cpp';

    const text = btn.textContent.toLowerCase().replace(/\(.*?\)/g, '');

    const map = {
        'c++': 'cpp',
        'python': 'py',
        'python3': 'py',
        'java': 'java',
        'javascript': 'js',
        'typescript': 'ts',
        'go': 'go',
        'rust': 'rs',
        'kotlin': 'kt',
        'swift': 'swift'
    };

    for (const k in map) {
        if (text.includes(k)) return map[k];
    }

    return 'cpp';
}

// 🔹 Watch submit
function monitorSubmit() {
    const observer = new MutationObserver(() => {
        const btn = document.querySelector('button[data-e2e-locator="console-submit-button"]');
        if (!btn || btn.dataset.bound) return;

        btn.dataset.bound = 'true';

        btn.addEventListener('click', async () => {
            isSubmitting = true;
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// 🔹 Watch Accepted
function monitorAccepted() {
    const observer = new MutationObserver(async (mutations) => {
        if (!isSubmitting) return;

        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.textContent?.includes('Accepted')) {
                    setTimeout(async () => {
                        const code = await extractCode();
                        if (!code) return;

                        const hash = btoa(code).slice(0, 40);
                        if (hash === lastHash) return;
                        lastHash = hash;

                        const problem = await extractProblemInfo();
                        const language = detectLanguage();

                        chrome.runtime.sendMessage({
                            type: 'SOLUTION_SUBMITTED',
                            data: {
                                ...problem,
                                code,
                                language,
                                timestamp: new Date().toISOString()
                            }
                        });

                        isSubmitting = false;
                    }, 1500);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// INIT
monitorSubmit();
monitorAccepted();
