const GITHUB_API_BASE = 'https://api.github.com';

console.log('🚀 Background worker started');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 🔹 Monaco extraction (MAIN world)
    if (request.type === 'EXECUTE_MONACO_EXTRACT') {
        chrome.scripting.executeScript(
            {
                target: { tabId: sender.tab.id },
                world: 'MAIN',
                func: () => {
                    try {
                        if (!window.monaco?.editor) return null;

                        const editors = window.monaco.editor.getEditors();
                        let longest = '';

                        for (const editor of editors) {
                            const model = editor.getModel();
                            if (!model) continue;
                            const code = model.getValue();
                            if (code.length > longest.length) longest = code;
                        }

                        return longest.length > 20 ? longest : null;
                    } catch {
                        return null;
                    }
                }
            },
            (results) => {
                sendResponse({ code: results?.[0]?.result || null });
            }
        );
        return true;
    }

    // 🔹 Solution submission
    if (request.type === 'SOLUTION_SUBMITTED') {
        handleSolutionSubmission(request.data);
        sendResponse({ status: 'received' });
        return true;
    }
});

async function handleSolutionSubmission(data) {
    try {
        const { github_token, github_repo } = await chrome.storage.local.get([
            'github_token',
            'github_repo'
        ]);

        if (!github_token || !github_repo) {
            console.warn('⚠️ GitHub not configured');
            return;
        }

        await ensureFoldersExist(github_token, github_repo);
        await syncToGitHub(data, github_token, github_repo);

    } catch (err) {
        console.error('❌ Submission error:', err);
    }
}

async function syncToGitHub(data, token, repo) {
    const { number, name, difficulty, code, language } = data;

    const folder = difficulty.toLowerCase();
    const filename = `${number}-${name}.${language}`;
    const path = `${folder}/${filename}`;

    const apiUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;

    let sha = null;

    const check = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (check.ok) {
        const json = await check.json();
        sha = json.sha;
    }

    const body = {
        message: sha ? `Update ${filename}` : `Add ${filename}`,
        content: btoa(unescape(encodeURIComponent(code))),
        branch: 'main'
    };

    if (sha) body.sha = sha;

    const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
    }

    console.log(`✅ Synced: ${path}`);
}

async function ensureFoldersExist(token, repo) {
    const folders = ['easy', 'medium', 'hard'];

    for (const folder of folders) {
        const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}`;

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 404) {
            const readmeUrl = `${url}/README.md`;
            await fetch(readmeUrl, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Create ${folder} folder`,
                    content: btoa(`# ${folder} problems`),
                    branch: 'main'
                })
            });
        }
    }
}
