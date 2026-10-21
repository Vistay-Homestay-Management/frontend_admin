# ViStay Admin Applications

Admin web portal and Expo React Native mobile application.

This repository is part of the ViStay Homestay Management platform. Epic 1 establishes a buildable, testable application shell and platform integrations; domain workflows are delivered by their owning epics.

```powershell
npm install
npm run dev:web
npm run dev:mobile
```

The web client uses Apollo Federation through Gateway. Mobile is an Expo 58
workspace and shares transport types through `packages/api-client`.
