# Final QA Shortlist

Run this exact short QA before recording/submission.

## Clean start

- [ ] Launch Luna
- [ ] Complete or skip onboarding
- [ ] Confirm header shows model/fallback, external requests, CPU/RAM
- [ ] Click floating orb and open command palette

## One-click paths

- [ ] AI Presenter → Run first step
- [ ] Judge Showcase → Run full showcase

## Critical proof features

- [ ] Job Mission generates PDF/DOCX/ZIP
- [ ] Artifact Studio generates PPTX/PDF/HTML/ZIP
- [ ] Automation moves files and undo restores them
- [ ] Trust Center shows audit log
- [ ] Trust Center exports trust ZIP including `luna.db`
- [ ] Delete/reset local data works

## Fallback checks

- [ ] App runs without Ollama
- [ ] Model Inspector fallback drill works
- [ ] Voice transcript mode works even if speech recognition fails

## Packaging checks

- [ ] `npm run build`
- [ ] `npm run dist:win-dir`
- [ ] On Windows: `npm run dist`
- [ ] Installer/portable app launches
- [ ] SmartScreen warning instructions are ready
