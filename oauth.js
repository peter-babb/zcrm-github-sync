// OAuth device flow for GitHub
// Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow

//const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_ID = "Ov23lim9lYuVIOBBBRnF";
const SCOPE = 'repo';

// Step 1: Request device & user codes from GitHub
export async function startDeviceFlow()
{
    const resp = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE })
    });

    const data = await resp.json();

    console.log(data);

    return {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri, // https://github.com/login/device
        interval: data.interval,                // seconds to wait between polls
        expiresIn: data.expires_in
    };
}

// Step 2: Poll until the user authorizes (or it expires/errors)
export async function pollForToken(deviceCode, interval = 5)
{
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));

    while (true)
    {
        await wait(interval * 1000);

        const resp = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            })
        });

        const data = await resp.json();

        if (data.access_token)
        {
            return data.access_token;
        }

        if (data.error === 'authorization_pending')
        {
            // User hasn't authorized yet — keep polling
            continue;
        }

        if (data.error === 'slow_down')
        {
            // GitHub asked us to slow down — increase interval
            interval += 5;
            continue;
        }

        // Any other error (expired_token, access_denied, etc.) — bail out
        throw new Error(data.error_description || data.error);
    }
}
