# Prior art: npm vulnerability and supply-chain scanners

Researched 2026-07-21 (web search). Conclusions for scoping; re-verify before
relying on specifics like pricing or accuracy claims.

## The landscape, by capability tier

1. **Known-CVE lookup** (dependency list vs advisory DB). Commoditized:
   `npm audit` (built in), OSV-scanner, Snyk Open Source, Dependabot, Trivy.
   No room to differentiate; table stakes only.
2. **Malicious-package / behavioral detection** (install scripts, obfuscation,
   exfil capability, typosquats). Active market: Socket.dev (commercial,
   free-for-OSS tier, behavioral analysis at PR time), Datadog GuardDog (OSS
   CLI, YARA + metadata heuristics, ~93% F1 on a 2026 benchmark), Datadog
   Supply-Chain Firewall (blocks bad installs at the workstation), Sonatype,
   Aikido, StepSecurity. Crowded but not sewn up on the OSS/local side.
3. **AI-specific supply-chain threats.** Emerging, thinly served:
   - Slopsquatting / hallucinated packages: LLMs recommend nonexistent
     package names; attackers register them. Documented incidents:
     `react-codeshift` (Jan 2026, conflation of jscodeshift + react-codemod),
     `unused-imports` (malicious stand-in for eslint-plugin-unused-imports),
     "HalluSquatting" botnet campaign (Jul 2026). Sonatype measured ~28%
     hallucinated dependency recommendations from a leading LLM; 43% of
     hallucinated names recur deterministically across runs.
   - Prompt injection against coding agents: malicious instructions embedded
     in package READMEs/code that hijack AI agents with repo access
     (Clinejection incident, Feb 2026).
   - CVE scanners cannot catch these: a freshly registered malicious package
     has no advisory history.
4. **SAST on first-party (AI-written) code.** Semgrep, CodeQL, Snyk Code plus
   a wave of AI code-review products. Very crowded; avoid as a core bet.

## Implication for this project

The defensible niche is tier 3 with tier 2 heuristics, local-first: a free,
no-account npm CLI + GitHub Action that scans lockfiles, diffs, and installed
dependencies for hallucination-likelihood, typosquat distance, registry-age
and download anomalies, install-script and capability signals, and
agent-targeting prompt injection. Tier 1 via the free OSV.dev API for
completeness. Direct competitors do parts of this (Socket behind an account,
GuardDog per-package rather than per-project, no PR workflow), but no single
free local tool covers the AI-specific angle end to end as of 2026-07.

## Sources

- https://github.com/DataDog/guarddog
- https://securitylabs.datadoghq.com/articles/learnings-from-recent-npm-compromises/
- https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_slopsquatting-ai-supply-chain_20260419-csa-styled-1.pdf
- https://thehackernews.com/2026/07/new-hallusquatting-attack-could-trick.html
- https://www.techtimes.com/articles/319457/20260701/ai-coding-agents-skip-package-verification-attackers-are-exploiting-it.htm
- https://appsecsanta.com/socket
- https://www.pkgpulse.com/guides/npm-vulnerability-management-snyk-socket-2026
- https://arxiv.org/pdf/2606.13918 (Bayesian-calibrated hallucinated-import detection)
- https://arxiv.org/html/2603.27549v1 (npm malicious-package detection benchmark)
