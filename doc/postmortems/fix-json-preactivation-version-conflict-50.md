# Fix JSON Preactivation Version Conflict

## What went right

The reported boot failure reproduced locally by requiring JSON before Bundler setup. That made the mismatch clear: Ruby activated JSON 3.0.2 while the lockfile still required 3.0.0. Updating the lockfile to JSON 3.0.2 fixed the boot path without changing the application's JSON constraint or compatibility shim. Rails was checked against the current gem index and remained on the latest available release, 8.1.3.1.

The change stayed focused, retained the Bundler 2.5 lockfile footer needed by the deployment toolchain, and passed the complete supported test suite: 125 runs and 715 assertions with no failures.

## What went wrong

The existing dependency boot test gave false confidence. It explicitly selected JSON 3.0.0, which was the same version as the lockfile, and inherited Bundler's environment from the parent test process. As a result, it did not model the failing sequence where the host Ruby runtime loads its newer JSON gem before the application initializes Bundler.

The dependency refresh that introduced JSON 3 compatibility was correct for the runtime available at that time, but pinning the smoke test to that exact version made it unable to detect a later runtime/lockfile drift.

## Final thoughts

Dependency boot coverage should reproduce activation order, not merely assert known version strings. The regression test now removes the inherited Bundler environment, lets Ruby activate JSON naturally, boots Rails, performs a representative Active Support JSON decode, and compares the resulting versions with the checked-in lockfile. This will fail at the boundary that matters if a future runtime-provided JSON version diverges from the deployable bundle.
