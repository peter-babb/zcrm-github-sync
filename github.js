// Your existing GitHub logic, refactored as an importable function
// Drop your scripts array and API calls in here

import { request } from '@octokit/request';

export async function syncScriptsToRepo({ repoName, accountName, token })
{
    const requestWithAuth = request.defaults({
        headers: {
            authorization: `token ${token}`
        }
    });

    // --- Find or create repo ---
    const resp = await requestWithAuth('GET /user/repos', {
        per_page: 100,
        type: 'all'
    });

    let thisRepo = resp.data.find((repo) => repo.name.includes(repoName));

    if (!thisRepo)
    {
        console.log('Creating new repo... 👶');
        const fullRepoName = `${repoName} - ${accountName}`;
        const createResp = await requestWithAuth('POST /user/repos', {
            name: fullRepoName,
            private: true,
            auto_init: true
        });
        thisRepo = createResp.data;
    }

    // --- Get existing files ---
    let existingFiles = new Set();
    try
    {
        const treeResp = await requestWithAuth('GET /repos/{owner}/{repo}/git/trees/HEAD', {
            owner: thisRepo.owner.login,
            repo: thisRepo.name,
            recursive: '1'
        });
        for (const item of treeResp.data.tree)
        {
            if (item.type === 'blob') existingFiles.add(item.path);
        }
    }
    catch (err)
    {
        console.log('Could not fetch existing files:', err.message);
    }

    // --- TODO: import or define your scripts array here ---
    const scripts = [
        // paste your scripts array here, or import it from a separate file
    ];

    // --- Create or update each file ---
    for (const script of scripts)
    {
        const firstLine = script.split('\n')[0];
        const match = firstLine.match(/\b(\w+\.\w+)\(/);
        const fileName = match ? `${match[1]}.ds` : `script_${Date.now()}.ds`;
        const contentBase64 = Buffer.from(script).toString('base64');

        if (existingFiles.has(fileName))
        {
            const fileResp = await requestWithAuth('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: thisRepo.owner.login,
                repo: thisRepo.name,
                path: fileName
            });

            await requestWithAuth('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: thisRepo.owner.login,
                repo: thisRepo.name,
                path: fileName,
                message: `Update ${fileName}`,
                content: contentBase64,
                sha: fileResp.data.sha
            });
        }
        else
        {
            await requestWithAuth('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: thisRepo.owner.login,
                repo: thisRepo.name,
                path: fileName,
                message: `Add ${fileName}`,
                content: contentBase64
            });
            existingFiles.add(fileName);
        }
    }

    console.log('Done! ✅');
}
