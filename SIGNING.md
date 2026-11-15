# Code signing — how to remove the Windows SmartScreen warning

Resona's installers are built by GitHub Actions from tagged source, but they are
**not signed**, so Windows shows *"Microsoft Defender SmartScreen prevented an
unrecognized app from starting"* on first run. Signing is the only real fix.
Until then: **More info → Run anyway** (or right-click the .exe → Properties →
Unblock).

The build already supports signing — add the right secrets and the next
release signs itself. Two realistic options for an open-source project:

## Option A — SignPath Foundation (free)

[SignPath Foundation](https://signpath.org) signs open-source projects for
free. Your users see **"SignPath Foundation"** as the publisher.

1. Apply at <https://signpath.org> (Sign up → *Open Source* program).
   Requirements: an OSI license (Resona is MIT ✓), no commercial
   dual-licensing, a public repo.
2. Once approved, create a **SignPath project** for `carlsibug98-spec/Resona`
   with an artifact configuration for `Resona-Setup-*.exe` and a
   **signing policy** (e.g. `release-signing`).
3. Generate a **SignPath API token** and add it as a GitHub secret.
4. Add a signing step to `.github/workflows/desktop.yml` after the
   electron-builder step on the Windows leg:

```yaml
      - name: Sign installer (SignPath)
        if: matrix.name == 'Windows installer'
        uses: SignPath/github-action-signpath-sign@v1
        with:
          api-token:            ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id:      ${{ secrets.SIGNPATH_ORGANIZATION_ID }}
          project-slug:         resona
          signing-policy-slug:  release-signing
          github-artifact-id:   ${{ steps.upload.outputs.artifact-id }}
```

(The exact action version/inputs follow SignPath's docs; the snippet above is
the shape they document. Alternative: upload the built exe to SignPath's
web UI once per release — no CI changes needed.)

## Option B — Certum "Open Source Code Signing" certificate (from ~€25–49/yr)

[Certum](https://shop.certum.eu/open-source-code-signing.html) issues an
**Open Source Code Signing** certificate to individual developers:
cloud version from **€49** (no hardware), **€25** if you already own a
cryptoCertum card+reader. Your users see **"Open Source Developer: your name"**.
It must only sign non-commercial open-source software — that's Resona.

1. Buy the certificate and complete the identity verification.
2. Export/collect the certificate as a **PFX file**.
3. Base64-encode it and add two GitHub repository secrets
   (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `WINDOWS_CSC_LINK` | base64 of the .pfx file (`base64 -w0 cert.pfx`) |
   | `WINDOWS_CSC_KEY_PASSWORD` | the PFX password |

That's it — `.github/workflows/desktop.yml` already passes
`CSC_LINK` / `CSC_KEY_PASSWORD` to electron-builder, which signs the
installer automatically whenever the secrets exist. No secret set → the build
stays unsigned, exactly as today.

Notes:

- New OV-style certificates (both options) build SmartScreen **reputation over
  time** — the warning may not disappear for every user on day one, but it
  fades as downloads accumulate. Only EV certificates skip the reputation
  ramp-up, and those cost $200+/year.
- Certum cloud certificates use their own timestamp server; if you need to
  override, set `win.rfc3161TimeStampServer` in `desktop/package.json`.
- macOS: `.dmg` builds are unsigned (Apple Developer Program is $99/yr).
  Users right-click → Open the first time, or run
  `xattr -d com.apple.quarantine /Applications/Resona.app`.
- Linux packages are not signed; AppImage/deb don't gate on signatures.
