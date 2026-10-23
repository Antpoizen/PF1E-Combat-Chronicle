# Combat Chronicle — GitHub deployment

Repository: https://github.com/Antpoizen/PF1E-Combat-Chronicle

The GitHub Actions workflow automatically creates a versioned release on pushes to main. The release includes `module.json` and `combat-chronicle.zip`.

Foundry Install Module Manifest URL:

https://github.com/Antpoizen/PF1E-Combat-Chronicle/releases/latest/download/module.json

All releases must match the `module.json` version. The existing older tag `1.0.1` has inconsistent versioning; new releases use `v0.2.8` and later.

If GitHub Actions reports `Resource not accessible by integration`, enable `contents: write` under repository Actions workflow permissions.

Development build: test in a cloned PF1e/Nevela/Armor Soak world before campaign use.
