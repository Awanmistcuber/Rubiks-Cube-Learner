# Rubiks-Cube-Learner (Kubi Studio)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Play%20Now-brightgreen?style=for-the-badge)](https://awanmistcuber.github.io/Rubiks-Cube-Learner/)
![TypeScript](https://img.shields.io/badge/TypeScript-99.1%25-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Built with Vite](https://img.shields.io/badge/Bundler-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Runtime Bun](https://img.shields.io/badge/Runtime-Bun-FBF0DF?style=for-the-badge&logo=bun&logoColor=black)

An interactive web application to learn, practice, and explore Rubik's Cube solving online. Built primarily with **TypeScript**, **Vite**, and **Bun**, **Kubi Studio** combines 3D cube manipulation, onboarding guidance, mobile touch gestures, daily challenges, and high-resolution snapshot exports.

## Try It Live

Launch the interactive web app directly in your browser—no installation required:

**[https://awanmistcuber.github.io/Rubiks-Cube-Learner/](https://awanmistcuber.github.io/Rubiks-Cube-Learner/)**

### Ways to Interact on the Live App
* **3D Cube Controls:** Rotate cube faces, inspect angles, and practice moves directly in the viewport.
* **Mini-Bar Onboarding & Notation Tooltips:** Follow guided onboarding cues and hover/tap notation tooltips to learn standard cube move notation as you practice.
* **Mobile & Touch Gestures:** Swipe and interact smoothly on touchscreens and mobile browsers.
* **Daily Challenges:** Jump into recurring cube challenges powered by the server logic (`server.ts`).
* **Snapshot Export:** Save clean, high-resolution images of your current cube state.

## App Preview

Visual assets from `public/assets/aistudio/` showcasing the Kubi Studio interface and interactive cube experience:

| View | Preview |
| :--- | :--- |
| **Interactive Cube Workspace** | `![Interactive Cube Workspace](public/assets/aistudio/<workspace-preview>.png)` |
| **Onboarding & Notation Tooltips** | `![Mini-Bar Onboarding and Notation Tooltips](public/assets/aistudio/<onboarding-preview>.png)` |

> Replace `<workspace-preview>.png` and `<onboarding-preview>.png` with the exact file names inside `public/assets/aistudio/`.

## Key Features

* **Interactive 3D Cube Practice:** Manipulate faces and test sequences in real time with responsive browser controls.
* **Mini-Bar Onboarding & Notation Tooltips:** Built-in UI guidance and notation helpers to make learning moves intuitive.
* **Mobile & Touch Gesture Support:** Responsive layout and touch gestures tailored for mobile devices (`index.html` & `src/`).
* **Daily Challenge System:** Backend support in `server.ts` for recurring cube challenges.
* **High-Resolution Snapshot Export:** Export crisp snapshots of cube states for sharing or study.

## Project Structure

```text
Rubiks-Cube-Learner/
├── .github/workflows/       # CI/CD and deployment workflows
├── public/assets/aistudio/  # Visual assets and studio preview media
├── src/                     # Application source code and UI components
├── .env.example             # Environment variable template
├── bun.lock                 # Bun dependency lockfile
├── index.html               # Entry HTML template
├── metadata.json            # App metadata configuration
├── package.json             # Project scripts and dependencies
├── package-lock.json        # npm lockfile
├── server.ts                # Backend / daily challenge server logic
├── tsconfig.json            # TypeScript compiler configuration
└── vite.config.ts           # Vite bundler configuration
