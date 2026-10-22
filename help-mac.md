“Can’t be opened because Apple cannot check it for malicious software”

Try to open the app once so it gets blocked.
Go to System Settings > Privacy & Security, scroll down, and click Open Anyway next to your app’s name.
Confirm with your password.

(On older macOS, right-click the app > Open also works. Sequoia removed that shortcut.)

“App is damaged and can’t be opened” (common with downloaded or copied builds)
Remove the quarantine flag in Terminal:

bash
xattr -cr /path/to/YourApp.app

Still won’t launch on Apple Silicon
Unsigned arm64 binaries won’t run at all, so give it an ad-hoc signature:

bash
codesign --force --deep --sign - /path/to/YourApp.app