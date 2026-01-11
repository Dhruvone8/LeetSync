// Background service worker - FIXED

const GITHUB_API_BASE = 'https://api.github.com';

console.log('🚀 Background worker started');

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Message:', request.type);

    if (request.type === 'SOLUTION_SUBMITTED') {
        console.log('📦 Solution data:', request.data);
        handleSolutionSubmission(request.data);
        sendResponse({ status: 'received' });
    }

    return true;
});

// Handle solution submission
async function handleSolutionSubmission(submissionData) {
    console.log('🔄 Processing...');

    try {
        const { github_token, github_repo } = await chrome.storage.local.get([
            'github_token',
            'github_repo'
        ]);

        console.log('🔑 Config check:', {
            hasToken: !!github_token,
            repo: github_repo
        });

        if (!github_token || !github_repo) {
            console.warn('⚠️ GitHub not configured');
            await storeSolutionLocally(submissionData);
            return;
        }

        // Ensure folders exist first
        console.log('📁 Ensuring folders...');
        await ensureFoldersExist(github_token, github_repo);

        // Sync to GitHub
        console.log('🔄 Syncing to GitHub...');
        await syncToGitHub(submissionData, github_token, github_repo);

    } catch (error) {
        console.error('❌ Error:', error);
        await storeSolutionLocally(submissionData);
    }
}

// Store locally
async function storeSolutionLocally(submissionData) {
    console.log('💾 Storing locally...');
    const { pending_syncs = [] } = await chrome.storage.local.get('pending_syncs');
    pending_syncs.push(submissionData);
    await chrome.storage.local.set({ pending_syncs });
    console.log('✅ Stored. Pending:', pending_syncs.length);

    chrome.action.setBadgeText({ text: pending_syncs.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#1e3a8a' });
}

// Sync to GitHub
async function syncToGitHub(submissionData, token, repo) {
    const { number, name, difficulty, code, language, fullTitle } = submissionData;

    console.log('📝 Preparing file:');
    console.log('  Number:', number);
    console.log('  Name:', name);
    console.log('  Difficulty:', difficulty);
    console.log('  Language:', language);

    // Generate filename: Number-Name.extension
    const filename = `${number}-${name}.${language}`;
    const normalizedDifficulty = difficulty.toLowerCase();
    const path = `${normalizedDifficulty}/${filename}`;


    console.log('📄 Path:', path);

    // Add header
    const commentStart = getCommentSyntax(language);
    const header = `${commentStart.start}
 * Problem: ${fullTitle}
 * Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
 * Date: ${new Date(submissionData.timestamp).toLocaleDateString()}
 ${commentStart.end}

`;
    const fullCode = header + code;

    try {
        // Check if file exists
        console.log('🔍 Checking if file exists...');
        const checkUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;

        const checkResponse = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'LeetCode-Sync-Extension'
            }
        });

        let sha = null;
        let isUpdate = false;

        if (checkResponse.ok) {
            const fileData = await checkResponse.json();
            sha = fileData.sha;
            isUpdate = true;
            console.log('📝 File exists, updating. SHA:', sha);
        } else if (checkResponse.status === 404) {
            console.log('📄 File does not exist, creating new');
        } else {
            const errorText = await checkResponse.text();
            console.error('❌ Check failed:', checkResponse.status, errorText);
        }

        // Create or update
        const updateUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
        const message = isUpdate
            ? `Updated Code`
            : `Add solution: ${number} - ${fullTitle}`;

        console.log('📤 Commit message:', message);
        console.log('🚀 Uploading...');

        const body = {
            message,
            content: btoa(unescape(encodeURIComponent(fullCode))),
            branch: 'main'
        };

        if (sha) {
            body.sha = sha;
        }

        const response = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                'User-Agent': 'LeetCode-Sync-Extension'
            },
            body: JSON.stringify(body)
        });

        console.log('📡 Response:', response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ GitHub error:', errorData);
            throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
        }

        const responseData = await response.json();
        console.log('✅ Success!', responseData.content.html_url);

        // Update storage
        await chrome.storage.local.set({
            last_sync: new Date().toISOString(),
            last_synced_file: filename
        });

        // Show notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: isUpdate ? 'Solution Updated' : 'Solution Synced',
            message: `${filename} ${isUpdate ? 'updated' : 'synced'}`,
            priority: 2
        });

        console.log('🎉 Complete!');
        return true;

    } catch (error) {
        console.error('❌ Sync error:', error);
        await storeSolutionLocally(submissionData);

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Sync Failed',
            message: `Failed to sync. Stored locally.`,
            priority: 2
        });

        return false;
    }
}

// Get comment syntax
function getCommentSyntax(extension) {
    const map = {
        'cpp': { start: '/*', end: '*/' },
        'java': { start: '/*', end: '*/' },
        'c': { start: '/*', end: '*/' },
        'cs': { start: '/*', end: '*/' },
        'js': { start: '/*', end: '*/' },
        'ts': { start: '/*', end: '*/' },
        'go': { start: '/*', end: '*/' },
        'rs': { start: '/*', end: '*/' },
        'swift': { start: '/*', end: '*/' },
        'kt': { start: '/*', end: '*/' },
        'scala': { start: '/*', end: '*/' },
        'php': { start: '/*', end: '*/' },
        'py': { start: '"""', end: '"""' },
        'rb': { start: '=begin', end: '=end' },
        'sql': { start: '/*', end: '*/' },
    };

    return map[extension] || { start: '/*', end: '*/' };
}

// Ensure folders exist
async function ensureFoldersExist(token, repo) {
    console.log('📁 Checking folders...');
    const folders = ['easy', 'medium', 'hard'];

    for (const folder of folders) {
        try {
            console.log(`📂 Checking ${folder}...`);
            const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}`;

            const checkResponse = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'LeetCode-Sync-Extension'
                }
            });

            if (checkResponse.ok) {
                console.log(`✅ ${folder} exists`);
                continue;
            }

            if (checkResponse.status === 404) {
                console.log(`📝 Creating ${folder}...`);
                const readmeUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}/README.md`;
                const content = `# ${folder.charAt(0).toUpperCase() + folder.slice(1)} Problems\n\nLeetCode problems of ${folder} difficulty.`;

                const createResponse = await fetch(readmeUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'LeetCode-Sync-Extension'
                    },
                    body: JSON.stringify({
                        message: `Create ${folder} folder`,
                        content: btoa(content),
                        branch: 'main'
                    })
                });

                if (createResponse.ok) {
                    console.log(`✅ Created ${folder}`);
                } else {
                    const errorData = await createResponse.json();
                    console.error(`❌ Failed to create ${folder}:`, errorData);
                }
            }
        } catch (error) {
            console.error(`❌ Error with ${folder}:`, error);
        }
    }
    console.log('✅ Folder check complete');
}

// Listen for storage changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        console.log('🔄 Storage changed');

        if (changes.github_token || changes.github_repo) {
            const { github_token, github_repo } = await chrome.storage.local.get([
                'github_token',
                'github_repo'
            ]);

            if (github_token && github_repo) {
                console.log('🔑 GitHub configured, creating folders...');
                await ensureFoldersExist(github_token, github_repo);
            }
        }
    }
});

console.log('✅ Background ready');