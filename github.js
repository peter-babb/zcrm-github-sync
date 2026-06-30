
import { request } from '@octokit/request';

export async function syncScriptsToRepo({ token, accountName, crmOrgId, cookie, xZcsrfToken, userAgent, domain, org, webContents })
{
    updateFnB(webContents, 'Fetching scripts from Zoho CRM...');
    // Grab the functions general data
    const limit = 200
    const functions = []
    const scripts = [];
    var allFunctionsResp;
    var responseSent = false
    do
    {
        var start = functions.length
        allFunctionsResp = await getFunctionIDs(crmOrgId, cookie, xZcsrfToken, limit, start, domain, userAgent)

        allFunctionsResp = await allFunctionsResp.json();
        // console.log('allFunctionsResp', allFunctionsResp)
        if (allFunctionsResp?.functions)
        {
            functions.push(...allFunctionsResp.functions)
        }
        else
        {
            throw new Error("Unable to retrieve CRM Functions. Please double check your request parameters.");
        }
    }
    while (allFunctionsResp?.functions && allFunctionsResp.functions.length == limit)


    // For each function Grab the function details
    // console.log(functions[0])
    for (const f of functions)
    {
        var functionResp = await getFunctionByID(crmOrgId, cookie, xZcsrfToken, f.id, f.language, f.source, domain, userAgent)

        functionResp = await functionResp.json();
        // console.log('functionResp', functionResp);
        if (!functionResp || !functionResp.functions || !functionResp.functions[0].script) continue;
        scripts.push(
            {
                "id": f.id,
                "name": f.display_name,
                "category": f.category,
                "language": f.language,
                "description": f.description,
                "body": functionResp.functions[0].script
            }
        )
        updateFnB(webContents, `Fetching scripts from Zoho CRM...(${scripts.length}/${functions.length})`);
        // break;
    }
    // webContents.send('status:update', `${scripts.length} scripts found`);
    // console.log(scripts.length, 'scripts found');
    // updateFnB(webContents, `${scripts.length} scripts found`);

    // Set up
    const lastDash = org.lastIndexOf(' - ');
    const orgName = org.slice(0, lastDash);
    const type = org.slice(lastDash + 3); // 'user' or 'org'
    const isUser = (type === 'user');
    // Request URi changes depending on user or org
    const URIs = {
        user: {
            listRepos: "GET /user/repos",
            createRepo: "POST /user/repos",
            listFiles: "GET /repos/{orgName}/{repo}/git/trees/HEAD",
            getFile: "GET /repos/{orgName}/{repo}/contents/{path}",
            putFile: "PUT /repos/{orgName}/{repo}/contents/{path}"
        },
        org: {
            listRepos: "GET /orgs/{orgName}/repos",
            createRepo: "POST /orgs/{orgName}/repos",
            listFiles: "GET /repos/{orgName}/{repo}/git/trees/HEAD",
            getFile: "GET /repos/{orgName}/{repo}/contents/{path}",
            putFile: "PUT /repos/{orgName}/{repo}/contents/{path}"
        }
    }
    const thisUris = isUser ? URIs.user : URIs.org
    console.log({ org, orgName, type, isUser, thisUris });

    const requestWithAuth = request.defaults({
        headers: {
            authorization: `token ${token}`,
            'X-GitHub-Api-Version': '2026-03-10'
        }
    });

    // --- Find or create repo ---
    const resp = await requestWithAuth(thisUris.listRepos, {
        per_page: 100,
        type: 'all',
        orgName
    });

    let thisRepo;

    for (const repo of resp?.data || [])
    {
        if (repo.name.includes(crmOrgId))
        {
            updateFnB(webContents, 'Existing repo found! ' + repo.name);
            thisRepo = repo;
        }
    }

    if (!thisRepo)
    {
        updateFnB(webContents, 'Creating new repo... 👶');
        const fullRepoName = `${crmOrgId} - ${accountName}`;
        const createResp = await requestWithAuth(thisUris.createRepo, {
            name: fullRepoName,
            private: true,
            auto_init: true,
            orgName
        });
        thisRepo = createResp.data;
        updateFnB(webContents, 'Repo created! ', thisRepo.name, '✅');
    }

    // --- Get existing files ---
    let existingFiles = new Set();
    try
    {
        const treeResp = await requestWithAuth('GET /repos/{owner}/{repo}/git/trees/HEAD', {
            owner: thisRepo.owner.login,
            repo: thisRepo.name,
            recursive: '1',
            orgName
        });
        for (const item of treeResp.data.tree)
        {
            if (item.type === 'blob') existingFiles.add(item.path);
        }
        updateFnB(webContents, `Found ${existingFiles.size} existing files in repo`);
    }
    catch (err)
    {
        updateFnB(webContents, 'Could not fetch existing files:', err.message);
    }

    // --- Create or update each file ---
    for (const f of scripts)
    {
        const safeName = sanitizeFileName(f.name);
        const fileName = `${safeName}.${f.language == 'deluge' ? 'ds' : f.language == 'nodejs' ? 'js' : 'java'}`;
        if (!f.body)
        {
            console.log(`Skipping "${fileName}" (function body unavailable)... `);
            continue;
        }


        const contentBase64 = Buffer.from(f.body).toString('base64');

        if (existingFiles.has(fileName))
        {
            // File exists — fetch its SHA (required for updates) then update it
            updateFnB(webContents, `Updating "${fileName}"...`);
            const fileResp = await requestWithAuth('GET /repos/{owner}/{repo}/contents/{path}', {
                owner: thisRepo.owner.login,
                repo: thisRepo.name,
                path: fileName,
                orgName
            });

            await requestWithAuth('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: thisRepo.owner.login,
                repo: thisRepo.name,
                path: fileName,
                message: `Update ${fileName}`,
                content: contentBase64,
                sha: fileResp.data.sha,
                orgName
            });
        }
        else
        {
            // File doesn't exist — create it
            updateFnB(webContents, `Creating "${fileName}"...`);
            await requestWithAuth('PUT /repos/{owner}/{repo}/contents/{path}', {
                owner: thisRepo.owner.login,
                repo: thisRepo.name,
                path: fileName,
                message: `Add ${fileName}`,
                content: contentBase64,
                orgName
            });
            existingFiles.add(fileName);
        }
    }

    updateFnB(webContents, 'Done! ✅');
}

export async function getUserOrgs({ token })
{
    const requestWithAuth = request.defaults({
        headers: {
            authorization: `token ${token}`,
            'X-GitHub-Api-Version': '2026-03-10'
        }
    });

    // Personal account
    const userResp = await requestWithAuth('GET /user');
    const user = userResp.data;
    user.GITHUB_ENDPOINT = 'GET /user';
    // Orgs the user belongs to
    const orgsResp = await requestWithAuth('GET /user/orgs', { per_page: 100 });
    const orgs = orgsResp.data;
    orgs.forEach(org => org.GITHUB_ENDPOINT = 'GET /user/orgs');


    return { orgs: [{ ...user }, ...orgs] };
}

const getFunctionIDs = (orgID, cookie, xZcsrfToken, limit = 200, start = 0, domain, userAgent) =>
{
    return fetch(`https://${domain}/crm/v2/settings/functions?type=org&start=${start}&limit=${limit}`,
        {
            method: "GET",
            headers:
            {
                cookie: cookie,
                "x-zcsrf-token": xZcsrfToken,
                "x-crm-org": orgID,
                "user-agent": userAgent
            }
        })
}

const getFunctionByID = (orgID, cookie, xZcsrfToken, id, language = 'deluge', source = 'crm', domain, userAgent) =>
{
    return fetch(`https://${domain}/crm/v2/settings/functions/${id}?language=${language}&source=${source}`,
        {
            method: "GET",
            headers:
            {
                cookie: cookie,
                "x-zcsrf-token": xZcsrfToken,
                "x-crm-org": orgID,
                "user-agent": userAgent
            }
        });
}

/* update the front end and the console with the message */
function updateFnB(webContents, msg)
{
    console.log(msg);
    webContents.send('status:update', msg);
}

/* Replace slashes (and other path/filesystem-unsafe chars) so they don't create subfolders */
function sanitizeFileName(name)
{
    return (name ?? 'null').replace(/[/\\:*?"<>|]/g, '_');
}