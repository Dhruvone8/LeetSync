// background.js
const GITHUB_API_BASE = 'https://api.github.com';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SOLUTION_SUBMITTED') {
        console.log('📨 Received submission:', request.data);
        syncToGitHub(request.data);
        sendResponse({ status: 'processing' });
    }
    return true;
});

async function syncToGitHub(data) {
    try {
        const { github_token, github_repo } = await chrome.storage.local.get(['github_token', 'github_repo']);

        if (!github_token || !github_repo) {
            console.warn('⚠️ GitHub not configured');
            return;
        }

        const { number, name, difficulty, code, language } = data;

        // 1. Format Filename: "001-TwoSum.js"
        // Ensure difficulty folder starts with Uppercase
        const folder = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase(); // e.g., "Easy"
        const cleanName = name.replace(/[^a-zA-Z0-9]/g, ''); // Remove spaces/special chars
        const filename = `${number}-${cleanName}.${language}`;
        const path = `${folder}/${filename}`;

        console.log(`🚀 Pushing to: ${path}`);

        // 2. Check if file exists (to get SHA for update)
        let sha = null;
        const getUrl = `${GITHUB_API_BASE}/repos/${github_repo}/contents/${path}`;

        const getResponse = await fetch(getUrl, {
            headers: {
                'Authorization': `Bearer ${github_token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (getResponse.ok) {
            const fileData = await getResponse.json();
            sha = fileData.sha;
        }

        // 3. Prepare Content
        const content = btoa(unescape(encodeURIComponent(code))); // Handle UTF-8 characters
        const message = `Sync: ${number}. ${name} (${difficulty})`;

        // 4. Push File (Create or Update)
        // NOTE: We do NOT specify 'branch'. API will use the default branch (main/master).
        const body = {
            message: message,
            content: content
        };
        if (sha) body.sha = sha;

        const putResponse = await fetch(getUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${github_token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!putResponse.ok) {
            const err = await putResponse.json();
            // Handle "Content creation conflict" (usually means folder doesn't exist in a bare repo)
            if (putResponse.status === 409 || putResponse.status === 404) {
                console.log('📂 Folder might be missing, creating README...');
                await createFolder(github_repo, github_token, folder);
                // Retry sync
                return syncToGitHub(data);
            }
            throw new Error(err.message);
        }

        console.log('✅ Sync Successful');
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'LeetCode Sync Success',
            message: `${filename} pushed to GitHub!`
        });

        // Save sync time
        chrome.storage.local.set({ last_sync: new Date().toISOString() });

    } catch (error) {
        console.error('❌ Sync Failed:', error);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Sync Failed',
            message: error.message
        });
    }
}

async function createFolder(repo, token, folderName) {
    const path = `${folderName}/README.md`;
    const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;

    await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `Create ${folderName} directory`,
            content: btoa(`# ${folderName} Solutions`),
        })
    });
}