# Security Policy

vetguard is a security tool, so its own integrity matters. Thank you for
helping keep it trustworthy.

## Reporting a vulnerability

Please report security issues privately, not as public GitHub issues.

- Use GitHub's **private vulnerability reporting**: the "Report a
  vulnerability" button under the repository's Security tab.
- Include a description, affected version or commit, reproduction steps, and
  impact. A minimal proof of concept helps.

You can expect an acknowledgement within a few days. We will work with you on a
fix and coordinated disclosure, and credit you in the release notes unless you
prefer to remain anonymous.

## Scope

In scope: flaws in vetguard itself, for example code execution while scanning a
crafted package, path traversal during tarball inspection, cache poisoning,
denial of service from malformed input, or a detector that can be silently
bypassed.

Out of scope: vulnerabilities in third-party packages that vetguard scans (that
is the tool working as intended), and issues in dependencies that do not affect
vetguard's behaviour.

## Handling malicious-package details

If your report involves a specific malicious package in the wild, do not post
package contents or working payloads publicly. Share them through the private
channel above so we can add detection without publishing a how-to.
